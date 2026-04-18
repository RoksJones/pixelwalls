// api/cluster-metadata.js
// Metaplex-compatible metadata for Cluster NFTs (merged pixel blocks)
// URL: /api/metadata/cluster/C1/R1/C2/R2 (routed via vercel.json)

const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'GET, OPTIONS',
};

module.exports = async function handler(req, res) {
  Object.entries(CORS).forEach(([k, v]) => res.setHeader(k, v));
  if (req.method === 'OPTIONS') return res.status(200).end();

  const parts = (req.url || '').split('/').filter(Boolean);
  const idx   = parts.indexOf('cluster');

  if (idx === -1 || parts.length < idx + 5) {
    return res.status(400).json({ error: 'URL must be /api/metadata/cluster/c1/r1/c2/r2' });
  }

  const c1 = parseInt(parts[idx + 1], 10);
  const r1 = parseInt(parts[idx + 2], 10);
  const c2 = parseInt(parts[idx + 3], 10);
  const r2 = parseInt(parts[idx + 4], 10);

  if ([c1, r1, c2, r2].some(isNaN)) {
    return res.status(400).json({ error: 'Coordinates must be integers' });
  }
  if (c1 > c2 || r1 > r2) {
    return res.status(400).json({ error: 'Start coords must be ≤ end coords' });
  }
  if ([c1, r1, c2, r2].some(n => n < 0 || n > 999)) {
    return res.status(400).json({ error: 'Coordinates must be 0–999' });
  }

  const width      = c2 - c1 + 1;
  const height     = r2 - r1 + 1;
  const pixelCount = width * height;
  const creator    = process.env.CREATOR_ADDRESS || '9LABvUXzxnQghFCnjVETzAPBwhFAb4UT2qSVsFvHViHk';

  const tier = pixelCount >= 64 ? 'Legendary'
             : pixelCount >= 25 ? 'Epic'
             : pixelCount >= 16 ? 'Rare'
             :                    'Uncommon';

  const imageUri = `https://pixelwalls.xyz/api/pixel-image/cluster/${c1}/${r1}/${c2}/${r2}`;

  const metadata = {
    name:        `Pixelwalls Cluster ${width}×${height} [${c1},${r1}→${c2},${r2}]`,
    symbol:      'PXLWC',
    description: `A ${width}×${height} merged pixel cluster on The Eternal Wall. ${pixelCount} pixels forged into this ${tier} NFT. Position: (${c1},${r1}) → (${c2},${r2}). Permanent & tradeable on Solana.`,
    image:       imageUri,
    external_url:`https://pixelwalls.xyz?cluster=${c1},${r1},${c2},${r2}`,
    seller_fee_basis_points: 500,
    attributes: [
      { trait_type: 'Type',         value: 'Cluster' },
      { trait_type: 'Rarity',       value: tier },
      { trait_type: 'Width',        value: width },
      { trait_type: 'Height',       value: height },
      { trait_type: 'Pixel Count',  value: pixelCount },
      { trait_type: 'Area',         value: `${width}×${height}` },
      { trait_type: 'Top-Left',     value: `${c1},${r1}` },
      { trait_type: 'Bottom-Right', value: `${c2},${r2}` },
      { trait_type: 'Wall',         value: 'The Eternal Wall' },
    ],
    properties: {
      files:    [{ uri: imageUri, type: 'image/svg+xml' }],
      category: 'image',
      creators: [{ address: creator, share: 100 }],
    },
    collection: { name: 'Pixelwalls Clusters', family: 'PXLWC' },
  };

  res.setHeader('Content-Type', 'application/json');
  res.setHeader('Cache-Control', 'public, max-age=3600');
  return res.status(200).json(metadata);
};
