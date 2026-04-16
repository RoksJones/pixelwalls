// api/xcallback.js  — Pixelwalls X OAuth 2.0 callback (PKCE S256)
// Reads PKCE verifier from cookie first, falls back to state payload
// so it works even when cookies are dropped on cross-origin redirect.
module.exports = async function handler(req, res) {
  const { code, state, error, error_description } = req.query;

  if (error || !code) {
    const reason = encodeURIComponent(error_description || error || 'no_code');
    return res.redirect(302, `/?xauth=error&reason=${reason}`);
  }

  // Parse state — contains wallet/space/ref AND embedded _v PKCE verifier
  let stateData = {};
  try {
    stateData = JSON.parse(decodeURIComponent(state || '{}'));
  } catch (_) {}

  // Read PKCE verifier: cookie first, state fallback
  const cookies = {};
  (req.headers.cookie || '').split(';').forEach(pair => {
    const [k, ...v] = pair.trim().split('=');
    if (k) cookies[k.trim()] = v.join('=').trim();
  });
  const codeVerifier = cookies['pkce_v'] || stateData._v || '';

  if (!codeVerifier) {
    console.error('No PKCE verifier in cookie or state');
    return res.redirect(302, '/?xauth=error&reason=pkce_missing');
  }

  const clientId     = process.env.X_CLIENT_ID;
  const clientSecret = process.env.X_CLIENT_SECRET;
  const redirectUri  = process.env.X_REDIRECT_URI || 'https://pixelwalls.xyz/api/xcallback';

  if (!clientId || !clientSecret) {
    console.error('Missing X_CLIENT_ID or X_CLIENT_SECRET env vars');
    return res.redirect(302, '/?xauth=error&reason=missing_env_vars');
  }

  // Exchange auth code for access token
  let accessToken;
  try {
    const tokenRes = await fetch('https://api.twitter.com/2/oauth2/token', {
      method: 'POST',
      headers: {
        'Content-Type':  'application/x-www-form-urlencoded',
        'Authorization': 'Basic ' + Buffer.from(`${clientId}:${clientSecret}`).toString('base64'),
      },
      body: new URLSearchParams({
        grant_type:    'authorization_code',
        code,
        redirect_uri:  redirectUri,
        client_id:     clientId,
        code_verifier: codeVerifier,
      }).toString(),
    });

    const data = await tokenRes.json();
    if (!data.access_token) {
      console.error('Token exchange failed:', JSON.stringify(data));
      const reason = encodeURIComponent(data.error_description || data.error || 'token_failed');
      return res.redirect(302, `/?xauth=error&reason=${reason}`);
    }
    accessToken = data.access_token;
  } catch (e) {
    console.error('Token fetch error:', e.message);
    return res.redirect(302, '/?xauth=error&reason=network');
  }

  // Fetch user profile
  let handle, name, avatar;
  try {
    const userRes = await fetch(
      'https://api.twitter.com/2/users/me?user.fields=name,profile_image_url',
      { headers: { 'Authorization': `Bearer ${accessToken}` } }
    );
    const ud = await userRes.json();
    if (!ud.data) {
      console.error('User fetch failed:', JSON.stringify(ud));
      return res.redirect(302, '/?xauth=error&reason=user_fetch');
    }
    handle = ud.data.username;
    name   = ud.data.name || ud.data.username;
    avatar = (ud.data.profile_image_url || '').replace('_normal', '_400x400');
  } catch (e) {
    console.error('User fetch error:', e.message);
    return res.redirect(302, '/?xauth=error&reason=user_network');
  }

  if (!handle) {
    return res.redirect(302, '/?xauth=error&reason=no_handle');
  }

  // Clear PKCE cookie
  res.setHeader('Set-Cookie', 'pkce_v=; HttpOnly; Secure; Max-Age=0; Path=/');

  // Redirect back with verified data — strip internal _v from state
  const out = new URLSearchParams({
    xauth:  'success',
    handle,
    name,
    avatar: avatar || '',
    wallet: stateData.wallet || '',
    space:  stateData.space  || '',
  });

  const returnBase = stateData.returnUrl || '/';
  const separator  = returnBase.includes('?') ? '&' : '?';
  return res.redirect(302, returnBase + separator + out.toString());
};
