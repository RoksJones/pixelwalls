// api/wizard-hall.js
// Global Wizard Boost Hall of Fame — visible to everyone, not just the booster.
// Reads all pixels from KV, filters for Wizard tier (boostTier === 4),
// merges per-pixel click counts, returns sorted leaderboard.

const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'GET, OPTIONS',
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
  if (req.method !== 'GET')    return res.status(405).json({ error: 'GET only' });

  const kvConfigured = !!(process.env.KV_REST_API_URL && process.env.KV_REST_API_TOKEN);
  if (!kvConfigured) {
    return res.status(200).json({ wizards: [], count: 0, kvReady: false });
  }

  const pixels = await getAllPixels();
  const wizardKeys = Object.entries(pixels).filter(([, v]) => (v?.boostTier || 0) === 4);

  // Fetch clicks in parallel
  const wizards = await Promise.all(wizardKeys.map(async ([k, v]) => {
    const clicks = await getClicks(v.col, v.row);
    return {
      key: k,
      col: v.col,
      row: v.row,
      owner: v.owner || '',
      handle: v.xHandle || '',
      avatar: v.xAvatar || '',
      color: v.color || '#8b5cf6',
      displayName: v.displayName || '',
      boostedAt: v.boostActivatedAt || 0,
      clicks,
    };
  }));

  // Sort by clicks desc, then by boostedAt asc (earlier boosters rank higher on ties)
  wizards.sort((a, b) => (b.clicks - a.clicks) || (a.boostedAt - b.boostedAt));

  res.setHeader('Cache-Control', 'public, max-age=30, stale-while-revalidate=60');
  return res.status(200).json({
    wizards,
    count: wizards.length,
    kvReady: true,
  });
};
