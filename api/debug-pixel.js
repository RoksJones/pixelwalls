// api/debug-pixel.js
// Diagnostic endpoint — inspect ALL KV data for a specific pixel
// GET /api/debug-pixel?col=499&row=499
// Returns every KV key related to that pixel so you can verify what's stored server-side

const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'GET, OPTIONS',
};

async function kvGet(key) {
  const url = process.env.KV_REST_API_URL;
  const tok = process.env.KV_REST_API_TOKEN;
  if (!url || !tok) return { error: 'KV not configured' };
  try {
    const r = await fetch(`${url}/get/${encodeURIComponent(key)}`, {
      headers: { Authorization: `Bearer ${tok}` },
    });
    const d = await r.json();
    if (!d.result) return null;
    try { return JSON.parse(d.result); }
    catch { return d.result; }
  } catch (e) { return { error: e.message }; }
}

async function kvHGet(hashKey, field) {
  const url = process.env.KV_REST_API_URL;
  const tok = process.env.KV_REST_API_TOKEN;
  if (!url || !tok) return { error: 'KV not configured' };
  try {
    const r = await fetch(`${url}/hget/${encodeURIComponent(hashKey)}/${encodeURIComponent(field)}`, {
      headers: { Authorization: `Bearer ${tok}` },
    });
    const d = await r.json();
    if (!d.result) return null;
    try { return JSON.parse(d.result); }
    catch { return d.result; }
  } catch (e) { return { error: e.message }; }
}

module.exports = async function handler(req, res) {
  Object.entries(CORS).forEach(([k, v]) => res.setHeader(k, v));
  if (req.method === 'OPTIONS') return res.status(200).end();

  const col = parseInt(req.query?.col, 10);
  const row = parseInt(req.query?.row, 10);
  if (isNaN(col) || isNaN(row)) {
    return res.status(400).json({ error: 'Missing col/row query params' });
  }

  const kvConfigured = !!(process.env.KV_REST_API_URL && process.env.KV_REST_API_TOKEN);

  // Check all relevant KV keys for this pixel
  const [wallHashEntry, pixelSingleKey, imageData, profile] = await Promise.all([
    kvHGet('wall_state', `${col},${row}`),
    kvGet(`pixel_${col}_${row}`),
    kvGet(`img_${col}_${row}`),
    kvGet(`pixel_profile_${col}_${row}`),
  ]);

  return res.status(200).json({
    pixel: { col, row },
    kv: {
      configured: kvConfigured,
      urlSet:     !!process.env.KV_REST_API_URL,
      tokenSet:   !!process.env.KV_REST_API_TOKEN,
    },
    storage: {
      wall_state_hash_entry: wallHashEntry,
      pixel_single_key:      pixelSingleKey,
      image_data: imageData
        ? { exists: true, size: (imageData.length || 0), preview: String(imageData).slice(0, 60) + '...' }
        : null,
      profile,
    },
    endpoints: {
      wallState:   `/api/wall-state?key=${col},${row}`,
      imageData:   `/api/pixel-image-data?col=${col}&row=${row}`,
      metadata:    `/api/metadata/${col}/${row}`,
    },
  });
};
