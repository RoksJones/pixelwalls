// api/metadata.js
// Serves Metaplex-compatible NFT metadata JSON for each pixel.
// URL: https://pixelwalls.xyz/api/metadata/COL/ROW
// e.g. https://pixelwalls.xyz/api/metadata/0/0

module.exports = async function handler(req, res) {
  // Parse col/row from path: /api/metadata/42/17
  const parts = (req.url || '').replace('/api/metadata', '').split('/').filter(Boolean);
  const col   = parseInt(parts[0], 10);
  const row   = parseInt(parts[1], 10);

  if (isNaN(col) || isNaN(row) || col < 0 || col > 999 || row < 0 || row > 999) {
    return res.status(400).json({ error: 'Invalid pixel coordinates' });
  }

  // Determine price tier for attributes
  const tier = col * 1000 + row < 100000 ? 'Tier 1 — 0.01 SOL'
             : col * 1000 + row < 300000 ? 'Tier 2 — 0.03 SOL'
             : col * 1000 + row < 600000 ? 'Tier 3 — 0.07 SOL'
             : col * 1000 + row < 900000 ? 'Tier 4 — 0.15 SOL'
             :                             'Tier 5 — 0.50 SOL';

  const metadata = {
    name:         `Pixelwalls ${col}x${row}`,
    symbol:       'PXLW',
    description:  `Permanent pixel space at position (${col}, ${row}) on The Eternal Wall — pixelwalls.xyz. This NFT represents immutable ownership of 1 pixel on a 1,000,000 space Solana blockchain canvas.`,
    image:        `https://pixelwalls.xyz/api/pixel-image/${col}/${row}`,
    external_url: `https://pixelwalls.xyz?pixel=${col},${row}`,
    seller_fee_basis_points: 500,
    attributes: [
      { trait_type: 'Column',        value: col },
      { trait_type: 'Row',           value: row },
      { trait_type: 'Position',      value: `${col}x${row}` },
      { trait_type: 'Mint Tier',     value: tier },
      { trait_type: 'Wall',          value: 'The Eternal Wall' },
      { trait_type: 'Chain',         value: 'Solana' },
    ],
    properties: {
      files:    [{ uri: `https://pixelwalls.xyz/api/pixel-image/${col}/${row}`, type: 'image/png' }],
      category: 'image',
      creators: [{ address: '9LABvUXzxnQghFCnjVETzAPBwhFAb4UT2qSVsFvHViHk', share: 100 }],
    },
    collection: {
      name:   'Pixelwalls',
      family: 'PXLW',
    },
  };

  res.setHeader('Content-Type', 'application/json');
  res.setHeader('Cache-Control', 'public, max-age=86400'); // cache 24h
  res.setHeader('Access-Control-Allow-Origin', '*');
  return res.status(200).json(metadata);
};
