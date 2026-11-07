import { put, list, del } from '@vercel/blob';

const BLOB_NAME = 'spam-history.json';

export default async function handler(req, res) {
  if (req.method === 'GET') {
    try {
      const { blobs } = await list();
      const historyBlob = blobs.find(b => b.pathname === BLOB_NAME);
      if (!historyBlob) {
        return res.json([]);
      }
      const response = await fetch(historyBlob.url);
      const data = await response.json();
      return res.json(data);
    } catch (e) {
      console.error(e);
      return res.status(500).json({ error: e.message });
    }
  }

  if (req.method === 'POST') {
    try {
      const newItems = req.body;
      if (!Array.isArray(newItems)) {
        return res.status(400).json({ error: 'Expected array' });
      }

      // Load existing
      let existing = [];
      try {
        const { blobs } = await list();
        const historyBlob = blobs.find(b => b.pathname === BLOB_NAME);
        if (historyBlob) {
          const r = await fetch(historyBlob.url);
          existing = await r.json();
        }
      } catch (e) {}

      const existingTxids = new Set(existing.map(i => i.txid));
      const fresh = newItems.filter(i => !existingTxids.has(i.txid));
      const merged = [...fresh, ...existing].slice(0, 1000);

      await put(BLOB_NAME, JSON.stringify(merged), {
        access: 'public',
        contentType: 'application/json',
        allowOverwrite: true,
      });

      return res.json({ added: fresh.length, total: merged.length });
    } catch (e) {
      console.error(e);
      return res.status(500).json({ error: e.message });
    }
  }

  res.setHeader('Allow', 'GET, POST');
  res.status(405).end();
}
