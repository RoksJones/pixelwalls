// api/wizard-hall.js
// Global Wizard Boost Hall of Fame — visible to everyone.
// GET  /api/wizard-hall          → leaderboard of all Wizard-boosted pixels
// POST /api/wizard-hall          → increment click counter (body: {col, row})

const CORS = {
  'Access-Control-Allow-Origin':  '*',
  'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type',
};

async function upstashCmd(cmd) {
  const url = process.env.KV_REST_API_URL;
  const tok = process.env.KV_REST_API_TOKEN;
  if (!url || !tok) return null;
  try {
    const r = await fetch(url, {
      method: 'POST',
      headers: { Authorization: `Bearer ${tok}`, 'Content-Type': 'application/json' },
      body: JSON.stringify(cmd),
    });
    const d = await r.json();
    return d.result !== undefined ? d.result : null;
  } catch { return null; }
}

async function getAllPixels() {
  const raw = await upstashCmd(['HGETALL', 'wall_state']);
  if (!raw) return {};
  const out = {};
  if (Array.isArray(raw)) {
    for (let i = 0; i < raw.length; i += 2) {
      try { out[raw[i]] = JSON.parse(raw[i + 1]); } catch { out[raw[i]] = raw[i + 1]; }
    }
  } else if (typeof raw === 'object') {
    for (const k in raw) {
      try { out[k] = JSON.parse(raw[k]); } catch { out[k] = raw[k]; }
    }
  }
  return out;
}

async function getClicks(col, row) {
  const res = await upstashCmd(['GET', `wizard_clicks_${col}_${row}`]);
  if (res == null) return 0;
  const n = parseInt(res, 10);
  return isNaN(n) ? 0 : n;
}

module.exports = async function handler(req, res) {
  Object.entries(CORS).forEach(([k, v]) => res.setHeader(k, v));
  if (req.method === 'OPTIONS') return res.status(200).end();

  const kvConfigured = !!(process.env.KV_REST_API_URL && process.env.KV_REST_API_TOKEN);

  // ── POST: increment click counter ────────────────────────────────
  if (req.method === 'POST') {
    const col = parseInt(req.body?.col, 10);
    const row = parseInt(req.body?.row, 10);
    if (isNaN(col) || isNaN(row) || col < 0 || col > 999 || row < 0 || row > 999) {
      return res.status(400).json({ error: 'Invalid col/row' });
    }
    if (!kvConfigured) return res.status(503).json({ error: 'KV not configured' });

    // Verify the pixel actually has a wizard boost before counting
    const pixelRaw = await upstashCmd(['GET', `pixel_${col}_${row}`]);
    let pixel = null;
    try { pixel = pixelRaw ? JSON.parse(pixelRaw) : null; } catch {}
    if (!pixel || (pixel.boostTier || 0) !== 4) {
      return res.status(400).json({ error: 'Pixel is not wizard-boosted' });
    }

    const newCount = await upstashCmd(['INCR', `wizard_clicks_${col}_${row}`]);
    return res.status(200).json({ col, row, clicks: newCount || 0 });
  }

  // ── GET: leaderboard ─────────────────────────────────────────────
  if (req.method !== 'GET') return res.status(405).json({ error: 'Method not allowed' });

  if (!kvConfigured) {
    return res.status(200).json({ wizards: [], count: 0, kvReady: false });
  }

  const pixels = await getAllPixels();
  const wizardKeys = Object.entries(pixels).filter(([, v]) => (v?.boostTier || 0) === 4);

  const wizards = await Promise.all(wizardKeys.map(async ([k, v]) => {
    const clicks = await getClicks(v.col, v.row);
    return {
      key:         k,
      col:         v.col,
      row:         v.row,
      owner:       v.owner       || '',
      handle:      v.xHandle     || '',
      avatar:      v.xAvatar     || '',
      color:       v.color       || '#8b5cf6',
      displayName: v.displayName || '',
      boostedAt:   v.boostActivatedAt || 0,
      clicks,
    };
  }));

  wizards.sort((a, b) => (b.clicks - a.clicks) || (a.boostedAt - b.boostedAt));

  res.setHeader('Cache-Control', 'public, max-age=30, stale-while-revalidate=60');
  return res.status(200).json({ wizards, count: wizards.length, kvReady: true });
};
