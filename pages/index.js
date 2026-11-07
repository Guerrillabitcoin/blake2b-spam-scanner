import { useState, useEffect } from 'react';

const API_BASE = 'https://mempool.guide/api';

export default function Home() {
  const [blocks, setBlocks] = useState([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [startHeight, setStartHeight] = useState('');
  const [endHeight, setEndHeight] = useState('');
  const [scanned, setScanned] = useState([]);
  const [history, setHistory] = useState([]);
  const [progress, setProgress] = useState('');

  useEffect(() => {
    loadHistory();
    fetchRecentBlocks();
  }, []);

  const loadHistory = async () => {
    try {
      const r = await fetch('/api/history');
      const data = await r.json();
      setHistory(Array.isArray(data) ? data : []);
    } catch (e) {
      console.error(e);
    }
  };

  const saveToHistory = async (items) => {
    if (!items.length) return;
    try {
      await fetch('/api/history', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(items),
      });
      await loadHistory();
    } catch (e) {
      console.error(e);
    }
  };

  const fetchRecentBlocks = async () => {
    try {
      const tipRes = await fetch(`${API_BASE}/blocks/tip/height`);
      const tip = await tipRes.json();
      const height = typeof tip === 'number' ? tip : tip.height || tip;
      const res = await fetch(`${API_BASE}/blocks/${height}`);
      const data = await res.json();
      setBlocks(Array.isArray(data) ? data.slice(0, 8) : []);
    } catch (e) {
      setError('Error al obtener bloques: ' + e.message);
    }
  };

  const analyzeTx = async (txid, height) => {
    try {
      const res = await fetch(`${API_BASE}/tx/${txid}`);
      if (!res.ok) return null;
      const tx = await res.json();

      let maxWitnessItems = 0;
      let totalWitnessBytes = 0;
      let hasMultisigLike = false;
      let pubkeyPushes = 0;
      let hasOpDrop = false;

      for (const vin of tx.vin || []) {
        if (vin.witness && Array.isArray(vin.witness)) {
          maxWitnessItems = Math.max(maxWitnessItems, vin.witness.length);
          for (const w of vin.witness) {
            if (typeof w === 'string') totalWitnessBytes += w.length / 2;
          }
        }
        const asm = (vin.inner_witnessscript_asm || vin.scriptsig_asm || '') + '';
        if (asm.includes('OP_CHECKMULTISIG') || asm.includes('OP_CHECKMULTISIGVERIFY')) hasMultisigLike = true;
        if (asm.includes('OP_DROP')) hasOpDrop = true;
        const matches = asm.match(/OP_PUSHBYTES_33/g);
        if (matches) pubkeyPushes += matches.length;
      }

      const size = tx.size || 0;
      const weight = tx.weight || 0;
      const vinCount = tx.vin?.length || 0;
      const voutCount = tx.vout?.length || 0;

      let type = null;
      let category = 'spam';
      let score = 0;

      if (pubkeyPushes >= 6 || hasMultisigLike) {
        type = 'bpub_or_multisig';
        category = 'image_or_file';
        score += 3;
      }
      if (totalWitnessBytes > 1500 || maxWitnessItems > 4) {
        type = type || 'large_witness';
        category = 'image_or_file';
        score += 2;
      }
      if (hasOpDrop) {
        type = type || 'op_drop';
        score += 1;
      }
      if (size > 2000 || weight > 8000 || voutCount > 15 || vinCount > 25) {
        type = type || 'large_tx';
        score += 1;
      }

      if (score >= 2 || type) {
        return {
          height,
          txid,
          size,
          weight,
          vin: vinCount,
          vout: voutCount,
          type: type || 'possible_data',
          category,
          pubkeyPushes,
          witnessBytes: Math.round(totalWitnessBytes),
          foundAt: Date.now(),
        };
      }
      return null;
    } catch (e) {
      return null;
    }
  };

  const scanRange = async (from, to) => {
    const results = [];
    for (let h = from; h <= to; h++) {
      setProgress(`Escaneando bloque ${h} (${h - from + 1}/${to - from + 1})...`);
      try {
        const blockRes = await fetch(`${API_BASE}/block-height/${h}`);
        const hash = (await blockRes.text()).trim();
        if (!hash || hash.length < 64) continue;

        const txsRes = await fetch(`${API_BASE}/block/${hash}/txs`);
        const txs = await txsRes.json();

        const candidates = (txs || []).filter(tx => {
          const s = tx.size || 0;
          const w = tx.weight || 0;
          const vin = tx.vin?.length || 0;
          const vout = tx.vout?.length || 0;
          return s > 1000 || w > 4000 || vout > 6 || vin > 8;
        });

        for (const tx of candidates) {
          const analyzed = await analyzeTx(tx.txid, h);
          if (analyzed) results.push(analyzed);
          await new Promise(r => setTimeout(r, 60));
        }
      } catch (e) {
        console.warn('Error bloque', h, e);
      }
      await new Promise(r => setTimeout(r, 80));
    }
    return results;
  };

  const progressiveScan = async () => {
    setLoading(true);
    setError('');
    setScanned([]);
    try {
      const tipRes = await fetch(`${API_BASE}/blocks/tip/height`);
      const tip = await tipRes.json();
      const height = typeof tip === 'number' ? tip : tip.height || tip;

      let allResults = [];
      const ranges = [10, 25, 50];
      for (const n of ranges) {
        setProgress(`Barrido progresivo: últimos ${n} bloques...`);
        const from = height - n + 1;
        const batch = await scanRange(from, height);
        allResults = [...batch, ...allResults.filter(r => !batch.find(b => b.txid === r.txid))];
        setScanned(allResults);
        if (allResults.length >= 3) break;
      }

      await saveToHistory(allResults);
      setProgress(`Terminado. Encontradas ${allResults.length} transacciones. Guardadas en historial compartido.`);
    } catch (e) {
      setError('Error: ' + e.message);
    }
    setLoading(false);
  };

  const handleScan = () => {
    const start = parseInt(startHeight);
    const end = parseInt(endHeight);
    if (!start || !end || start > end) {
      setError('Rango inválido');
      return;
    }
    if (end - start > 60) {
      setError('Máximo 60 bloques');
      return;
    }
    setLoading(true);
    scanRange(start, end).then(async results => {
      setScanned(results);
      await saveToHistory(results);
      setProgress(`Terminado. ${results.length} hallazgos.`);
      setLoading(false);
    }).catch(e => {
      setError(e.message);
      setLoading(false);
    });
  };

  return (
    <div style={{ fontFamily: 'system-ui, sans-serif', padding: '20px', maxWidth: '1200px', margin: '0 auto' }}>
      <h1>BLAKE2b Spam / Data Scanner</h1>
      <p>Detecta BPUB, imágenes, vídeos y data embedding. Historial compartido. Barrido progresivo automático.</p>

      <div style={{ margin: '20px 0', padding: '15px', background: '#f5f5f5', borderRadius: '8px' }}>
        <h3>Escanear</h3>
        <button onClick={progressiveScan} disabled={loading} style={{ padding: '8px 16px', marginRight: '8px' }}>
          Barrido progresivo (10→25→50)
        </button>
        <div style={{ marginTop: '12px' }}>
          <input type="number" placeholder="Altura inicio" value={startHeight} onChange={e => setStartHeight(e.target.value)} style={{ marginRight: '8px', padding: '8px', width: '120px' }} />
          <input type="number" placeholder="Altura fin" value={endHeight} onChange={e => setEndHeight(e.target.value)} style={{ marginRight: '8px', padding: '8px', width: '120px' }} />
          <button onClick={handleScan} disabled={loading} style={{ padding: '8px 16px' }}>
            Escanear rango
          </button>
        </div>
        {progress && <div style={{ marginTop: '10px', fontSize: '0.9em' }}>{progress}</div>}
      </div>

      {error && <div style={{ color: 'red', margin: '10px 0' }}>{error}</div>}

      <h2>Resultados de este escaneo ({scanned.length})</h2>
      {scanned.length === 0 && !loading && <p>Ningún resultado. Prueba el barrido progresivo.</p>}
      <SpamList items={scanned} />

      <h2 style={{ marginTop: '40px' }}>Historial compartido ({history.length})</h2>
      {history.length === 0 && <p>El historial está vacío.</p>}
      <SpamList items={history} />

      <h2 style={{ marginTop: '40px' }}>Últimos bloques</h2>
      <ul>
        {blocks.map(b => (
          <li key={b.id || b.height}>
            Altura {b.height} — {b.tx_count} txs — {new Date((b.timestamp || 0) * 1000).toLocaleString()}
          </li>
        ))}
      </ul>

      <p style={{ marginTop: '40px', fontSize: '0.8em', color: '#888' }}>
        Previsualizaciones abren bitfiles. Historial compartido. Barrido progresivo amplía el rango si encuentra poco.
      </p>
    </div>
  );
}

function SpamList({ items }) {
  if (!items.length) return null;
  return (
    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(280px, 1fr))', gap: '16px', marginTop: '12px' }}>
      {items.map((item, i) => (
        <div key={item.txid + i} style={{ border: '1px solid #ddd', borderRadius: '8px', padding: '12px', background: '#fff' }}>
          <div style={{ fontWeight: 'bold', marginBottom: '6px' }}>
            Bloque {item.height} — {item.type}
            {item.category === 'image_or_file' && <span style={{ color: '#c00', marginLeft: '6px' }}>(posible media)</span>}
          </div>
          <div style={{ fontSize: '0.82em', wordBreak: 'break-all', marginBottom: '6px' }}>
            TX: {item.txid}
          </div>
          <div style={{ fontSize: '0.78em', color: '#555' }}>
            Size: {item.size} · Weight: {item.weight}<br />
            Inputs: {item.vin} · Outputs: {item.vout}
            {item.pubkeyPushes ? <><br />Pubkeys: {item.pubkeyPushes}</> : null}
            {item.witnessBytes ? <><br />Witness ~{item.witnessBytes} bytes</> : null}
          </div>
          <div style={{ marginTop: '10px' }}>
            <a href={`https://bpub.bitfiles.io/#btcb2/${item.txid}`} target="_blank" rel="noreferrer" style={{ color: '#0066cc', marginRight: '10px' }}>
              Ver en bitfiles
            </a>
            <a href={`https://mempool.guide/tx/${item.txid}`} target="_blank" rel="noreferrer" style={{ color: '#0066cc' }}>
              Explorer
            </a>
          </div>
          <a
            href={`https://bpub.bitfiles.io/#btcb2/${item.txid}`}
            target="_blank"
            rel="noreferrer"
            style={{
              marginTop: '10px',
              height: '100px',
              background: '#eee',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              borderRadius: '4px',
              filter: 'blur(4px)',
              textDecoration: 'none',
              color: '#333',
            }}
          >
            <span style={{ filter: 'none', fontSize: '0.8em' }}>[Click para previsualizar en bitfiles]</span>
          </a>
        </div>
      ))}
    </div>
  );
}
