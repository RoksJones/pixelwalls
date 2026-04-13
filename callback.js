// api/auth/twitter/callback.js
// Handles the return from X OAuth, exchanges code for token,
// fetches user info, then redirects back to the site with verified data.
// Env vars required: X_CLIENT_ID, X_CLIENT_SECRET, X_REDIRECT_URI

module.exports = async function handler(req, res) {
  const { code, state, error } = req.query;

  // ── X returned an error ─────────────────────────────────
  if (error) {
    return res.redirect(302,
      '/?xauth=error&reason=' + encodeURIComponent(error)
    );
  }
  if (!code) {
    return res.redirect(302, '/?xauth=error&reason=no_code');
  }

  // ── Parse state (wallet + space) ────────────────────────
  let stateData = { wallet: '', space: '' };
  try {
    stateData = JSON.parse(decodeURIComponent(state || '{}'));
  } catch (_) {}

  // ── Get PKCE verifier from cookie ───────────────────────
  const cookies = {};
  (req.headers.cookie || '').split(';').forEach(c => {
    const [k, v] = c.trim().split('=');
    if (k && v) cookies[k.trim()] = v.trim();
  });
  const verifier = cookies['pkce'] || '';

  // ── Config ───────────────────────────────────────────────
  const clientId     = process.env.X_CLIENT_ID;
  const clientSecret = process.env.X_CLIENT_SECRET;
  const redirectUri  = process.env.X_REDIRECT_URI
    || 'https://pixelwalls.xyz/api/auth/twitter/callback';

  if (!clientId || !clientSecret) {
    return res.redirect(302, '/?xauth=error&reason=missing_env');
  }

  // ── Exchange code for access token ───────────────────────
  let accessToken;
  try {
    const basicAuth = Buffer.from(clientId + ':' + clientSecret).toString('base64');

    const tokenRes = await fetch('https://api.twitter.com/2/oauth2/token', {
      method:  'POST',
      headers: {
        'Content-Type':  'application/x-www-form-urlencoded',
        'Authorization': 'Basic ' + basicAuth,
      },
      body: new URLSearchParams({
        code,
        grant_type:    'authorization_code',
        client_id:     clientId,
        redirect_uri:  redirectUri,
        code_verifier: verifier,
      }).toString(),
    });

    const tokenData = await tokenRes.json();

    if (!tokenRes.ok || !tokenData.access_token) {
      console.error('Token exchange failed:', JSON.stringify(tokenData));
      return res.redirect(302, '/?xauth=error&reason=token_exchange');
    }

    accessToken = tokenData.access_token;

  } catch (err) {
    console.error('Token fetch error:', err);
    return res.redirect(302, '/?xauth=error&reason=network');
  }

  // ── Fetch X user profile ─────────────────────────────────
  let xHandle, xName, xAvatar;
  try {
    const userRes = await fetch(
      'https://api.twitter.com/2/users/me?user.fields=name,profile_image_url',
      { headers: { 'Authorization': 'Bearer ' + accessToken } }
    );
    const userData = await userRes.json();
    xHandle = userData.data?.username;
    xName   = userData.data?.name;
    xAvatar = (userData.data?.profile_image_url || '').replace('_normal', '_400x400');
  } catch (err) {
    return res.redirect(302, '/?xauth=error&reason=user_fetch');
  }

  if (!xHandle) {
    return res.redirect(302, '/?xauth=error&reason=no_handle');
  }

  // ── Clear PKCE cookie ────────────────────────────────────
  res.setHeader('Set-Cookie',
    'pkce=; HttpOnly; Secure; Max-Age=0; Path=/'
  );

  // ── Redirect back to site with verified data ─────────────
  const params = new URLSearchParams({
    xauth:  'success',
    handle: xHandle,
    name:   xName   || xHandle,
    avatar: xAvatar || '',
    wallet: stateData.wallet || '',
    space:  stateData.space  || '',
  });

  res.redirect(302, '/?' + params.toString());
};
