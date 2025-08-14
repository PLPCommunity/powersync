// routes/users.js
const express = require('express');
const { verifyFirebase } = require('../middleware/auth');
const User = require('../models/User');

const router = express.Router();

// Upsert the user document based on Firebase token

router.post('/sync', verifyFirebase, async (req, res) => {
  try {
    const { uid, name, email, picture, provider } = req.user;
    const user = await User.findOneAndUpdate(
      { uid },
      { uid, name, email, photoURL: picture, provider },
      { new: true, upsert: true, setDefaultsOnInsert: true }
    );
    res.json(user);
  } catch (e) {
    res.status(500).json({ message: 'Failed to sync user', error: e.message });
  }
});

module.exports = router;
