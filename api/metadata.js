// api/metadata.js
// Dynamic NFT metadata — reads pixel profile from Vercel KV so updates are
// instant and free (no on-chain tx needed for profile changes).
// URL: /api/metadata/COL/ROW  (routed via vercel.json)

const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'GET, OPTIONS',
};

async function getKV(key) {
  const url   = process.env.KV_REST_API_URL;
  const token = process.env.KV_REST_API_TOKEN;
  if (!url || !token) return null;
  try {
    const r = await fetch(url, {
      method: 'POST',
      headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
      body: JSON.stringify(['GET', key]),
    });
    const d = await r.json();
    if (!d.result) return null;
    try { return JSON.parse(d.result); } catch { return d.result; }
  } catch { return null; }
}

module.exports = async function handler(req, res) {
  Object.entries(CORS).forEach(([k, v]) => res.setHeader(k, v));
  if (req.method === 'OPTIONS') return res.status(200).end();

  // Parse col/row — vercel.json routes /api/metadata/:col/:row here
  const parts = (req.url || '').replace(/^\/api\/metadata\/?/, '').split('/').filter(Boolean);
  const col   = parseInt(parts[0], 10);
  const row   = parseInt(parts[1], 10);

  if (isNaN(col) || isNaN(row) || col < 0 || col > 999 || row < 0 || row > 999) {
    return res.status(400).json({ error: 'Invalid pixel coordinates (0–999)' });
  }

  const creator = process.env.CREATOR_ADDRESS || '9LABvUXzxnQghFCnjVETzAPBwhFAb4UT2qSVsFvHViHk';

  // Try to load saved pixel profile from KV (set when user edits their pixel)
  const profile = await getKV(`pixel_profile_${col}_${row}`) || {};

  // Price tier by pixel index (col * 1000 + row)
  const idx  = col * 1000 + row;
  const tier = idx < 100000 ? 'Tier 1 — 0.01 SOL'
             : idx < 300000 ? 'Tier 2 — 0.03 SOL'
             : idx < 600000 ? 'Tier 3 — 0.07 SOL'
             : idx < 900000 ? 'Tier 4 — 0.15 SOL'
             :                'Tier 5 — 0.50 SOL';

  const name        = profile.displayName ? `${profile.displayName} — ${col}×${row}` : `Pixelwalls ${col}×${row}`;
  const description = profile.desc
    ? `${profile.desc}\n\nPixel (${col}, ${row}) on The Eternal Wall — pixelwalls.xyz`
    : `Permanent pixel space at (${col}, ${row}) on The Eternal Wall. Immutable Solana ownership. 1 of 1,000,000.`;

  const attributes = [
    { trait_type: 'Column',     value: col },
    { trait_type: 'Row',        value: row },
    { trait_type: 'Position',   value: `${col}×${row}` },
    { trait_type: 'Mint Tier',  value: tier },
    { trait_type: 'Wall',       value: 'The Eternal Wall' },
    { trait_type: 'Chain',      value: 'Solana' },
  ];
  if (profile.color)   attributes.push({ trait_type: 'Color',    value: profile.color });
  if (profile.x)       attributes.push({ trait_type: 'X Handle', value: profile.x });
  if (profile.website) attributes.push({ trait_type: 'Website',  value: profile.website });
  if (profile.boostTier && profile.boostTier > 0) {
    const boostName = ['', 'Mage', 'Sorcerer', 'Warlock', 'Wizard'][profile.boostTier] || 'Boosted';
    attributes.push({ trait_type: 'Boost', value: boostName });
  }

  const imageUri = `https://pixelwalls.xyz/api/pixel-image/${col}/${row}`;

  const metadata = {
    name,
    symbol:      'PXLW',
    description,
    image:       imageUri,
    external_url:`https://pixelwalls.xyz?pixel=${col},${row}`,
    seller_fee_basis_points: 500,
    attributes,
    properties: {
      files:    [{ uri: imageUri, type: 'image/svg+xml' }],
      category: 'image',
      creators: [{ address: creator, share: 100 }],
    },
    collection: { name: 'Pixelwalls', family: 'PXLW' },
  };

  res.setHeader('Content-Type', 'application/json');
  // Short cache — profile can be updated, we want changes visible quickly
  res.setHeader('Cache-Control', 'public, max-age=300, stale-while-revalidate=60');
  return res.status(200).json(metadata);
};
