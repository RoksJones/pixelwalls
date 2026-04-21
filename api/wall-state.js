// api/wall-state.js
// Global wall state — stores and serves ALL claimed pixels across all users.
// Backed by Vercel KV. Without this, pixels are only visible in the buyer's browser.
//
// GET  /api/wall-state          → returns full wall {pixels: {key: pixelData}}
// POST /api/wall-state          → upserts one or more pixels (called after claim)
// GET  /api/wall-state?key=x,y  → returns single pixel data

const CORS = {
  'Access-Control-Allow-Origin':  '*',
  'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type',
};

const WALL_KEY   = 'wall_state';      // full wall hash in KV
const PIXEL_PFX  = 'pixel_';          // individual pixel keys: pixel_42_17

// ── KV HELPERS ────────────────────────────────────────────────────
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
    try { return JSON.parse(d.result); } catch { return d.result; }
  } catch { return null; }
}

async function kvSet(key, value) {
  // Use Upstash universal command form for reliability
  const url = process.env.KV_REST_API_URL;
  const tok = process.env.KV_REST_API_TOKEN;
  if (!url || !tok) return false;
  try {
    const r = await fetch(url, {
      method: 'POST',
      headers: { Authorization: `Bearer ${tok}`, 'Content-Type': 'application/json' },
      body: JSON.stringify(['SET', key, JSON.stringify(value)]),
    });
    const d = await r.json().catch(() => ({}));
    if (d.error) { console.warn('kvSet error:', d.error, 'for', key); return false; }
    return true;
  } catch (e) { console.warn('kvSet exception:', e.message); return false; }
}

async function kvHSet(hashKey, field, value) {
  // Use Upstash universal command form — body is ["CMD", "arg1", "arg2", ...]
  // This is the most reliable format per Upstash REST docs.
  const url = process.env.KV_REST_API_URL;
  const tok = process.env.KV_REST_API_TOKEN;
  if (!url || !tok) return { ok: false, reason: 'no-kv-env' };
  try {
    const r = await fetch(url, {
      method: 'POST',
      headers: { Authorization: `Bearer ${tok}`, 'Content-Type': 'application/json' },
      body: JSON.stringify(['HSET', hashKey, field, JSON.stringify(value)]),
    });
    const d = await r.json().catch(() => ({}));
    if (d.error) { console.warn('kvHSet error:', d.error, 'for', hashKey, field); return { ok: false, reason: d.error }; }
    return { ok: true };
  } catch (e) {
    console.warn('kvHSet exception:', e.message);
    return { ok: false, reason: e.message };
  }
}

async function kvHGetAll(hashKey) {
  const url = process.env.KV_REST_API_URL;
  const tok = process.env.KV_REST_API_TOKEN;
  if (!url || !tok) return null;
  try {
    const r = await fetch(url, {
      method: 'POST',
      headers: { Authorization: `Bearer ${tok}`, 'Content-Type': 'application/json' },
      body: JSON.stringify(['HGETALL', hashKey]),
    });
    const d = await r.json();
    if (!d.result) return null;

    const out = {};
    if (Array.isArray(d.result)) {
      for (let i = 0; i < d.result.length; i += 2) {
        const k = d.result[i]; const v = d.result[i + 1];
        if (k === undefined) continue;
        try { out[k] = JSON.parse(v); } catch { out[k] = v; }
      }
    } else if (typeof d.result === 'object') {
      for (const k in d.result) {
        const v = d.result[k];
        try { out[k] = JSON.parse(v); } catch { out[k] = v; }
      }
    }
    return out;
  } catch (e) {
    console.warn('kvHGetAll error:', e.message);
    return null;
  }
}

