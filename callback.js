// api/auth/twitter/callback.js
// Vercel serverless function — handles X OAuth callback
// Requires env vars: X_CLIENT_ID, X_CLIENT_SECRET, X_REDIRECT_URI

export default async function handler(req, res) {
  const { code, state, error } = req.query;

  // ── Error from X ────────────────────────────────────────
  if (error) {
    return res.redirect(302, '/?xauth=error&reason=' + encodeURIComponent(error));
  }

  if (!code) {
    return res.redirect(302, '/?xauth=error&reason=no_code');
  }

  // ── Parse state ─────────────────────────────────────────
  let stateData = { wallet: null, space: null };
  try {
    stateData = JSON.parse(decodeURIComponent(state || '{}'));
  } catch (e) {}

  // ── Get PKCE verifier from cookie ───────────────────────
  const cookies   = Object.fromEntries(
    (req.headers.cookie || '').split(';').map(c => c.trim().split('='))
  );
  const verifier  = cookies['pkce_verifier'] || '';

  // ── Exchange code for access token ──────────────────────
  const clientId      = process.env.X_CLIENT_ID;
  const clientSecret  = process.env.X_CLIENT_SECRET;
  const redirectUri   = process.env.X_REDIRECT_URI || 'https://pixelwalls.xyz/api/auth/twitter/callback';

  const basicAuth = Buffer.from(`${clientId}:${clientSecret}`).toString('base64');

  let accessToken;
  try {
    const tokenRes = await fetch('https://api.twitter.com/2/oauth2/token', {
      method:  'POST',
      headers: {
        'Content-Type':  'application/x-www-form-urlencoded',
        'Authorization': `Basic ${basicAuth}`,
      },
      body: new URLSearchParams({
        code,
        grant_type:            'authorization_code',
        client_id:             clientId,
        redirect_uri:          redirectUri,
        code_verifier:         verifier,
      }).toString(),
    });

    const tokenData = await tokenRes.json();
    if (!tokenRes.ok || !tokenData.access_token) {
      console.error('Token exchange failed:', tokenData);
      return res.redirect(302, '/?xauth=error&reason=token_exchange');
    }
    accessToken = tokenData.access_token;
  } catch (e) {
    console.error('Token fetch error:', e);
    return res.redirect(302, '/?xauth=error&reason=network');
  }

  // ── Fetch X user info ───────────────────────────────────
  let xHandle, xName, xAvatar;
  try {
    const userRes = await fetch('https://api.twitter.com/2/users/me?user.fields=name,profile_image_url', {
      headers: { 'Authorization': `Bearer ${accessToken}` },
    });
    const userData = await userRes.json();
    xHandle  = userData.data?.username;
    xName    = userData.data?.name;
    xAvatar  = userData.data?.profile_image_url?.replace('_normal', '_400x400');
  } catch (e) {
    return res.redirect(302, '/?xauth=error&reason=user_fetch');
  }

  if (!xHandle) {
    return res.redirect(302, '/?xauth=error&reason=no_user');
  }

  // ── Clear PKCE cookie ────────────────────────────────────
  res.setHeader('Set-Cookie', 'pkce_verifier=; HttpOnly; Secure; Max-Age=0; Path=/');

  // ── Redirect back to site with verified info ─────────────
  const params = new URLSearchParams({
    xauth:  'success',
    handle: xHandle,
    name:   xName    || xHandle,
    avatar: xAvatar  || '',
    wallet: stateData.wallet || '',
    space:  stateData.space  || '',
  });

  res.redirect(302, '/?' + params.toString());
}
