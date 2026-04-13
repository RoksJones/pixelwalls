// api/auth/twitter/login.js
// Vercel serverless function — redirects user to X OAuth
// Requires env vars: X_CLIENT_ID, X_REDIRECT_URI

export default function handler(req, res) {
  const { state } = req.query;

  const clientId     = process.env.X_CLIENT_ID;
  const redirectUri  = process.env.X_REDIRECT_URI || 'https://pixelwalls.xyz/api/auth/twitter/callback';

  if (!clientId) {
    return res.status(500).json({ error: 'X_CLIENT_ID not configured' });
  }

  // X OAuth 2.0 PKCE params
  const scope     = 'tweet.read users.read';
  const challenge = 'pixelwalls_' + Math.random().toString(36).slice(2); // simplified — use proper PKCE in prod

  // Store challenge in cookie for callback verification
  res.setHeader('Set-Cookie', `pkce_verifier=${challenge}; HttpOnly; Secure; SameSite=Lax; Max-Age=600; Path=/`);

  const params = new URLSearchParams({
    response_type:         'code',
    client_id:             clientId,
    redirect_uri:          redirectUri,
    scope,
    state:                 state || '',
    code_challenge:        challenge,
    code_challenge_method: 'plain',
  });

  res.redirect(302, `https://twitter.com/i/oauth2/authorize?${params.toString()}`);
}
