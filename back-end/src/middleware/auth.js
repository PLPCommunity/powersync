// middleware/auth.js
const admin = require('../firebaseAdmin');

async function verifyFirebase(req, res, next) {
  try {
    const hdr = req.headers.authorization || '';
    const token = hdr.startsWith('Bearer ') ? hdr.slice(7) : null;
    if (!token) return res.status(401).json({ message: 'Missing Authorization Bearer token' });

    const decoded = await admin.auth().verifyIdToken(token);
    req.user = {
      uid: decoded.uid,
      name: decoded.name || '',
      email: decoded.email || '',
      picture: decoded.picture || '',
      provider: decoded.firebase?.sign_in_provider || '',
    };
    next();
  } catch (e) {
    return res.status(401).json({ message: 'Invalid/expired Firebase token', error: e.message });
  }
}

module.exports = { verifyFirebase };
