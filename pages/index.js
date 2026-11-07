import { useState, useEffect, useRef } from 'react';

const API_BASE = 'https://mempool.guide/api';

const previewCache = new Map();

export default function Home() {
  const [blocks, setBlocks] = useState([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [startHeight, setStartHeight] = useState('');
  const [endHeight, setEndHeight] = useState('');
  const [scanned, setScanned] = useState([]);
  const [history, setHistory] = useState([]);
  const [progress, setProgress] = useState('');
  const [lowestScanned, setLowestScanned] = useState(null);
  const tipRef = useRef(null);

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
      tipRef.current = height;
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
      let strong = false;

      if (vinCount >= 15 || pubkeyPushes >= 5 || hasMultisigLike) {
        type = 'bpub_reveal_candidate';
        category = 'image_or_file';
        score += 4;
        strong = true;
      }
      if (totalWitnessBytes > 1200 || maxWitnessItems > 3) {
        type = type || 'large_witness';
        category = 'image_or_file';
        score += 2;
      }
      if (hasOpDrop) {
        type = type || 'op_drop';
        score += 1;
      }
      if (size > 1800 || weight > 7000 || voutCount > 12) {
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
          strong,
          foundAt: Date.now(),
        };
      }
      return null;
    } catch (e) {
      return null;
    }
  };

  const scanBackwards = async (fromHeight, count) => {
    const results = [];
    const end = Math.max(1, fromHeight - count + 1);
    for (let h = fromHeight; h >= end; h--) {
      setProgress(`Escaneando hacia atrás: bloque ${h} (${fromHeight - h + 1}/${count})...`);
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
          return s > 800 || w > 3000 || vout > 5 || vin >= 12;
        });

        for (const tx of candidates) {
          const analyzed = await analyzeTx(tx.txid, h);
          if (analyzed) results.push(analyzed);
          await new Promise(r => setTimeout(r, 25));
        }
      } catch (e) {
        console.warn('Error bloque', h, e);
      }
      await new Promise(r => setTimeout(r, 30));
    }
    return { results, nextFrom: end - 1 };
  };

  const scanAlphaPoolLike = async () => {
    setLoading(true);
    setError('');
    setScanned([]);
    try {
      if (!tipRef.current) await fetchRecentBlocks();
      const tip = tipRef.current;
      setProgress('Buscando bloques de pools que aceptan spam (AlphaPool y similares)...');
      const results = [];
      for (let h = tip; h > tip - 80 && h > 961640; h--) {
        setProgress(`Revisando bloque ${h} para pools...`);
        try {
          const blockRes = await fetch(`${API_BASE}/block-height/${h}`);
          const hash = (await blockRes.text()).trim();
          if (!hash || hash.length < 64) continue;
          const txsRes = await fetch(`${API_BASE}/block/${hash}/txs`);
          const txs = await txsRes.json();
          if (!txs || !txs.length) continue;
          const coinbase = txs[0];
          const coinbaseHex = coinbase.vin?.[0]?.scriptsig || '';
          const coinbaseAsm = coinbase.vin?.[0]?.scriptsig_asm || '';
          const isAlpha = coinbaseAsm.includes('AlphaPool') || coinbaseHex.toLowerCase().includes('alphapool');
          if (isAlpha) {
            const candidates = txs.slice(1).filter(tx => (tx.vin?.length || 0) >= 12 || (tx.size || 0) > 1000);
            for (const tx of candidates) {
              const analyzed = await analyzeTx(tx.txid, h);
              if (analyzed) {
                analyzed.pool = 'AlphaPool';
                results.push(analyzed);
              }
            }
          }
        } catch (e) {}
        await new Promise(r => setTimeout(r, 40));
      }
      setScanned(results);
      await saveToHistory(results);
      setProgress(`Bloques de pools revisados. ${results.length} hallazgos.`);
    } catch (e) {
      setError(e.message);
    }
    setLoading(false);
  };

  const randomScan = async () => {
    setLoading(true);
    setError('');
    setScanned([]);
    try {
      if (!tipRef.current) await fetchRecentBlocks();
      const tip = tipRef.current;
      const range = 40 + Math.floor(Math.random() * 60);
      const start = tip - Math.floor(Math.random() * 200) - range;
      setProgress(`Escaneo aleatorio: ${range} bloques desde ~${start}...`);
      const { results } = await scanBackwards(start + range, range);
      setScanned(results);
      await saveToHistory(results);
      setProgress(`Aleatorio terminado. ${results.length} hallazgos.`);
    } catch (e) {
      setError(e.message);
    }
    setLoading(false);
  };

  const startScan = async () => {
    setLoading(true);
    setError('');
    setScanned([]);
    try {
      if (!tipRef.current) await fetchRecentBlocks();
      const tip = tipRef.current;
      const { results, nextFrom } = await scanBackwards(tip, 30);
      setScanned(results);
      setLowestScanned(nextFrom);
      await saveToHistory(results);
      setProgress(`Escaneados últimos 30 bloques. ${results.length} hallazgos.`);
    } catch (e) {
      setError(e.message);
    }
    setLoading(false);
  };

  const continueScan = async () => {
    if (!lowestScanned || lowestScanned < 1) return;
    setLoading(true);
    setError('');
    try {
      const { results, nextFrom } = await scanBackwards(lowestScanned, 40);
      setScanned(prev => {
        const existing = new Set(prev.map(i => i.txid));
        const fresh = results.filter(r => !existing.has(r.txid));
        return [...fresh, ...prev];
      });
      setLowestScanned(nextFrom);
      await saveToHistory(results);
      setProgress(`+40 bloques. +${results.length} hallazgos. Siguiente desde ${nextFrom}.`);
    } catch (e) {
      setError(e.message);
    }
    setLoading(false);
  };

  const scanKnownSpam = async () => {
    setLoading(true);
    setError('');
    setScanned([]);
    try {
      setProgress('Escaneando zona conocida de spam (alrededor del bloque 963343)...');
      const { results } = await scanBackwards(963450, 80);
      setScanned(results);
      await saveToHistory(results);
      setProgress(`Zona conocida escaneada. ${results.length} hallazgos.`);
    } catch (e) {
      setError(e.message);
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
    if (end - start > 200) {
      setError('Máximo 200 bloques');
      return;
    }
    setLoading(true);
    scanBackwards(end, end - start + 1).then(async ({ results }) => {
      setScanned(results);
      await saveToHistory(results);
      setProgress(`Rango escaneado. ${results.length} hallazgos.`);
      setLoading(false);
    }).catch(e => {
      setError(e.message);
      setLoading(false);
    });
  };

  const testSample = () => {
    const sample = {
      height: 0,
      txid: 'c6c3710169c5d8516cb45a70d2278fdadb04f21c82840703238ae428bbf6197e',
      size: 0,
      weight: 0,
      vin: 0,
      vout: 0,
      type: 'sample_bpub',
      category: 'image_or_file',
      strong: true,
      foundAt: Date.now(),
    };
    setScanned([sample]);
    setProgress('Cargado txid de ejemplo de BPUB. Pulsa Extraer.');
  };

  return (
    <div style={{ fontFamily: 'system-ui, sans-serif', padding: '20px', maxWidth: '1200px', margin: '0 auto' }}>
      <h1>BLAKE2b Spam / Data Scanner</h1>
      <p>Extracción corregida (fetch propio del hex). Prueba el botón de ejemplo.</p>

      <div style={{ margin: '20px 0', padding: '15px', background: '#f5f5f5', borderRadius: '8px' }}>
        <h3>Escanear</h3>
        <button onClick={testSample} style={{ padding: '8px 16px', marginRight: '8px', background: '#e0ffe0' }}>
          Probar txid de ejemplo
        </button>
        <button onClick={startScan} disabled={loading} style={{ padding: '8px 16px', marginRight: '8px' }}>
          Empezar desde el tip (30)
        </button>
        <button onClick={continueScan} disabled={loading || !lowestScanned} style={{ padding: '8px 16px', marginRight: '8px' }}>
          Continuar hacia atrás (+40)
        </button>
        <button onClick={randomScan} disabled={loading} style={{ padding: '8px 16px', marginRight: '8px' }}>
          Escaneo aleatorio
        </button>
        <button onClick={scanKnownSpam} disabled={loading} style={{ padding: '8px 16px', marginRight: '8px', background: '#ffe0e0' }}>
          Zona conocida (~963343)
        </button>
        <button onClick={scanAlphaPoolLike} disabled={loading} style={{ padding: '8px 16px', marginRight: '8px', background: '#fff3e0' }}>
          Bloques AlphaPool / pools
        </button>
        <div style={{ marginTop: '12px' }}>
          <input type="number" placeholder="Altura inicio" value={startHeight} onChange={e => setStartHeight(e.target.value)} style={{ marginRight: '8px', padding: '8px', width: '120px' }} />
          <input type="number" placeholder="Altura fin" value={endHeight} onChange={e => setEndHeight(e.target.value)} style={{ marginRight: '8px', padding: '8px', width: '120px' }} />
          <button onClick={handleScan} disabled={loading} style={{ padding: '8px 16px' }}>
            Escanear rango (hasta 200)
          </button>
        </div>
        {progress && <div style={{ marginTop: '10px', fontSize: '0.9em' }}>{progress}</div>}
        {lowestScanned && <div style={{ marginTop: '6px', fontSize: '0.8em', color: '#666' }}>Último bloque: {lowestScanned + 1}</div>}
      </div>

      {error && <div style={{ color: 'red', margin: '10px 0' }}>{error}</div>}

      <h2>Resultados de este escaneo ({scanned.length})</h2>
      {scanned.length === 0 && !loading && <p>Ningún resultado. Prueba el txid de ejemplo o zona conocida.</p>}
      <SpamList items={scanned} onVisualFound={saveToHistory} />

      <h2 style={{ marginTop: '40px' }}>Historial compartido ({history.length})</h2>
      {history.length === 0 && <p>El historial está vacío.</p>}
      <SpamList items={history} onVisualFound={saveToHistory} />

      <h2 style={{ marginTop: '40px' }}>Últimos bloques</h2>
      <ul>
        {blocks.map(b => (
          <li key={b.id || b.height}>
            Altura {b.height} — {b.tx_count} txs — {new Date((b.timestamp || 0) * 1000).toLocaleString()}
          </li>
        ))}
      </ul>

      <p style={{ marginTop: '40px', fontSize: '0.8em', color: '#888' }}>
        Extracción usa hex propio de mempool.guide. Si el ejemplo funciona, el resto también.
      </p>
    </div>
  );
}

