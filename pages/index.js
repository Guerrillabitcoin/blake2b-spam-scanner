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

  const isSuspect = (tx) => {
    const size = tx.size || 0;
    const weight = tx.weight || 0;
    const vin = tx.vin?.length || 0;
    const vout = tx.vout?.length || 0;
    // Detecta transacciones grandes o con muchos outputs/inputs
    // (posibles BPUB, consolidaciones, o data embedding)
    return size > 1500 || weight > 6000 || vout > 12 || vin > 15;
  };

  const scanRange = async (from, to) => {
    setLoading(true);
    setError('');
    setProgress('');
    const results = [];
    try {
      for (let h = from; h <= to; h++) {
        setProgress(`Escaneando bloque ${h} (${h - from + 1}/${to - from + 1})...`);
        try {
          const blockRes = await fetch(`${API_BASE}/block-height/${h}`);
          const hash = (await blockRes.text()).trim();
          if (!hash || hash.length < 64) continue;

          const txsRes = await fetch(`${API_BASE}/block/${hash}/txs`);
          const txs = await txsRes.json();

          for (const tx of txs || []) {
            if (isSuspect(tx)) {
              results.push({
                height: h,
                txid: tx.txid,
                size: tx.size,
                weight: tx.weight,
                vin: tx.vin?.length || 0,
                vout: tx.vout?.length || 0,
                type: 'possible_data_or_large',
                foundAt: Date.now(),
              });
            }
          }
        } catch (e) {
          console.warn('Error bloque', h, e);
        }
        await new Promise(r => setTimeout(r, 120));
      }
      setScanned(results);
      await saveToHistory(results);
      setProgress(`Terminado. Encontradas ${results.length} transacciones sospechosas. Guardadas en historial compartido.`);
    } catch (e) {
      setError('Error escaneando: ' + e.message);
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
    if (end - start > 40) {
      setError('Máximo 40 bloques por escaneo');
      return;
    }
    scanRange(start, end);
  };

  const scanLast = async (n = 20) => {
    setLoading(true);
    try {
      const tipRes = await fetch(`${API_BASE}/blocks/tip/height`);
      const tip = await tipRes.json();
      const height = typeof tip === 'number' ? tip : tip.height || tip;
      await scanRange(height - n + 1, height);
    } catch (e) {
      setError(e.message);
      setLoading(false);
    }
  };

  return (
    <div style={{ fontFamily: 'system-ui, sans-serif', padding: '20px', maxWidth: '1200px', margin: '0 auto' }}>
      <h1>BLAKE2b Spam / Data Scanner</h1>
      <p>Galería compartida de transacciones con posible data embedding en la cadena BLAKE2b. Historial visible para todos los visitantes.</p>

      <div style={{ margin: '20px 0', padding: '15px', background: '#f5f5f5', borderRadius: '8px' }}>
        <h3>Escanear bloques</h3>
        <button onClick={() => scanLast(10)} disabled={loading} style={{ padding: '8px 16px', marginRight: '8px' }}>
          Últimos 10
        </button>
        <button onClick={() => scanLast(25)} disabled={loading} style={{ padding: '8px 16px', marginRight: '8px' }}>
          Últimos 25
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
      {scanned.length === 0 && !loading && <p>Ningún resultado en el último escaneo.</p>}
      <SpamList items={scanned} />

      <h2 style={{ marginTop: '40px' }}>Historial compartido ({history.length})</h2>
      {history.length === 0 && <p>El historial está vacío. Escanea bloques para añadir hallazgos.</p>}
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
        Detección heurística de transacciones grandes o con muchos inputs/outputs (posibles BPUB, OP_RETURN grande, witness data, etc.). Historial compartido vía Vercel Blob.
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
          </div>
          <div style={{ fontSize: '0.82em', wordBreak: 'break-all', marginBottom: '6px' }}>
            TX: {item.txid}
          </div>
          <div style={{ fontSize: '0.78em', color: '#555' }}>
            Size: {item.size} · Weight: {item.weight}<br />
            Inputs: {item.vin} · Outputs: {item.vout}
          </div>
          <div style={{ marginTop: '10px' }}>
            <a href={`https://bpub.bitfiles.io/${item.txid}`} target="_blank" rel="noreferrer" style={{ color: '#0066cc', marginRight: '10px' }}>
              Ver en bitfiles
            </a>
            <a href={`https://mempool.guide/tx/${item.txid}`} target="_blank" rel="noreferrer" style={{ color: '#0066cc' }}>
              Explorer
            </a>
          </div>
          <div
            style={{
              marginTop: '10px',
              height: '100px',
              background: '#eee',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              borderRadius: '4px',
              filter: 'blur(5px)',
            }}
          >
            <span style={{ filter: 'none', color: '#666', fontSize: '0.8em' }}>[blur - posible spam]</span>
          </div>
        </div>
      ))}
    </div>
  );
}
