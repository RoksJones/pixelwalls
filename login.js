// api/auth/twitter/login.js
// Redirects user to X OAuth 2.0 authorization page
// Env vars required: X_CLIENT_ID, X_REDIRECT_URI

module.exports = function handler(req, res) {
  const clientId    = process.env.X_CLIENT_ID;
  const redirectUri = process.env.X_REDIRECT_URI
    || 'https://pixelwalls.xyz/api/auth/twitter/callback';

  if (!clientId) {
    return res.status(500).json({ error: 'X_CLIENT_ID not set in Vercel env vars' });
  }

  // Pull state from query (wallet address + selected space)
  const state = req.query.state || '';

  // Simple PKCE verifier (plain method for compatibility)
  const verifier = 'pw_' + Math.random().toString(36).slice(2)
                         + Math.random().toString(36).slice(2);

  // Store verifier in cookie so callback can verify
  res.setHeader('Set-Cookie',
    `pkce=${verifier}; HttpOnly; Secure; SameSite=Lax; Max-Age=600; Path=/`
  );

  const params = new URLSearchParams({
    response_type:         'code',
    client_id:             clientId,
    redirect_uri:          redirectUri,
    scope:                 'tweet.read users.read',
    state:                 state,
    code_challenge:        verifier,
    code_challenge_method: 'plain',
  });

  res.redirect(302,
    'https://twitter.com/i/oauth2/authorize?' + params.toString()
  );
};
