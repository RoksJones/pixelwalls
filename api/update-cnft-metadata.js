// api/update-cnft-metadata.js
// Updates pixel profile data stored in Vercel KV.
// 
// ARCHITECTURE DECISION:
// Rather than doing an expensive on-chain Bubblegum update (requires DAS proof,
// costs tx fees, takes seconds), we store profile data in Vercel KV.
// The NFT metadata URI already points to /api/metadata/col/row which reads
// from KV dynamically. So updating KV = updating the NFT metadata. Instant. Free.
//
// On-chain Bubblegum update (updateMetadataV2) is only needed if the URI itself
// changes — not needed for profile content changes since we control the endpoint.

const CORS = {
  'Access-Control-Allow-Origin':  '*',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type',
};

async function setKV(key, value) {
  const url   = process.env.KV_REST_API_URL;
  const token = process.env.KV_REST_API_TOKEN;
  if (!url || !token) return false;
  try {
    const r = await fetch(`${url}/set/${encodeURIComponent(key)}`, {
      method:  'POST',
      headers: {
        Authorization:  `Bearer ${token}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(value),
    });
    const d = await r.json().catch(() => ({}));
    if (d.error) { console.warn('setKV error:', d.error, 'for key', key); return false; }
    return true;
  } catch (e) { console.warn('setKV exception:', e.message); return false; }
}

async function verifyOwnership(assetId, claimedOwner, rpcUrl) {
  // Use Helius DAS getAsset to confirm on-chain owner
  try {
    const r = await fetch(rpcUrl, {
      method:  'POST',
      headers: { 'Content-Type': 'application/json' },
      body:    JSON.stringify({
        jsonrpc: '2.0', id: 1,
        method:  'getAsset',
        params:  { id: assetId },
      }),
    });
    const d = await r.json();
    return d?.result?.ownership?.owner === claimedOwner;
  } catch { return null; } // null = couldn't verify (KV still available)
}

module.exports = async function handler(req, res) {
  Object.entries(CORS).forEach(([k, v]) => res.setHeader(k, v));
  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'POST')    return res.status(405).json({ error: 'POST only' });

  const { mintAddress, ownerWallet, col, row, profile } = req.body || {};

  if (!ownerWallet || col === undefined || row === undefined || !profile) {
    return res.status(400).json({ error: 'Missing ownerWallet, col, row, or profile' });
  }

  const colNum = parseInt(col, 10);
  const rowNum = parseInt(row, 10);
  if (isNaN(colNum) || isNaN(rowNum)) {
    return res.status(400).json({ error: 'Invalid col/row' });
  }

  const rpcUrl = process.env.HELIUS_RPC_URL;

  // If assetId provided AND Helius configured, verify on-chain ownership
  if (mintAddress && rpcUrl) {
    const isOwner = await verifyOwnership(mintAddress, ownerWallet, rpcUrl);
    if (isOwner === false) {
      return res.status(403).json({
        error: 'Ownership verification failed. You do not own this cNFT on-chain.',
      });
    }
    // isOwner === null means DAS check failed — we allow the update but log it
    if (isOwner === null) {
      console.warn(`update-cnft: Could not verify ownership for asset ${mintAddress}. Proceeding.`);
    }
  }

  // Sanitize profile fields
  const sanitized = {
    displayName: (profile.displayName || '').slice(0, 50),
    desc:        (profile.desc        || '').slice(0, 160),
    color:       /^#[0-9a-fA-F]{6}$/.test(profile.color) ? profile.color : '#8b5cf6',
    website:     (profile.website     || '').startsWith('http') ? profile.website.slice(0, 200) : '',
    x:           (profile.x           || '').replace('@', '').slice(0, 50),
    telegram:    (profile.telegram    || '').replace('@', '').slice(0, 50),
    discord:     (profile.discord     || '').slice(0, 50),
    github:      (profile.github      || '').slice(0, 50),
    boostTier:   parseInt(profile.boostTier) || 0,
    updatedAt:   Date.now(),
    ownerWallet,
  };

  // Store in KV — this immediately updates what /api/metadata/col/row returns
  const kvKey  = `pixel_profile_${colNum}_${rowNum}`;
  const stored = await setKV(kvKey, sanitized);

  if (!stored) {
    // KV not configured — still return success (data lives in localStorage on client)
    console.warn('update-cnft: KV not configured, profile not persisted server-side');
    return res.status(200).json({
      success:  true,
      persisted: false,
      message:  'Profile saved locally. Set up Vercel KV to persist across devices.',
      col:      colNum,
      row:      rowNum,
    });
  }

  return res.status(200).json({
    success:   true,
    persisted: true,
    kvKey,
    col:       colNum,
    row:       rowNum,
    message:   `Profile updated. NFT metadata at /api/metadata/${colNum}/${rowNum} now reflects changes.`,
  });
};
