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
    const r = await fetch(url, {
      method: 'POST',
      headers: { Authorization: `Bearer ${tok}`, 'Content-Type': 'application/json' },
      body: JSON.stringify(['GET', key]),
    });
    const d = await r.json();
    if (!d.result) return null;
    try { return JSON.parse(d.result); }
    catch { return d.result; }
  } catch { return null; }
}

async function kvSet(key, value) {
  // Upstash universal command form — most reliable for large values
  const url = process.env.KV_REST_API_URL;
  const tok = process.env.KV_REST_API_TOKEN;
  if (!url || !tok) return { ok: false, reason: 'no-kv-env' };
  const payload = JSON.stringify(['SET', key, JSON.stringify(value)]);
  try {
    const r = await fetch(url, {
      method: 'POST',
      headers: { Authorization: `Bearer ${tok}`, 'Content-Type': 'application/json' },
      body: payload,
    });
    const d = await r.json().catch(() => ({}));
    if (d.error) {
      console.warn('kvSet error:', d.error, 'for key', key, 'payload bytes:', payload.length);
      return { ok: false, reason: d.error };
    }
    return { ok: true, size: payload.length };
  } catch (e) {
    console.warn('kvSet exception:', e.message, 'for key', key);
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
    const reqType = req.query?.type || 'pixel';
    const kvKey = reqType === 'banner' ? `banner_${col}_${row}` : `img_${col}_${row}`;
    const data = await kvGet(kvKey);
    res.setHeader('Cache-Control', 'public, max-age=300');
    return res.status(200).json({ imageDataUrl: data || null, type: reqType });
  }

  if (req.method === 'POST') {
    const { col, row, owner, imageDataUrl, type } = req.body || {};
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

    const kvKey = type === 'banner' ? `banner_${colNum}_${rowNum}` : `img_${colNum}_${rowNum}`;
    const result = await kvSet(kvKey, imageDataUrl);
    res.setHeader('Cache-Control', 'no-store');
    return res.status(result.ok ? 200 : 500).json({
      success: result.ok,
      col: colNum,
      row: rowNum,
      type: type || 'pixel',
      size: imageDataUrl.length,
      reason: result.reason || null,
      message: result.ok
        ? `${type === 'banner' ? 'Banner' : 'Image'} saved. Visible to all users.`
        : `Save failed: ${result.reason}`,
    });
  }

  return res.status(405).json({ error: 'Method not allowed' });
};
