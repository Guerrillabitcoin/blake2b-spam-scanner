import { useState, useEffect, useRef } from 'react';

const API_BASE = 'https://mempool.guide/api';

const previewCache = new Map();

// Real BPUB files from https://bitfiles.io/btcb2
const KNOWN_TXIDS = [
  { txid: 'c6c3710169c5d8516cb45a70d2278fdadb04f21c82840703238ae428bbf6197e', label: 'Sample oficial' },
  { txid: '9f43eec7a3315e6eb8bd5a15ca8cb320fc8d8017110c54f99b63d5f5af9c8bb7', label: 'bitfiles gallery' },
  { txid: 'd3260c6c05e1296fe823d4d4433fe5d4eb208cb771c17e24cb7b35b663e0633f', label: 'bitfiles gallery' },
  { txid: 'bcea00d86baad286038c4b6b35879acf5cda93d7c19014ed8c5051985ab5f6f6', label: 'bitfiles gallery' },
  { txid: '0178c1ffedf03a7d902c84aea163fbe75918bb6905712ac7dada14852f89a584', label: 'bitfiles gallery' },
  { txid: '01fc7b8c89a95869a876996016f1bb6c6ae6a94ea2c9a6797462b7525bbaa7d6', label: 'bitfiles gallery' },
  { txid: '034040ab2df1b6a1c42e6d6e0299e1b1aedd02654ce387ec179d79be73e199c4', label: 'bitfiles gallery' },
  { txid: '0e497ab172666062b023f86d409cb1b64f5710cae5d93d275ac721f7ed737997', label: 'bitfiles gallery' },
  { txid: '1b1e3f9468acdcdf3da067b7a5d2d8d5e9a7da4b3700d57eb4d64a0003510ae7', label: 'bitfiles gallery' },
  { txid: '1b90bc3a850b9c2b7b65e37eaf6d073d15694f113bc91f8eea7e25411d2d57b5', label: 'bitfiles gallery' },
  { txid: '206cc7539b3779d8c02e2b79e8eba659f6e4e950eacefed1c6522b62761f1201', label: 'bitfiles gallery' },
  { txid: '2210ad26dfa56ae5559c59499a390ae8c441b7d67da15bb732ae9ac1ef209b2c', label: 'bitfiles gallery' },
  { txid: '26ae69a8c7b4003365e4aead118df35595d9ab1eeadf297b1bc5e08d785790e1', label: 'bitfiles gallery' },
  { txid: '39586643423531024a01ea5406a9da838aadff990d0626acbb784b4e43ad3ac9', label: 'bitfiles gallery' },
  { txid: '5336c56dc1a57a36125dd2add5b84200f6690efa221610d4dc2c450e6de4d91a', label: 'bitfiles gallery' },
  { txid: '53a9acb92012c25077e101a61d733c6c8e178dc3087ad29ed44ffa8f9e37cd8b', label: 'bitfiles gallery' },
  { txid: '5862171249009749305c3af89887e23f9f7bb9b04f9eef63a7b65e905ba211d1', label: 'bitfiles gallery' },
  { txid: '5ca36047381eecccba1e94486481d5e357bfc45d31badcbc03a8f54834341451', label: 'bitfiles gallery' },
  { txid: '603a8c25dc32f199dddd3a7af0a826d602ad1e7953a79c94ebbc5b9fa274d4f1', label: 'bitfiles gallery' },
  { txid: '6404c71d89b1c5d7562d06973f8f90b862196602239c41f9217884ff7d806fd5', label: 'bitfiles gallery' },
  { txid: '6ed43d4cde5fb079baa5445a08c5272d22b78a31767c047d4650d43ff4911d11', label: 'bitfiles gallery' },
  { txid: '790cfa0349385defd7b8c75cf3a7876c844c451b67f29391c17839b0234ddad7', label: 'bitfiles gallery' },
  { txid: '7f624e31f37411da25ad86483ea8688326c1459cfd63cc653d4a11c4eeb665a4', label: 'bitfiles gallery' },
  { txid: '8b103817004b4eb81ba912c78d23581fd8d3c9657482fe5cec882b45a30dd6ec', label: 'bitfiles gallery' },
  { txid: '90010419766f1ca182e408a7009fba3dc842220dacf972e43e936fbeb4eb886b', label: 'bitfiles gallery' },
  { txid: '90fa1b0d8a02d4b55e2749a6ca015d2fb811b6e0bed3e94cd192d65b5eca3d22', label: 'bitfiles gallery' },
  { txid: '9606b02f5ac3f8f77bd606874b2369cd2d5cc8c923305e19c29c73e3249b016f', label: 'bitfiles gallery' },
  { txid: '9714569a88f01b4b4b5cc539199e509ac20d292c151738a619f47aa23b564b3c', label: 'bitfiles gallery' },
  { txid: '97797ff0e4a640ff13ee066f88b166a33b39618b84b4d45867130f6ca1c082ac', label: 'bitfiles gallery' },
  { txid: '9ae6f01abb3bdbaf36d0d5b07863e0ec9d2a71f6cd2810d1cffe196c0350977e', label: 'bitfiles gallery' },
];

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

  const clearHistory = async () => {
    if (!confirm('Borrar todo el historial?')) return;
    try {
      await fetch('/api/history', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify([]),
      });
      setHistory([]);
      setProgress('Historial limpiado.');
    } catch (e) {
      setError('Error al limpiar: ' + e.message);
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
      let multisigScripts = 0;
      let hasWitness = false;

      for (const vin of tx.vin || []) {
        if (vin.witness && Array.isArray(vin.witness) && vin.witness.length > 0) {
          hasWitness = true;
          maxWitnessItems = Math.max(maxWitnessItems, vin.witness.length);
          for (const w of vin.witness) {
            if (typeof w === 'string') totalWitnessBytes += w.length / 2;
          }
        }
        const asm = (vin.inner_witnessscript_asm || vin.scriptsig_asm || '') + '';
        if (asm.includes('OP_CHECKMULTISIG') || asm.includes('OP_CHECKMULTISIGVERIFY')) {
          hasMultisigLike = true;
          multisigScripts++;
        }
        if (asm.includes('OP_DROP')) hasOpDrop = true;
        const matches = asm.match(/OP_PUSHBYTES_33/g);
        if (matches) pubkeyPushes += matches.length;
      }

      if (!hasWitness) return null;

      const size = tx.size || 0;
      const weight = tx.weight || 0;
      const vinCount = tx.vin?.length || 0;
      const voutCount = tx.vout?.length || 0;

      let type = null;
      let category = 'spam';
      let score = 0;
      let strong = false;

      if (pubkeyPushes >= 12 || (hasMultisigLike && pubkeyPushes >= 6)) {
        type = 'bpub_reveal_candidate';
        category = 'image_or_file';
        score += 6;
        strong = true;
      } else if (vinCount >= 20 && totalWitnessBytes > 2500) {
        type = 'possible_bpub';
        category = 'image_or_file';
        score += 4;
        strong = true;
      }
      if (totalWitnessBytes > 1500) {
        type = type || 'large_witness';
        score += 1;
      }

      if (score >= 4 || strong) {
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
          const vin = tx.vin?.length || 0;
          return s > 1200 || vin >= 12;
        });

        for (const tx of candidates) {
          const analyzed = await analyzeTx(tx.txid, h);
          if (analyzed) results.push(analyzed);
          await new Promise(r => setTimeout(r, 8));
        }
      } catch (e) {
        console.warn('Error bloque', h, e);
      }
      await new Promise(r => setTimeout(r, 10));
    }
    return { results, nextFrom: end - 1 };
  };

  const scanHeavySpamPeriod = async () => {
    setLoading(true);
    setError('');
    setScanned([]);
    try {
      setProgress('Escaneando período fuerte de spam (963343 – 970000)...');
      const { results } = await scanBackwards(970000, 400);
      setScanned(results);
      await saveToHistory(results);
      setProgress(`Período fuerte escaneado. ${results.length} hallazgos.`);
    } catch (e) {
      setError(e.message);
    }
    setLoading(false);
  };

  const loadKnownTxids = () => {
    const samples = KNOWN_TXIDS.map(k => ({
      height: 0,
      txid: k.txid,
      size: 0,
      weight: 0,
      vin: 0,
      vout: 0,
      type: 'bitfiles_' + k.label,
      category: 'image_or_file',
      pubkeyPushes: 99,
      strong: true,
      foundAt: Date.now(),
    }));
    setScanned(samples);
    setProgress(`Cargados ${samples.length} txids reales de bitfiles.io. Deberían extraerse.`);
  };

  const scanAlphaPoolLike = async () => {
    setLoading(true);
    setError('');
    setScanned([]);
    try {
      if (!tipRef.current) await fetchRecentBlocks();
      const tip = tipRef.current;
      setProgress('Buscando bloques de pools que aceptan spam...');
      const results = [];
      for (let h = tip; h > tip - 200 && h > 961640; h--) {
        setProgress(`Revisando bloque ${h}...`);
        try {
          const blockRes = await fetch(`${API_BASE}/block-height/${h}`);
          const hash = (await blockRes.text()).trim();
          if (!hash || hash.length < 64) continue;
          const txsRes = await fetch(`${API_BASE}/block/${hash}/txs`);
          const txs = await txsRes.json();
          if (!txs || !txs.length) continue;
          const coinbase = txs[0];
          const coinbaseAsm = coinbase.vin?.[0]?.scriptsig_asm || '';
          const isAlpha = coinbaseAsm.includes('AlphaPool') || (coinbase.vin?.[0]?.scriptsig || '').toLowerCase().includes('alphapool');
          if (isAlpha) {
            const candidates = txs.slice(1).filter(tx => (tx.vin?.length || 0) >= 12 || (tx.size || 0) > 1500);
            for (const tx of candidates) {
              const analyzed = await analyzeTx(tx.txid, h);
              if (analyzed) {
                analyzed.pool = 'AlphaPool';
                results.push(analyzed);
              }
            }
          }
        } catch (e) {}
        await new Promise(r => setTimeout(r, 15));
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
      const range = 100 + Math.floor(Math.random() * 50);
      const start = tip - Math.floor(Math.random() * 600) - range;
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
      const { results, nextFrom } = await scanBackwards(tip, 80);
      setScanned(results);
      setLowestScanned(nextFrom);
      await saveToHistory(results);
      setProgress(`Escaneados últimos 80 bloques. ${results.length} hallazgos.`);
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
      const { results, nextFrom } = await scanBackwards(lowestScanned, 100);
      setScanned(prev => {
        const existing = new Set(prev.map(i => i.txid));
        const fresh = results.filter(r => !existing.has(r.txid));
        return [...fresh, ...prev];
      });
      setLowestScanned(nextFrom);
      await saveToHistory(results);
      setProgress(`+100 bloques. +${results.length} hallazgos. Siguiente desde ${nextFrom}.`);
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
      setProgress('Escaneando zona ~963343...');
      const { results } = await scanBackwards(963900, 250);
      setScanned(results);
      await saveToHistory(results);
      setProgress(`Zona escaneada. ${results.length} hallazgos.`);
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

  return (
    <div style={{ fontFamily: 'system-ui, sans-serif', padding: '20px', maxWidth: '1200px', margin: '0 auto' }}>
      <h1>BLAKE2b Spam / Data Scanner</h1>
      <p>Galería de archivos BPUB reales de <a href="https://bitfiles.io/btcb2" target="_blank">bitfiles.io/btcb2</a></p>

      <div style={{ margin: '20px 0', padding: '15px', background: '#f5f5f5', borderRadius: '8px' }}>
        <h3>Escanear</h3>
        <button onClick={loadKnownTxids} style={{ padding: '8px 16px', marginRight: '8px', background: '#e0ffe0' }}>
          Cargar galería bitfiles (30)
        </button>
        <button onClick={scanHeavySpamPeriod} disabled={loading} style={{ padding: '8px 16px', marginRight: '8px', background: '#ffe0e0' }}>
          Período fuerte (400 bloques)
        </button>
        <button onClick={startScan} disabled={loading} style={{ padding: '8px 16px', marginRight: '8px' }}>
          Desde el tip (80)
        </button>
        <button onClick={continueScan} disabled={loading || !lowestScanned} style={{ padding: '8px 16px', marginRight: '8px' }}>
          Continuar atrás (+100)
        </button>
        <button onClick={randomScan} disabled={loading} style={{ padding: '8px 16px', marginRight: '8px' }}>
          Aleatorio
        </button>
        <button onClick={scanKnownSpam} disabled={loading} style={{ padding: '8px 16px', marginRight: '8px' }}>
          Zona ~963343
        </button>
        <button onClick={scanAlphaPoolLike} disabled={loading} style={{ padding: '8px 16px', marginRight: '8px', background: '#fff3e0' }}>
          AlphaPool
        </button>
        <button onClick={clearHistory} style={{ padding: '8px 16px', marginLeft: '8px', background: '#ffcccc' }}>
          Limpiar historial
        </button>
        <div style={{ marginTop: '12px' }}>
          <input type="number" placeholder="Inicio" value={startHeight} onChange={e => setStartHeight(e.target.value)} style={{ marginRight: '8px', padding: '8px', width: '110px' }} />
          <input type="number" placeholder="Fin" value={endHeight} onChange={e => setEndHeight(e.target.value)} style={{ marginRight: '8px', padding: '8px', width: '110px' }} />
          <button onClick={handleScan} disabled={loading} style={{ padding: '8px 16px' }}>
            Rango (máx 200)
          </button>
        </div>
        {progress && <div style={{ marginTop: '10px', fontSize: '0.9em' }}>{progress}</div>}
        {lowestScanned && <div style={{ marginTop: '6px', fontSize: '0.8em', color: '#666' }}>Último: {lowestScanned + 1}</div>}
      </div>

      {error && <div style={{ color: 'red', margin: '10px 0' }}>{error}</div>}

      <h2>Resultados ({scanned.length})</h2>
      {scanned.length === 0 && !loading && <p>Nada. Pulsa “Cargar galería bitfiles” para ver archivos reales.</p>}
      <SpamList items={scanned} onVisualFound={saveToHistory} />

      <h2 style={{ marginTop: '40px' }}>Historial ({history.length})</h2>
      {history.length === 0 && <p>Vacío.</p>}
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
        Los txids de bitfiles.io son reveals BPUB reales. Deberían extraerse.
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
            <a href={`https://bitfiles.io/btcb2/${item.txid}`} target="_blank" rel="noreferrer" style={{ color: '#0066cc' }}>
              bitfiles
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
      setErrMsg(cached.err || '');
      if (cached.url && onVisualFound && !savedRef.current) {
        savedRef.current = true;
        onVisualFound([{ ...item, visual: true, mime: cached.meta?.mime, filename: cached.meta?.filename }]);
      }
      return;
    }
    setStatus('loading');
    setErrMsg('');
    try {
      const hexRes = await fetch(`${API_BASE}/tx/${txid}/hex`);
      if (!hexRes.ok) throw new Error('No se pudo obtener el hex (' + hexRes.status + ')');
      const rawHex = (await hexRes.text()).trim();
      if (!rawHex || rawHex.length < 100) throw new Error('Hex inválido');

      const { recoverFromRawTransaction } = await import('@bitfiles/bpub');
      const result = await recoverFromRawTransaction(rawHex);
      if (!result || !result.content) {
        setStatus('no-content');
        setErrMsg('La librería no encontró contenido BPUB');
        previewCache.set(txid, { url: null, meta: null, err: 'no content' });
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
      const msg = e.message || String(e);
      setErrMsg(msg);
      setStatus('error');
      previewCache.set(txid, { url: null, meta: null, err: msg });
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
    return (
      <div style={{ marginTop: '10px', fontSize: '0.8em', color: '#c00' }}>
        {errMsg || 'No es BPUB o no se pudo extraer'}
      </div>
    );
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
