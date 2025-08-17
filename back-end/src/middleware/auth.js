// src/middleware/auth.js
const admin = require('../firebaseAdmin');

/**
 * Accept either:
 * - Firebase Session Cookie in req.cookies.__session  -> verifySessionCookie
 * - Firebase ID token in Authorization: Bearer <token> -> verifyIdToken
 */
async function verifyFirebase(req, res, next) {
  try {
    const hdr = req.get('Authorization') || '';
    const bearer = hdr.startsWith('Bearer ') ? hdr.slice(7) : null;
    const sessionCookie = req.cookies && req.cookies.__session;

    let decoded = null;
    if (sessionCookie) {
      // Don't set checkRevoked to true unless you really need it
      decoded = await admin.auth().verifySessionCookie(sessionCookie /*, true */);
    } else if (bearer) {
      decoded = await admin.auth().verifyIdToken(bearer /*, true */);
    } else {
      return res.status(401).json({ message: 'Missing auth token' });
    }

    req.user = {
      uid: decoded.uid,
      email: decoded.email || '',
      name: decoded.name || '',
      picture: decoded.picture || '',
      claims: decoded,
    };
    next();
  } catch (e) {
    return res.status(401).json({ message: 'Invalid/expired Firebase token', error: e.message });
  }
}

module.exports = { verifyFirebase };
