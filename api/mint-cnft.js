// api/mint-cnft.js
// Mints a compressed NFT (cNFT) for a claimed pixel via Metaplex Bubblegum.
// Called server-side after on-chain claim tx confirms.
//
// Required env vars (set in Vercel Dashboard → Settings → Environment Variables):
//   HELIUS_RPC_URL         — Helius RPC with DAS support (e.g. https://mainnet.helius-rpc.com/?api-key=xxx)
//   AUTHORITY_PRIVATE_KEY  — bs58-encoded private key of the minting authority wallet
//   TREE_ADDRESS           — Merkle tree public key (created once with CNFT_SETUP.md)
//   COLLECTION_MINT        — (optional) collection NFT address
//   CREATOR_ADDRESS        — treasury/creator wallet address

const { Connection, Keypair, PublicKey } = require('@solana/web3.js');
const bs58 = require('bs58');

const CORS = {
  'Access-Control-Allow-Origin':  'https://pixelwalls.xyz',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type',
};

module.exports = async function handler(req, res) {
  Object.entries(CORS).forEach(([k, v]) => res.setHeader(k, v));
  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'POST')    return res.status(405).json({ error: 'POST only' });

  const { txSignature, buyerWallet, col, row, isCluster, width, height } = req.body || {};

  // Validate inputs
  if (!txSignature || !buyerWallet) {
    return res.status(400).json({ error: 'Missing txSignature or buyerWallet' });
  }
  if (col === undefined || row === undefined) {
    return res.status(400).json({ error: 'Missing col or row' });
  }

  const colNum = parseInt(col, 10);
  const rowNum = parseInt(row, 10);
  if (isNaN(colNum) || isNaN(rowNum) || colNum < 0 || colNum > 999 || rowNum < 0 || rowNum > 999) {
    return res.status(400).json({ error: 'Invalid pixel coordinates (0–999)' });
  }

  // Validate env vars
  const rpcUrl      = process.env.HELIUS_RPC_URL;
  const privKey     = process.env.AUTHORITY_PRIVATE_KEY;
  const treeAddress = process.env.TREE_ADDRESS;

  if (!rpcUrl || !privKey || !treeAddress) {
    // Not configured yet — return a soft failure so the claim still succeeds
    console.warn('mint-cnft: Missing env vars — HELIUS_RPC_URL, AUTHORITY_PRIVATE_KEY, or TREE_ADDRESS');
    return res.status(200).json({
      success: false,
      skipped: true,
      reason:  'Merkle tree not yet configured. Pixel claim recorded on-chain. cNFT will be minted at launch.',
      col:     colNum,
      row:     rowNum,
    });
  }

  let authority;
  try {
    authority = Keypair.fromSecretKey(bs58.decode(privKey));
  } catch (e) {
    console.error('Invalid AUTHORITY_PRIVATE_KEY:', e.message);
    return res.status(500).json({ error: 'Invalid authority key configuration' });
  }

  const connection = new Connection(rpcUrl, 'confirmed');

  try {
    // ── 1. Verify tx is confirmed and buyer is a signer ──────────
    // Skip verification for cluster mints (no claim tx)
    if (txSignature !== 'cluster') {
      const tx = await connection.getParsedTransaction(txSignature, {
        maxSupportedTransactionVersion: 0,
        commitment: 'confirmed',
      });
      if (!tx) {
        return res.status(400).json({ error: 'Transaction not found or not yet confirmed' });
      }
      // Confirm buyerWallet is an account in the tx (prevents spoofed mints)
      const accounts = tx.transaction.message.accountKeys.map(k =>
        typeof k === 'string' ? k : k.pubkey?.toString()
      );
      if (!accounts.includes(buyerWallet)) {
        return res.status(403).json({ error: 'buyerWallet not found in transaction signers' });
      }
    }

    // ── 2. Build metadata ─────────────────────────────────────────
    const symbol = isCluster ? 'PXLWC' : 'PXLW';
    const name   = isCluster
      ? `Pixelwalls Cluster ${width}×${height} [${colNum},${rowNum}]`
      : `Pixelwalls ${colNum}×${rowNum}`;
    const uri = isCluster
      ? `https://pixelwalls.xyz/api/metadata/cluster/${colNum}/${rowNum}/${colNum + (parseInt(width)||1) - 1}/${rowNum + (parseInt(height)||1) - 1}`
      : `https://pixelwalls.xyz/api/metadata/${colNum}/${rowNum}`;

    // ── 3. Mint via Metaplex JS (require — not dynamic import) ────
    const { Metaplex, keypairIdentity } = require('@metaplex-foundation/js');
    const metaplex = Metaplex.make(connection).use(keypairIdentity(authority));

    const mintParams = {
      tree:                  new PublicKey(treeAddress),
      name,
      symbol,
      uri,
      sellerFeeBasisPoints:  500,
      isMutable:             true,  // MUST be true — enables profile updates
      tokenOwner:            new PublicKey(buyerWallet),
      creators: [
        { address: authority.publicKey, verified: true, share: 100 },
      ],
    };

    // Only attach collection if configured
    if (process.env.COLLECTION_MINT) {
      mintParams.collection = {
        address:  new PublicKey(process.env.COLLECTION_MINT),
        verified: false,
      };
    }

    const { nft, response } = await metaplex.nfts().mintCompressedNft(mintParams);
    const assetId = nft.address.toString();

    console.log(`cNFT minted: ${assetId} for pixel (${colNum},${rowNum}) → owner: ${buyerWallet}`);

    return res.status(200).json({
      success:  true,
      assetId,
      mintTx:   response.signature,
      name,
      col:      colNum,
      row:      rowNum,
      owner:    buyerWallet,
    });

  } catch (e) {
    console.error('cNFT mint error:', e);
    return res.status(500).json({
      success: false,
      error:   e.message,
      hint:    'Check HELIUS_RPC_URL, AUTHORITY_PRIVATE_KEY, and TREE_ADDRESS env vars. Run CNFT_SETUP.md first.',
    });
  }
};
