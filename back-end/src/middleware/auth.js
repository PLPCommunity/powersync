// middleware/auth.js
const admin = require('firebase-admin');

if (!admin.apps.length) {
  // Use GOOGLE_APPLICATION_CREDENTIALS or a JSON string in FIREBASE_SERVICE_ACCOUNT
  if (process.env.FIREBASE_SERVICE_ACCOUNT) {
    admin.initializeApp({
      credential: admin.credential.cert(JSON.parse(process.env.FIREBASE_SERVICE_ACCOUNT)),
    });
  } else {
    admin.initializeApp(); // Application Default Credentials
  }
}

async function verifyFirebase(req, res, next) {
  try {
    const hdr = req.headers.authorization || '';
    const token = hdr.startsWith('Bearer ') ? hdr.slice(7) : null;
    if (!token) return res.status(401).json({ message: 'Missing Authorization Bearer token' });

    const decoded = await admin.auth().verifyIdToken(token);
    // attach minimal user info for downstream routes
    req.user = {
      uid: decoded.uid,
      name: decoded.name || '',
      email: decoded.email || '',
      picture: decoded.picture || '',
      provider: (decoded.firebase && decoded.firebase.sign_in_provider) || '',
    };
    next();
  } catch (e) {
    return res.status(401).json({ message: 'Invalid/expired Firebase token', error: e.message });
  }
}

module.exports = { verifyFirebase };
