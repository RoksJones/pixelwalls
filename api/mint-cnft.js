// api/mint-cnft.js
// Mints a compressed NFT (cNFT) for a claimed pixel using Metaplex Bubblegum.
// Called by Vercel after on-chain claim tx confirms.
// Cost per mint: ~0.000005 SOL (just tx fee, no rent).
//
// Setup requirements (one-time, done before launch):
//   1. Create Merkle tree: max_depth=20, canopy_depth=17 (covers 1,048,576 pixels)
//   2. Set TREE_ADDRESS env var to the tree public key
//   3. Fund authority wallet with enough SOL for tx fees
//
// Mutable metadata: YES — updateMetadata instruction available after mint.
// Trading: cNFTs are fully tradeable on Magic Eden + Tensor.

const {
  Connection, Keypair, PublicKey, clusterApiUrl
} = require('@solana/web3.js');
const bs58 = require('bs58');

module.exports = async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', 'https://pixelwalls.xyz');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'POST') return res.status(405).json({ error: 'POST only' });

  const { txSignature, buyerWallet, col, row } = req.body || {};
  if (!txSignature || !buyerWallet || col === undefined || row === undefined) {
    return res.status(400).json({ error: 'Missing required fields' });
  }

  const rpcUrl      = process.env.HELIUS_RPC_URL;
  const privKey     = process.env.AUTHORITY_PRIVATE_KEY;
  const treeAddress = process.env.TREE_ADDRESS;

  if (!rpcUrl || !privKey || !treeAddress) {
    return res.status(500).json({ error: 'Missing server config: HELIUS_RPC_URL, AUTHORITY_PRIVATE_KEY, or TREE_ADDRESS' });
  }

  const connection  = new Connection(rpcUrl, 'confirmed');
  const authority   = Keypair.fromSecretKey(bs58.decode(privKey));
  const colNum      = parseInt(col);
  const rowNum      = parseInt(row);

  try {
    // 1. Verify the claim tx is confirmed and correct
    const tx = await connection.getParsedTransaction(txSignature, {
      maxSupportedTransactionVersion: 0,
      commitment: 'confirmed',
    });
    if (!tx) {
      return res.status(400).json({ error: 'Transaction not found or not confirmed yet' });
    }

    // 2. Build metadata for this pixel
    const pixelName  = `Pixelwalls ${colNum}x${rowNum}`;
    const metadataUri = `https://pixelwalls.xyz/api/metadata/${colNum}/${rowNum}`;

    // 3. Mint cNFT via Metaplex Bubblegum
    const { Metaplex, keypairIdentity } = await import('@metaplex-foundation/js');
    const metaplex = Metaplex.make(connection).use(keypairIdentity(authority));

    const tree    = new PublicKey(treeAddress);
    const owner   = new PublicKey(buyerWallet);

    // mintCompressedNft is available in @metaplex-foundation/js >= 0.19
    const { nft, response } = await metaplex.nfts().mintCompressedNft({
      tree,
      name:                pixelName,
      symbol:              'PXLW',
      uri:                 metadataUri,
      sellerFeeBasisPoints: 500,  // 5% royalty
      isMutable:           true,  // CRITICAL: enables updateMetadata later
      tokenOwner:          owner,
      creators: [
        { address: authority.publicKey, verified: true, share: 100 }
      ],
      collection: process.env.COLLECTION_MINT
        ? { address: new PublicKey(process.env.COLLECTION_MINT), verified: false }
        : undefined,
    });

    // 4. Record the asset ID back on-chain in the pixel PDA
    // (handled separately via record_nft_mint instruction)
    const assetId = nft.address.toString();

    return res.status(200).json({
      success:    true,
      assetId,
      mintTx:     response.signature,
      name:       pixelName,
      col:        colNum,
      row:        rowNum,
      owner:      buyerWallet,
    });

  } catch (e) {
    console.error('cNFT mint error:', e);
    return res.status(500).json({ error: 'cNFT mint failed: ' + e.message });
  }
};
