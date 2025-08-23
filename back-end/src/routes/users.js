const express = require('express');
const { verifyFirebase } = require('../middleware/auth');
const User = require('../models/User');
const { sendWelcomeEmail } = require('../utils/mailer');

const router = express.Router();

// Upsert the signed-in user
router.post('/sync', verifyFirebase, async (req, res) => {
  try {
    const { uid, email, name, picture } = req.user;
    const provider = req.user?.firebase?.sign_in_provider || '';
    
    console.log(`[User Sync] Syncing user: ${uid}, email: ${email}, name: ${name}`);

    // Check if user already exists
    const existingUser = await User.findOne({ uid });
    const isNewUser = !existingUser;
    
    console.log(`[User Sync] User exists: ${!isNewUser}, isNewUser: ${isNewUser}`);

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

    // Send welcome email for new users
    if (isNewUser && email) {
      console.log(`[User Sync] Sending welcome email to: ${email}`);
      try {
        const emailResult = await sendWelcomeEmail({
          to: email,
          userName: name || 'there',
          userEmail: email
        });
        console.log(`[User Sync] Welcome email result:`, emailResult);
      } catch (e) {
        console.error('[User Sync] sendWelcomeEmail failed:', e.message);
        console.error('[User Sync] Full error:', e);
      }
    } else if (isNewUser && !email) {
      console.warn(`[User Sync] New user but no email provided: ${uid}`);
    } else {
      console.log(`[User Sync] Existing user, no welcome email needed: ${email}`);
    }

    return res.json({ ok: true, user: doc, isNewUser });
  } catch (e) {
    console.error('[User Sync] Error syncing user:', e);
    return res.status(500).json({ message: 'Failed to sync user', error: e.message });
  }
});

module.exports = router;
