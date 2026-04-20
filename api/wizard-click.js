// api/wizard-click.js
// Records a click on a Wizard-boosted pixel — increments a per-pixel counter in KV.
// POST /api/wizard-click  body: {col, row}
// GET  /api/wizard-click?col=x&row=y  → returns current click count

const CORS = {
  'Access-Control-Allow-Origin': '*',
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

module.exports = async function handler(req, res) {
  Object.entries(CORS).forEach(([k, v]) => res.setHeader(k, v));
  if (req.method === 'OPTIONS') return res.status(200).end();

  const col = parseInt(req.query?.col ?? req.body?.col, 10);
  const row = parseInt(req.query?.row ?? req.body?.row, 10);
  if (isNaN(col) || isNaN(row) || col < 0 || col > 999 || row < 0 || row > 999) {
    return res.status(400).json({ error: 'Invalid col/row' });
  }

  const key = `wizard_clicks_${col}_${row}`;

  if (req.method === 'POST') {
    // Verify the pixel actually has a wizard boost before counting
    const pixelRaw = await upstashCmd(['GET', `pixel_${col}_${row}`]);
    let pixel = null;
    try { pixel = pixelRaw ? JSON.parse(pixelRaw) : null; } catch {}
    if (!pixel || (pixel.boostTier || 0) !== 4) {
      return res.status(400).json({ error: 'Pixel is not wizard-boosted' });
    }
    const newCount = await upstashCmd(['INCR', key]);
    return res.status(200).json({ col, row, clicks: newCount || 0 });
  }

  if (req.method === 'GET') {
    const raw = await upstashCmd(['GET', key]);
    const clicks = raw == null ? 0 : (parseInt(raw, 10) || 0);
    res.setHeader('Cache-Control', 'public, max-age=10');
    return res.status(200).json({ col, row, clicks });
  }

  return res.status(405).json({ error: 'Method not allowed' });
};
