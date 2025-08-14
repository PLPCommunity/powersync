// src/firebaseAdmin.js
const admin = require('firebase-admin');

function parseJsonEnv(raw) {
  if (!raw) return null;
  // Strip accidental wrapping quotes
  if ((raw.startsWith('"') && raw.endsWith('"')) || (raw.startsWith("'") && raw.endsWith("'"))) {
    raw = raw.slice(1, -1);
  }
  // Must be valid JSON with double quotes
  return JSON.parse(raw);
}

function fromEnv() {
  try {
    if (process.env.FIREBASE_SERVICE_ACCOUNT) {
      return parseJsonEnv(process.env.FIREBASE_SERVICE_ACCOUNT);
    }
    if (process.env.FIREBASE_SERVICE_ACCOUNT_BASE64) {
      const json = Buffer.from(process.env.FIREBASE_SERVICE_ACCOUNT_BASE64, 'base64').toString('utf8');
      return JSON.parse(json);
    }
  } catch (e) {
    console.error('❌ Failed to parse service account JSON from env:', e.message);
  }
  return null;
}

if (!admin.apps.length) {
  const svc = fromEnv();
  if (svc) {
    admin.initializeApp({ credential: admin.credential.cert(svc) });
    console.log('✅ Firebase Admin initialized (env JSON)');
  } else {
    // Will read GOOGLE_APPLICATION_CREDENTIALS if set, or ADC on GCP
    admin.initializeApp({ credential: admin.credential.applicationDefault() });
    console.log('✅ Firebase Admin initialized (Application Default Credentials)');
  }
}

module.exports = admin;
