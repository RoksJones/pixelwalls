module.exports = function handler(req, res) {
  const clientId    = process.env.X_CLIENT_ID;
  const redirectUri = process.env.X_REDIRECT_URI || 'https://pixelwalls.xyz/api/xcallback';

  if (!clientId) {
    return res.status(500).send('X_CLIENT_ID not configured in Vercel environment variables');
  }

  const state    = req.query.state || '';
  const verifier = 'pw' + Date.now() + Math.random().toString(36).slice(2);

  res.setHeader('Set-Cookie', `pkce=${verifier}; HttpOnly; Secure; SameSite=Lax; Max-Age=600; Path=/`);

  const params = new URLSearchParams({
    response_type:         'code',
    client_id:             clientId,
    redirect_uri:          redirectUri,
    scope:                 'tweet.read users.read',
    state,
    code_challenge:        verifier,
    code_challenge_method: 'plain',
  });

  return res.redirect(302, 'https://twitter.com/i/oauth2/authorize?' + params.toString());
};
