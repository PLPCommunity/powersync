// src/routes/users.js
const express = require('express');
const { verifyFirebase } = require('../middleware/auth');
const User = require('../models/User');

const router = express.Router();

// Upsert current user record (requires a verified Firebase token)
router.post('/sync', verifyFirebase, async (req, res) => {
  try {
    const { uid, email, name, picture } = req.user;

    const update = {
      uid,
      email,
      name: name || '',
      photoURL: picture || '',
      provider: '', // optional, fill from client if you want
    };

    const user = await User.findOneAndUpdate(
      { uid },
      { $set: update },
      { new: true, upsert: true }
    );

    res.json({ ok: true, user });
    // in routes/users.js, right after the require:
console.log('verifyFirebase type:', typeof verifyFirebase); // should print 'function'

  } catch (e) {
    res.status(500).json({ message: 'Failed to sync user', error: e.message });
  }
});

module.exports = router;
