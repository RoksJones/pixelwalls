// api/cluster-metadata.js
// Serves metadata for Cluster NFTs
// URL: /api/metadata/cluster/COL_START/ROW_START/COL_END/ROW_END

module.exports = async function handler(req, res) {
  const parts = (req.url || '').split('/').filter(Boolean);
  // parts: ['api','metadata','cluster', c1, r1, c2, r2]
  const idx = parts.indexOf('cluster');
  const c1 = parseInt(parts[idx+1]), r1 = parseInt(parts[idx+2]);
  const c2 = parseInt(parts[idx+3]), r2 = parseInt(parts[idx+4]);

  if ([c1,r1,c2,r2].some(isNaN)) {
    return res.status(400).json({ error: 'Invalid cluster coordinates' });
  }

  const width      = c2 - c1 + 1;
  const height     = r2 - r1 + 1;
  const pixelCount = width * height;

  const tier = pixelCount >= 64 ? 'Legendary'
             : pixelCount >= 25 ? 'Epic'
             : pixelCount >= 16 ? 'Rare'
             :                    'Uncommon';

  const metadata = {
    name:        `Pixelwalls Cluster ${width}×${height} [${c1},${r1}]`,
    symbol:      'PXLWC',
    description: `A ${width}×${height} merged pixel cluster on The Eternal Wall. ${pixelCount} individual pixels were burned to forge this ${tier} NFT. Position: (${c1},${r1}) → (${c2},${r2}). Ownership is permanent and tradeable.`,
    image:       `https://pixelwalls.xyz/api/pixel-image/cluster/${c1}/${r1}/${c2}/${r2}`,
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
      { trait_type: 'Pixels Burned',value: pixelCount },
      { trait_type: 'Wall',         value: 'The Eternal Wall' },
    ],
    properties: {
      files:    [{ uri: `https://pixelwalls.xyz/api/pixel-image/cluster/${c1}/${r1}/${c2}/${r2}`, type: 'image/svg+xml' }],
      category: 'image',
      creators: [{ address: '9LABvUXzxnQghFCnjVETzAPBwhFAb4UT2qSVsFvHViHk', share: 100 }],
    },
    collection: { name: 'Pixelwalls Clusters', family: 'PXLWC' },
  };

  res.setHeader('Content-Type', 'application/json');
  res.setHeader('Cache-Control', 'public, max-age=3600');
  return res.status(200).json(metadata);
};
