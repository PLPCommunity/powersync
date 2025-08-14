// firebaseAdmin.js
const admin = require('firebase-admin');

function fromEnv() {
  if (process.env.FIREBASE_SERVICE_ACCOUNT) {
    return JSON.parse(process.env.FIREBASE_SERVICE_ACCOUNT);
  }
  if (process.env.FIREBASE_SERVICE_ACCOUNT_BASE64) {
    return JSON.parse(Buffer.from(process.env.FIREBASE_SERVICE_ACCOUNT_BASE64, 'base64').toString('utf8'));
  }
  return null;
}

if (!admin.apps.length) {
  const svc = fromEnv();
  if (svc) {
    admin.initializeApp({ credential: admin.credential.cert(svc) });
    console.log('✅ Firebase Admin: using FIREBASE_SERVICE_ACCOUNT');
  } else {
    // Works if GOOGLE_APPLICATION_CREDENTIALS is set to a JSON path
    admin.initializeApp({ credential: admin.credential.applicationDefault() });
    console.log('✅ Firebase Admin: using Application Default Credentials');
  }
}

module.exports = admin;
