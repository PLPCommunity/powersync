const express = require('express');
const { verifyFirebase } = require('../middleware/auth');
const User = require('../models/User');

const router = express.Router();

// Upsert the signed-in user
router.post('/sync', verifyFirebase, async (req, res) => {
  try {
    const { uid, email, name, picture } = req.user;
    const provider = req.user?.firebase?.sign_in_provider || '';

    const doc = await User.findOneAndUpdate(
      { uid },
      {
        $set: {
          email: email || '',
          name: name || '',
          photoURL: picture || '',
          provider,
        },
      },
      { upsert: true, new: true, setDefaultsOnInsert: true }
    );

    return res.json({ ok: true, user: doc });
  } catch (e) {
    return res.status(500).json({ message: 'Failed to sync user', error: e.message });
  }
});

module.exports = router;
