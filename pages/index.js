import { useState, useEffect } from 'react';

const API_BASE = 'https://mempool.guide/api';

export default function Home() {
  const [blocks, setBlocks] = useState([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [startHeight, setStartHeight] = useState('');
  const [endHeight, setEndHeight] = useState('');
  const [scanned, setScanned] = useState([]);

  const fetchRecentBlocks = async () => {
    setLoading(true);
    setError('');
    try {
      const tipRes = await fetch(`${API_BASE}/blocks/tip/height`);
      const tip = await tipRes.json();
      const height = typeof tip === 'number' ? tip : tip.height || tip;

      const res = await fetch(`${API_BASE}/blocks/${height}`);
      const data = await res.json();
      setBlocks(Array.isArray(data) ? data.slice(0, 10) : []);
    } catch (e) {
      setError('Error al obtener bloques: ' + e.message);
    }
    setLoading(false);
  };

  const scanRange = async () => {
    if (!startHeight || !endHeight) return;
    setLoading(true);
    setError('');
    const results = [];
    try {
      const start = parseInt(startHeight);
      const end = parseInt(endHeight);
      for (let h = start; h <= end; h++) {
        try {
          const blockRes = await fetch(`${API_BASE}/block-height/${h}`);
          const hash = await blockRes.text();
          if (!hash || hash.length < 64) continue;

          const txsRes = await fetch(`${API_BASE}/block/${hash}/txs`);
          const txs = await txsRes.json();

          for (const tx of txs || []) {
            const isSuspect =
              (tx.vin && tx.vin.length > 5) ||
              (tx.vout && tx.vout.length > 10) ||
              (tx.size && tx.size > 2000) ||
              (tx.weight && tx.weight > 8000);

            if (isSuspect) {
              results.push({
                height: h,
                txid: tx.txid,
                size: tx.size,
                weight: tx.weight,
                vin: tx.vin?.length || 0,
                vout: tx.vout?.length || 0,
                type: 'possible_bpub_or_large',
              });
            }
          }
        } catch (e) {
          console.warn('Error en bloque', h, e);
        }
        await new Promise(r => setTimeout(r, 200));
      }
      setScanned(results);
    } catch (e) {
      setError('Error escaneando: ' + e.message);
    }
    setLoading(false);
  };

  useEffect(() => {
    fetchRecentBlocks();
  }, []);

  return (
    <div style={{ fontFamily: 'system-ui, sans-serif', padding: '20px', maxWidth: '1200px', margin: '0 auto' }}>
      <h1>BLAKE2b Spam Scanner</h1>
      <p>Escanea bloques de la cadena BLAKE2b (mempool.guide) buscando posible spam / BPUB.</p>

      <div style={{ margin: '20px 0', padding: '15px', background: '#f5f5f5', borderRadius: '8px' }}>
        <h3>Escanear rango de bloques</h3>
        <input
          type="number"
          placeholder="Altura inicio"
          value={startHeight}
          onChange={e => setStartHeight(e.target.value)}
          style={{ marginRight: '10px', padding: '8px' }}
        />
        <input
          type="number"
          placeholder="Altura fin"
          value={endHeight}
          onChange={e => setEndHeight(e.target.value)}
          style={{ marginRight: '10px', padding: '8px' }}
        />
        <button onClick={scanRange} disabled={loading} style={{ padding: '8px 16px' }}>
          {loading ? 'Escaneando...' : 'Escanear'}
        </button>
      </div>

      {error && <div style={{ color: 'red', margin: '10px 0' }}>{error}</div>}

      <h2>Resultados del escaneo ({scanned.length})</h2>
      {scanned.length === 0 && !loading && <p>No se han encontrado transacciones sospechosas todavía. Prueba un rango.</p>}

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(280px, 1fr))', gap: '16px' }}>
        {scanned.map((item, i) => (
          <div key={i} style={{ border: '1px solid #ddd', borderRadius: '8px', padding: '12px', background: '#fff' }}>
            <div style={{ fontWeight: 'bold', marginBottom: '8px' }}>
              Bloque {item.height} — {item.type}
            </div>
            <div style={{ fontSize: '0.85em', wordBreak: 'break-all', marginBottom: '8px' }}>
              TX: {item.txid}
            </div>
            <div style={{ fontSize: '0.8em', color: '#555' }}>
              Size: {item.size} · Weight: {item.weight}<br />
              Inputs: {item.vin} · Outputs: {item.vout}
            </div>
            <div style={{ marginTop: '10px' }}>
              <a
                href={`https://bpub.bitfiles.io/${item.txid}`}
                target="_blank"
                rel="noreferrer"
                style={{ color: '#0066cc', marginRight: '10px' }}
              >
                Ver en bitfiles
              </a>
              <a
                href={`https://mempool.guide/tx/${item.txid}`}
                target="_blank"
                rel="noreferrer"
                style={{ color: '#0066cc' }}
              >
                Explorer
              </a>
            </div>
            <div
              style={{
                marginTop: '10px',
                height: '120px',
                background: '#eee',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                borderRadius: '4px',
                filter: 'blur(6px)',
                cursor: 'pointer',
                position: 'relative',
              }}
              title="Click para ver detalles (NSFW blur por defecto)"
            >
              <span style={{ filter: 'none', color: '#666' }}>[Imagen / Spam - blur]</span>
            </div>
          </div>
        ))}
      </div>

      <h2 style={{ marginTop: '40px' }}>Últimos bloques</h2>
      <ul>
        {blocks.map(b => (
          <li key={b.id || b.height}>
            Altura {b.height} — {b.tx_count} txs — {new Date((b.timestamp || 0) * 1000).toLocaleString()}
          </li>
        ))}
      </ul>

      <p style={{ marginTop: '40px', fontSize: '0.8em', color: '#888' }}>
        Nota: La detección es heurística. Las imágenes se muestran borrosas por defecto (NSFW).
        Click en el enlace de bitfiles para ver el contenido real.
      </p>
    </div>
  );
}