// ── SANITIZE PIXEL DATA ───────────────────────────────────────────
function sanitizePixel(raw) {
  const col = parseInt(raw.col, 10);
  const row = parseInt(raw.row, 10);
  if (isNaN(col) || isNaN(row) || col < 0 || col > 999 || row < 0 || row > 999) return null;
  return {
    col,
    row,
    owner:        String(raw.owner  || '').slice(0, 50),
    color:        /^#[0-9a-fA-F]{6}$/.test(raw.color) ? raw.color : '#5b21b6',
    w:            Math.max(1, Math.min(100, parseInt(raw.w)  || 1)),
    h:            Math.max(1, Math.min(100, parseInt(raw.h)  || 1)),
    price:        parseFloat(raw.price) || 0.01,
    listPrice:    raw.listPrice ? parseFloat(raw.listPrice) : null,
    boostTier:    Math.max(0, Math.min(4, parseInt(raw.boostTier) || 0)),
    xHandle:      String(raw.xHandle || '').slice(0, 50),
    xVerified:    !!raw.xVerified,
    xAvatar:      String(raw.xAvatar || '').slice(0, 300),
    url:          String(raw.url || '').slice(0, 200),
    displayName:  String(raw.displayName || '').slice(0, 50),
    desc:         String(raw.desc || '').slice(0, 200),
    txSig:        String(raw.txSig || '').slice(0, 100),
    assetId:      String(raw.assetId || '').slice(0, 100),
    // Boost persistence — these were being dropped which caused boosts to "disappear" on reload
    boostActivatedAt: parseInt(raw.boostActivatedAt) || 0,
    boostTxSig:   String(raw.boostTxSig || '').slice(0, 100),
    // imageDataUrl intentionally excluded — too large for KV, stored separately
    updatedAt:    Date.now(),
  };
}

// ── HANDLER ───────────────────────────────────────────────────────
module.exports = async function handler(req, res) {
  Object.entries(CORS).forEach(([k, v]) => res.setHeader(k, v));
  if (req.method === 'OPTIONS') return res.status(200).end();

  // ── GET ───────────────────────────────────────────────────────
  if (req.method === 'GET') {
    const { key, since } = req.query || {};

    // Single pixel lookup
    if (key) {
      const [col, row] = key.split(',').map(Number);
      if (isNaN(col) || isNaN(row)) {
        return res.status(400).json({ error: 'Invalid key format (expected col,row)' });
      }
      const pixel = await kvGet(`${PIXEL_PFX}${col}_${row}`);
      res.setHeader('Cache-Control', 'public, max-age=10');
      return res.status(200).json({ pixel: pixel || null });
    }

    // Full wall state — all claimed pixels
    const pixels = await kvHGetAll(WALL_KEY);

    if (!pixels) {
      // KV not configured — return empty wall with setup hint
      res.setHeader('Cache-Control', 'no-store');
      return res.status(200).json({
        pixels:   {},
        count:    0,
        kvReady:  false,
        message:  'Set up Vercel KV to enable cross-browser wall state.',
      });
    }

    res.setHeader('Cache-Control', 'public, max-age=15, stale-while-revalidate=30');
    return res.status(200).json({
      pixels,
      count:   Object.keys(pixels).length,
      kvReady: true,
    });
  }

  // ── POST ──────────────────────────────────────────────────────
  if (req.method === 'POST') {
    const body = req.body || {};
    const pixelsToSave = Array.isArray(body.pixels) ? body.pixels : [body.pixel || body];

    if (!pixelsToSave.length || !pixelsToSave[0]) {
      return res.status(400).json({ error: 'No pixel data provided' });
    }

    const saved = [];
    const failed = [];

    for (const raw of pixelsToSave) {
      const pixel = sanitizePixel(raw);
      if (!pixel) { failed.push(raw); continue; }

      const fieldKey = `${pixel.col},${pixel.row}`;

      // Store in hash (fast full-wall fetch) AND individual key (fast single lookup)
      const [h1, h2] = await Promise.all([
        kvHSet(WALL_KEY, fieldKey, pixel),
        kvSet(`${PIXEL_PFX}${pixel.col}_${pixel.row}`, pixel),
      ]);
      const hsetOk = (typeof h1 === 'object') ? !!h1.ok : !!h1;
      const setOk  = !!h2;

      if (hsetOk || setOk) saved.push({ key: fieldKey, hset: hsetOk, set: setOk });
      else failed.push({ key: fieldKey, hsetReason: h1?.reason || 'unknown' });
    }

    res.setHeader('Cache-Control', 'no-store');
    return res.status(200).json({
      success: saved.length > 0,
      saved,
      failed,
      count:   saved.length,
    });
  }

  return res.status(405).json({ error: 'Method not allowed' });
};
