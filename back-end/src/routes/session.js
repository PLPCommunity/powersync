const express = require('express');
const admin = require('../firebaseAdmin');

const router = express.Router();

// Use the same cookie options for set/clear
function cookieOptions() {
  const isProd = process.env.NODE_ENV === 'production';
  return {
    httpOnly: true,
    secure: isProd,       // false on localhost, true in prod (HTTPS)
    sameSite: 'lax',
    path: '/',            // cookie is sent to all API paths
    // maxAge set dynamically on login
  };
}

// Frontend sends { idToken }, backend mints a Firebase Session Cookie
router.post('/sessionLogin', async (req, res) => {
  try {
    const { idToken } = req.body || {};
    if (!idToken) return res.status(400).json({ message: 'idToken is required' });

    // e.g. 5 days in ms
    const expiresIn = 5 * 24 * 60 * 60 * 1000;

    // Optional: verify first to fail fast on expired/revoked tokens
    await admin.auth().verifyIdToken(idToken);

    const sessionCookie = await admin.auth().createSessionCookie(idToken, { expiresIn });
    const opts = cookieOptions();
    opts.maxAge = expiresIn;

    res.cookie('__session', sessionCookie, opts);
    return res.json({ ok: true });
  } catch (e) {
    return res.status(401).json({ message: 'Invalid idToken', error: e.message });
  }
});

router.post('/sessionLogout', async (_req, res) => {
  const opts = cookieOptions();
  // Clear cookie (must match options used to set)
  res.clearCookie('__session', { ...opts, maxAge: 0 });
  return res.json({ ok: true });
});

module.exports = router;
