// api/xlogin.js  — Pixelwalls X OAuth 2.0 login (PKCE S256)
const { createHash, randomBytes } = require('crypto');

function base64url(buf) {
  return buf.toString('base64').replace(/\+/g, '-').replace(/\//g, '_').replace(/=/g, '');
}

module.exports = function handler(req, res) {
  const clientId    = process.env.X_CLIENT_ID;
  const redirectUri = process.env.X_REDIRECT_URI || 'https://pixelwalls.xyz/api/xcallback';

  if (!clientId) {
    return res.status(500).send('X_CLIENT_ID not set in Vercel environment variables.');
  }

  // PKCE — S256 (required by X / Twitter OAuth 2.0)
  const verifier  = base64url(randomBytes(48));                         // 64-char URL-safe string
  const challenge = base64url(createHash('sha256').update(verifier).digest()); // SHA-256

  // Forward any state the frontend passed (wallet, space, ref, returnUrl)
  const state = req.query.state || '';

  // Store verifier in HttpOnly cookie — read by xcallback
  res.setHeader('Set-Cookie', [
    `pkce_v=${verifier}; HttpOnly; Secure; SameSite=Lax; Max-Age=600; Path=/`,
  ]);

  const params = new URLSearchParams({
    response_type:         'code',
    client_id:             clientId,
    redirect_uri:          redirectUri,
    scope:                 'tweet.read users.read',
    state,
    code_challenge:        challenge,
    code_challenge_method: 'S256',
  });

  return res.redirect(302, 'https://twitter.com/i/oauth2/authorize?' + params.toString());
};