function SpamList({ items, onVisualFound }) {
  if (!items.length) return null;
  return (
    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(280px, 1fr))', gap: '16px', marginTop: '12px' }}>
      {items.map((item, i) => (
        <div key={item.txid + i} style={{ border: '1px solid #ddd', borderRadius: '8px', padding: '12px', background: '#fff' }}>
          <div style={{ fontWeight: 'bold', marginBottom: '6px' }}>
            Bloque {item.height} — {item.type}
            {item.category === 'image_or_file' && <span style={{ color: '#c00', marginLeft: '6px' }}>(posible media)</span>}
            {item.strong && <span style={{ color: '#0a0', marginLeft: '6px', fontSize: '0.8em' }}>★</span>}
            {item.pool && <span style={{ color: '#f60', marginLeft: '6px', fontSize: '0.75em' }}>{item.pool}</span>}
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
          <div style={{ marginTop: '10px', display: 'flex', flexWrap: 'wrap', gap: '8px' }}>
            <a href={`https://mempool.kilombino.com/tx/${item.txid}`} target="_blank" rel="noreferrer" style={{ color: '#0066cc' }}>
              Kilombino
            </a>
            <a href={`https://mempool.guide/tx/${item.txid}`} target="_blank" rel="noreferrer" style={{ color: '#0066cc' }}>
              mempool.guide
            </a>
          </div>
          <Preview txid={item.txid} strong={item.strong} item={item} onVisualFound={onVisualFound} />
        </div>
      ))}
    </div>
  );
}

