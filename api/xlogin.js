// api/xlogin.js  — Pixelwalls X OAuth 2.0 login (PKCE S256)
// Stores PKCE verifier in both cookie AND query state so callback
// always has it even if cookie is dropped.
const { createHash, randomBytes } = require('crypto');

function base64url(buf) {
  return buf.toString('base64')
    .replace(/\+/g, '-')
    .replace(/\//g, '_')
    .replace(/=/g, '');
}

module.exports = function handler(req, res) {
  const clientId    = process.env.X_CLIENT_ID;
  const redirectUri = process.env.X_REDIRECT_URI || 'https://pixelwalls.xyz/api/xcallback';

  if (!clientId) {
    return res.status(500).send(
      'X_CLIENT_ID is not set. Go to Vercel → Settings → Environment Variables.'
    );
  }

  // PKCE S256 — required by X OAuth 2.0
  const verifier  = base64url(randomBytes(48));
  const challenge = base64url(createHash('sha256').update(verifier).digest());

  // Parse state passed by frontend (wallet, space, ref, returnUrl)
  let stateData = {};
  try {
    stateData = JSON.parse(decodeURIComponent(req.query.state || '{}'));
  } catch (_) {}

  // Embed verifier IN the state so callback always has it
  // This is a fallback for when the cookie is dropped (e.g. some mobile browsers)
  const statePayload = encodeURIComponent(JSON.stringify({
    ...stateData,
    _v: verifier,   // PKCE verifier embedded in state
  }));

  // Also set as HttpOnly cookie (belt and suspenders)
  res.setHeader('Set-Cookie',
    `pkce_v=${verifier}; HttpOnly; Secure; SameSite=Lax; Max-Age=600; Path=/`
  );

  const params = new URLSearchParams({
    response_type:         'code',
    client_id:             clientId,
    redirect_uri:          redirectUri,
    scope:                 'tweet.read users.read',
    state:                 statePayload,
    code_challenge:        challenge,
    code_challenge_method: 'S256',
  });

  return res.redirect(302, 'https://twitter.com/i/oauth2/authorize?' + params.toString());
};
