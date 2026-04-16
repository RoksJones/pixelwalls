// api/update-cnft-metadata.js
// Updates mutable cNFT metadata after user edits their pixel profile.
// Uses Bubblegum updateMetadata instruction (available since Bubblegum v1).
// Replaces update-metadata.js (which was for standard NFTs).

const { Connection, Keypair, PublicKey } = require('@solana/web3.js');
const bs58 = require('bs58');

module.exports = async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', 'https://pixelwalls.xyz');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'POST') return res.status(405).json({ error: 'POST only' });

  const { assetId, ownerWallet, col, row, profile } = req.body || {};
  if (!assetId || !ownerWallet || col === undefined || row === undefined) {
    return res.status(400).json({ error: 'Missing required fields' });
  }

  const rpcUrl  = process.env.HELIUS_RPC_URL;
  const privKey = process.env.AUTHORITY_PRIVATE_KEY;
  if (!rpcUrl || !privKey) {
    return res.status(500).json({ error: 'Missing server config' });
  }

  const connection = new Connection(rpcUrl, 'confirmed');
  const authority  = Keypair.fromSecretKey(bs58.decode(privKey));

  try {
    // Verify ownership via DAS API (Helius supports getAsset)
    const dasRes = await fetch(rpcUrl, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        jsonrpc: '2.0', id: 1,
        method: 'getAsset',
        params: { id: assetId },
      }),
    });
    const dasData = await dasRes.json();
    const ownerOnChain = dasData?.result?.ownership?.owner;

    if (ownerOnChain !== ownerWallet) {
      return res.status(403).json({
        error: `Ownership mismatch. On-chain owner: ${ownerOnChain}`
      });
    }

    // Build updated attributes
    const colNum = parseInt(col);
    const rowNum = parseInt(row);
    const attributes = [
      { trait_type: 'Column',   value: String(colNum) },
      { trait_type: 'Row',      value: String(rowNum) },
      { trait_type: 'Position', value: `${colNum}x${rowNum}` },
    ];
    if (profile.color)    attributes.push({ trait_type: 'Color',       value: profile.color });
    if (profile.x)        attributes.push({ trait_type: 'X',           value: profile.x });
    if (profile.discord)  attributes.push({ trait_type: 'Discord',     value: profile.discord });
    if (profile.telegram) attributes.push({ trait_type: 'Telegram',    value: profile.telegram });
    if (profile.github)   attributes.push({ trait_type: 'GitHub',      value: profile.github });
    if (profile.website)  attributes.push({ trait_type: 'Website',     value: profile.website });

    // Update via Metaplex JS SDK (Bubblegum updateMetadata)
    const { Metaplex, keypairIdentity } = await import('@metaplex-foundation/js');
    const metaplex = Metaplex.make(connection).use(keypairIdentity(authority));

    const asset = new PublicKey(assetId);

    await metaplex.nfts().updateMetadata({
      leafOwner:     new PublicKey(ownerWallet),
      currentLeafDelegate: new PublicKey(ownerWallet),
      nftOrSft: {
        address: asset,
        compression: dasData.result.compression,
      },
      name:   `Pixelwalls ${colNum}x${rowNum}`,
      symbol: 'PXLW',
      uri:    `https://pixelwalls.xyz/api/metadata/${colNum}/${rowNum}`,
      sellerFeeBasisPoints: 500,
      isMutable: true,
    });

    return res.status(200).json({
      success: true,
      assetId,
      message: `cNFT metadata updated for pixel (${colNum},${rowNum})`,
    });

  } catch (e) {
    console.error('cNFT update error:', e);
    return res.status(500).json({ error: 'cNFT metadata update failed: ' + e.message });
  }
};
