module.exports = async function handler(req, res) {
  const { code, state, error } = req.query;

  if (error || !code) {
    return res.redirect(302, '/?xauth=error&reason=' + encodeURIComponent(error || 'no_code'));
  }

  let stateData = {};
  try { stateData = JSON.parse(decodeURIComponent(state || '{}')); } catch (_) {}

  const cookies = {};
  (req.headers.cookie || '').split(';').forEach(pair => {
    const [k, ...v] = pair.trim().split('=');
    if (k) cookies[k] = v.join('=');
  });

  const clientId     = process.env.X_CLIENT_ID;
  const clientSecret = process.env.X_CLIENT_SECRET;
  const redirectUri  = process.env.X_REDIRECT_URI || 'https://pixelwalls.xyz/api/xcallback';

  if (!clientId || !clientSecret) {
    return res.redirect(302, '/?xauth=error&reason=missing_env_vars');
  }

  // Exchange code for token
  let accessToken;
  try {
    const tokenRes = await fetch('https://api.twitter.com/2/oauth2/token', {
      method: 'POST',
      headers: {
        'Content-Type':  'application/x-www-form-urlencoded',
        'Authorization': 'Basic ' + Buffer.from(clientId + ':' + clientSecret).toString('base64'),
      },
      body: new URLSearchParams({
        code,
        grant_type:    'authorization_code',
        client_id:     clientId,
        redirect_uri:  redirectUri,
        code_verifier: cookies['pkce'] || '',
      }).toString(),
    });
    const data = await tokenRes.json();
    if (!data.access_token) {
      console.error('Token error:', JSON.stringify(data));
      return res.redirect(302, '/?xauth=error&reason=token_failed');
    }
    accessToken = data.access_token;
  } catch (e) {
    return res.redirect(302, '/?xauth=error&reason=network');
  }

  // Get user info
  let handle, name, avatar;
  try {
    const u = await fetch('https://api.twitter.com/2/users/me?user.fields=name,profile_image_url', {
      headers: { 'Authorization': 'Bearer ' + accessToken }
    });
    const ud = await u.json();
    handle = ud.data?.username;
    name   = ud.data?.name;
    avatar = (ud.data?.profile_image_url || '').replace('_normal', '_400x400');
  } catch (e) {
    return res.redirect(302, '/?xauth=error&reason=user_fetch');
  }

  if (!handle) return res.redirect(302, '/?xauth=error&reason=no_handle');

  res.setHeader('Set-Cookie', 'pkce=; HttpOnly; Secure; Max-Age=0; Path=/');

  const out = new URLSearchParams({
    xauth: 'success', handle, name: name || handle,
    avatar: avatar || '', wallet: stateData.wallet || '', space: stateData.space || '',
  });
  return res.redirect(302, '/?' + out.toString());
};
