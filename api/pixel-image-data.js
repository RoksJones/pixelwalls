// api/pixel-image-data.js
// Stores and retrieves pixel image data (base64) separately from wall state.
// Image data is too large for the wall hash — stored individually per pixel.
// GET  /api/pixel-image-data?col=x&row=y  → returns {imageDataUrl}
// POST /api/pixel-image-data              → saves {col, row, owner, imageDataUrl}

const CORS = {
  'Access-Control-Allow-Origin':  '*',
  'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type',
};

const MAX_IMAGE_SIZE = 400 * 1024; // 400KB max per pixel image

async function kvGet(key) {
  const url = process.env.KV_REST_API_URL;
  const tok = process.env.KV_REST_API_TOKEN;
  if (!url || !tok) return null;
  try {
    const r = await fetch(`${url}/get/${encodeURIComponent(key)}`, {
      headers: { Authorization: `Bearer ${tok}` },
    });
    const d = await r.json();
    return d.result || null;
  } catch { return null; }
}

async function kvSet(key, value) {
  const url = process.env.KV_REST_API_URL;
  const tok = process.env.KV_REST_API_TOKEN;
  if (!url || !tok) return false;
  try {
    await fetch(`${url}/set/${encodeURIComponent(key)}`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${tok}`, 'Content-Type': 'application/json' },
      body: JSON.stringify(value),
    });
    return true;
  } catch { return false; }
}

module.exports = async function handler(req, res) {
  Object.entries(CORS).forEach(([k, v]) => res.setHeader(k, v));
  if (req.method === 'OPTIONS') return res.status(200).end();

  if (req.method === 'GET') {
    const col = parseInt(req.query?.col, 10);
    const row = parseInt(req.query?.row, 10);
    if (isNaN(col) || isNaN(row)) {
      return res.status(400).json({ error: 'Missing col/row' });
    }
    const data = await kvGet(`img_${col}_${row}`);
    res.setHeader('Cache-Control', 'public, max-age=300');
    return res.status(200).json({ imageDataUrl: data || null });
  }

  if (req.method === 'POST') {
    const { col, row, owner, imageDataUrl } = req.body || {};
    const colNum = parseInt(col, 10);
    const rowNum = parseInt(row, 10);

    if (isNaN(colNum) || isNaN(rowNum)) {
      return res.status(400).json({ error: 'Invalid col/row' });
    }
    if (!imageDataUrl || !imageDataUrl.startsWith('data:image/')) {
      return res.status(400).json({ error: 'Invalid imageDataUrl' });
    }
    if (imageDataUrl.length > MAX_IMAGE_SIZE) {
      return res.status(400).json({ error: `Image too large (max ${MAX_IMAGE_SIZE / 1024}KB)` });
    }

    const saved = await kvSet(`img_${colNum}_${rowNum}`, imageDataUrl);
    res.setHeader('Cache-Control', 'no-store');
    return res.status(200).json({
      success: saved,
      col: colNum,
      row: rowNum,
      message: saved
        ? 'Image saved. Visible to all users.'
        : 'KV not configured. Image stored locally only.',
    });
  }

  return res.status(405).json({ error: 'Method not allowed' });
};
