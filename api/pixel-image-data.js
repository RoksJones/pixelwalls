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
    if (!d.result) return null;
    // Upstash stores the raw body we sent (JSON.stringify output). Parse it back.
    try { return JSON.parse(d.result); }
    catch { return d.result; } // already a plain string
  } catch { return null; }
}

async function kvSet(key, value) {
  const url = process.env.KV_REST_API_URL;
  const tok = process.env.KV_REST_API_TOKEN;
  if (!url || !tok) return { ok: false, reason: 'no-kv-env' };
  try {
    // Send as JSON-wrapped string so we can round-trip strings safely
    const r = await fetch(`${url}/set/${encodeURIComponent(key)}`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${tok}`, 'Content-Type': 'application/json' },
      body: JSON.stringify(value),
    });
    const d = await r.json().catch(() => ({}));
    if (d.error) {
      console.warn('kvSet error:', d.error, 'for key', key, 'body length:', JSON.stringify(value).length);
      return { ok: false, reason: d.error };
    }
    return { ok: true };
  } catch (e) {
    console.warn('kvSet exception:', e.message);
    return { ok: false, reason: e.message };
  }
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

    const result = await kvSet(`img_${colNum}_${rowNum}`, imageDataUrl);
    res.setHeader('Cache-Control', 'no-store');
    return res.status(result.ok ? 200 : 500).json({
      success: result.ok,
      col: colNum,
      row: rowNum,
      size: imageDataUrl.length,
      reason: result.reason || null,
      message: result.ok
        ? 'Image saved. Visible to all users.'
        : `Image save failed: ${result.reason}`,
    });
  }

  return res.status(405).json({ error: 'Method not allowed' });
};
