// src/middleware/auth.js
const admin = require('../firebaseAdmin');

/**
 * Verifies Firebase ID token in:
 *  - Authorization: Bearer <token>
 *  - OR cookie named __session
 */
async function verifyFirebase(req, res, next) {
  try {
    let idToken = null;

    const hdr = req.headers.authorization || '';
    if (hdr.startsWith('Bearer ')) {
      idToken = hdr.slice('Bearer '.length).trim();
    } else if (req.cookies && req.cookies.__session) {
      idToken = req.cookies.__session;
    }

    if (!idToken) {
      return res.status(401).json({ message: 'Missing Firebase ID token' });
    }

    const decoded = await admin.auth().verifyIdToken(idToken);
    // Attach user info for downstream routes
    req.user = {
      uid: decoded.uid,
      email: decoded.email || '',
      name: decoded.name || decoded.displayName || '',
      picture: decoded.picture || '',
    };
    next();
  } catch (e) {
    return res.status(401).json({ message: 'Invalid/expired Firebase token' });
  }
}

module.exports = { verifyFirebase };
