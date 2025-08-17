// src/firebaseAdmin.js
const admin = require('firebase-admin');

function parseJsonEnv(raw) {
  if (!raw) return null;
  // Strip accidental wrapping quotes from .env tooling
  if ((raw.startsWith('"') && raw.endsWith('"')) || (raw.startsWith("'") && raw.endsWith("'"))) {
    raw = raw.slice(1, -1);
  }
  return JSON.parse(raw);
}

function loadServiceAccount() {
  try {
    // 1) Direct JSON in env
    if (process.env.FIREBASE_SERVICE_ACCOUNT) {
      return parseJsonEnv(process.env.FIREBASE_SERVICE_ACCOUNT);
    }
    // 2) Base64-encoded JSON in env
    if (process.env.FIREBASE_SERVICE_ACCOUNT_BASE64) {
      const json = Buffer.from(process.env.FIREBASE_SERVICE_ACCOUNT_BASE64, 'base64').toString('utf8');
      return JSON.parse(json);
    }
  } catch (e) {
    console.error('❌ Failed to parse service account JSON from env:', e.message);
  }
  // 3) Fallback to ADC (GOOGLE_APPLICATION_CREDENTIALS / GCP metadata)
  return null;
}

function normalizeServiceAccount(svc) {
  if (!svc) return svc;
  // Some CI systems double-escape newlines in the private key. Fix that:
  if (svc.private_key && svc.private_key.includes('\\n')) {
    svc.private_key = svc.private_key.replace(/\\n/g, '\n');
  }
  // Optional overrides (helps when svc lacks them or you want to force-project)
  if (!svc.project_id && process.env.FIREBASE_PROJECT_ID) {
    svc.project_id = process.env.FIREBASE_PROJECT_ID;
  }
  if (!svc.client_email && process.env.FIREBASE_CLIENT_EMAIL) {
    svc.client_email = process.env.FIREBASE_CLIENT_EMAIL;
  }
  return svc;
}

if (!admin.apps.length) {
  const raw = loadServiceAccount();
  if (raw) {
    const svc = normalizeServiceAccount(raw);
    const opts = { credential: admin.credential.cert(svc) };
    // You can optionally pass projectId explicitly:
    if (process.env.FIREBASE_PROJECT_ID) opts.projectId = process.env.FIREBASE_PROJECT_ID;
    admin.initializeApp(opts);
    console.log('✅ Firebase Admin initialized (env service account)');
  } else {
    // Will read GOOGLE_APPLICATION_CREDENTIALS if set, or use GCP metadata on Cloud
    admin.initializeApp({ credential: admin.credential.applicationDefault() });
    console.log('✅ Firebase Admin initialized (Application Default Credentials)');
  }
}

module.exports = admin;
