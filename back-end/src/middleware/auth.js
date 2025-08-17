// middleware/auth.js
const admin = require('../firebaseAdmin'); // initializes admin with your service account
const COOKIE_NAME = process.env.SESSION_COOKIE_NAME || 'fbSession';

async function verifySession(req, res, next) {
  try {
    const sessionCookie = req.cookies?.[COOKIE_NAME];
    if (!sessionCookie) return res.status(401).json({ message: 'No session' });

    // `true` = check revocation
    const decoded = await admin.auth().verifySessionCookie(sessionCookie, true);

    req.user = {
      uid: decoded.uid,
      email: decoded.email || '',
      name: decoded.name || decoded.email || '',
      picture: decoded.picture || ''
    };

    return next();
  } catch (e) {
    console.error('verifySession failed:', e.message);
    return res.status(401).json({ message: 'Invalid/expired session' });
  }
}

module.exports = { verifySession };
