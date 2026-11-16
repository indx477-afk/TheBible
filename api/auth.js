// POST /api/auth {"action":"login","credential":"<Google ID token>"} | {"action":"logout"} | GET -> current user
const L = require('./_lib');

module.exports = async (req, res) => {
  let input = req.body;
  if (typeof input === 'string') { try { input = JSON.parse(input); } catch { input = {}; } }
  input = input || {};
  const action = input.action || 'me';
  const isPost = req.method === 'POST';

  if (action === 'logout' && isPost) {
    L.clearSession(res);
    return L.jsonOut(res, { user: null });
  }

  if (action === 'login' && isPost) {
    const token = String(input.credential || '');
    if (!token) return L.jsonOut(res, { error: 'Missing Google credential.' }, 400);

    let g;
    try {
      g = await L.fetchJson('https://oauth2.googleapis.com/tokeninfo?id_token=' + encodeURIComponent(token), 0);
    } catch {
      return L.jsonOut(res, { error: 'Google sign-in could not be verified.' }, 401);
    }

    const issuerOk = ['accounts.google.com', 'https://accounts.google.com'].includes(g.iss);
    const emailOk = String(g.email_verified) === 'true';
    if (g.aud !== L.GOOGLE_CLIENT_ID || !issuerOk || !emailOk || Number(g.exp || 0) < Date.now() / 1000) {
      return L.jsonOut(res, { error: 'Google sign-in could not be verified.' }, 401);
    }

    const user = { sub: g.sub, email: g.email, name: g.name || g.email, picture: g.picture || '' };
    L.setSession(res, user);
    return L.jsonOut(res, { user: L.publicUser(user) });
  }

  L.jsonOut(res, { user: L.publicUser(L.currentUser(req)) });
};