function Preview({ txid, strong, item, onVisualFound }) {
  const [status, setStatus] = useState('idle');
  const [url, setUrl] = useState(null);
  const [meta, setMeta] = useState(null);
  const [blur, setBlur] = useState(true);
  const [errMsg, setErrMsg] = useState('');
  const savedRef = useRef(false);

  useEffect(() => {
    if (strong) {
      extract();
    }
  }, [txid, strong]);

  const extract = async () => {
    if (previewCache.has(txid)) {
      const cached = previewCache.get(txid);
      setUrl(cached.url);
      setMeta(cached.meta);
      setStatus(cached.url ? 'ok' : 'no-content');
      if (cached.url && onVisualFound && !savedRef.current) {
        savedRef.current = true;
        onVisualFound([{ ...item, visual: true, mime: cached.meta?.mime, filename: cached.meta?.filename }]);
      }
      return;
    }
    setStatus('loading');
    setErrMsg('');
    try {
      // Fetch hex ourselves from mempool.guide
      const hexRes = await fetch(`${API_BASE}/tx/${txid}/hex`);
      if (!hexRes.ok) throw new Error('No se pudo obtener el hex');
      const rawHex = (await hexRes.text()).trim();
      if (!rawHex || rawHex.length < 100) throw new Error('Hex inválido');

      const { recoverFromRawTransaction } = await import('@bitfiles/bpub');
      const result = await recoverFromRawTransaction(rawHex);
      if (!result || !result.content) {
        setStatus('no-content');
        previewCache.set(txid, { url: null, meta: null });
        return;
      }
      const mime = result.meta?.mime || 'application/octet-stream';
      const blob = new Blob([result.content], { type: mime });
      const objectUrl = URL.createObjectURL(blob);
      const data = { url: objectUrl, meta: result.meta };
      previewCache.set(txid, data);
      setUrl(objectUrl);
      setMeta(result.meta);
      setStatus('ok');
      if (onVisualFound && !savedRef.current && (mime.startsWith('image/') || mime.startsWith('video/'))) {
        savedRef.current = true;
        onVisualFound([{ ...item, visual: true, mime, filename: result.meta?.filename }]);
      }
    } catch (e) {
      console.warn(e);
      setErrMsg(e.message || 'Error');
      setStatus('error');
      previewCache.set(txid, { url: null, meta: null });
    }
  };

  if (status === 'idle') {
    return (
      <button onClick={extract} style={{ marginTop: '10px', padding: '6px 10px', fontSize: '0.85em' }}>
        Extraer previsualización
      </button>
    );
  }
  if (status === 'loading') return <div style={{ marginTop: '10px', fontSize: '0.85em', color: '#666' }}>Extrayendo...</div>;
  if (status === 'error' || status === 'no-content') {
    return <div style={{ marginTop: '10px', fontSize: '0.8em', color: '#888' }}>{errMsg || 'No es BPUB o no se pudo extraer'}</div>;
  }

  const isImage = meta?.mime?.startsWith('image/');
  const isVideo = meta?.mime?.startsWith('video/');

  return (
    <div style={{ marginTop: '10px' }}>
      {meta?.filename && <div style={{ fontSize: '0.75em', marginBottom: '4px' }}>{meta.filename}</div>}
      {isImage && (
        <img
          src={url}
          alt="preview"
          style={{
            maxWidth: '100%',
            maxHeight: '160px',
            borderRadius: '4px',
            filter: blur ? 'blur(12px)' : 'none',
            cursor: 'pointer',
          }}
          onClick={() => setBlur(!blur)}
        />
      )}
      {isVideo && (
        <video src={url} controls style={{ maxWidth: '100%', maxHeight: '160px' }} />
      )}
      {!isImage && !isVideo && (
        <a href={url} download={meta?.filename || 'file'} style={{ fontSize: '0.85em' }}>
          Descargar ({meta?.mime || 'archivo'})
        </a>
      )}
      {blur && isImage && <div style={{ fontSize: '0.7em', color: '#888' }}>Click para desenfocar</div>}
    </div>
  );
}
