const express = require('express');
const Board = require('../models/Board');
const { sendInviteEmail } = require('../utils/mailer');
const { verifyFirebase } = require('../middleware/auth');

const router = express.Router();

// every route below requires auth
router.use(verifyFirebase);

// Create
router.post('/', async (req, res) => {
  try {
    const { name, description } = req.body;
    if (!name || !name.trim()) return res.status(400).json({ message: 'Board name is required' });
    const board = await Board.create({
      name: name.trim(),
      description: description?.trim() || '',
      ownerId: req.user.uid,
      ownerName: req.user.name,
      ownerEmail: req.user.email,
      shapes: [],
    });
    return res.status(201).json(board);
  } catch (e) {
    return res.status(500).json({ message: 'Failed to create board', error: e.message });
  }
});

// List (mine or I'm a collaborator) - optimized with projection
router.get('/', async (req, res) => {
  try {
    const boards = await Board.find({
      $or: [
        { ownerId: req.user.uid },
        { 'collaborators.uid': req.user.uid },
        { 'collaborators.email': req.user.email?.toLowerCase() },
      ],
    })
    .select('name description ownerId collaborators publicAccess updatedAt createdAt')
    .sort({ updatedAt: -1 })
    .lean();
    return res.json(boards);
  } catch (e) {
    return res.status(500).json({ message: 'Failed to fetch boards', error: e.message });
  }
});

// Get one (owner or collaborator) - optimized with projection
router.get('/:id', async (req, res) => {
  try {
    const board = await Board.findOne({
      _id: req.params.id,
      $or: [
        { ownerId: req.user.uid },
        { 'collaborators.uid': req.user.uid },
        { 'collaborators.email': req.user.email?.toLowerCase() },
      ],
    })
    .select('name description ownerId ownerName ownerEmail collaborators publicAccess shapes updatedAt createdAt')
    .lean();
    if (!board) return res.status(404).json({ message: 'Board not found' });
    return res.json(board);
  } catch (e) {
    return res.status(500).json({ message: 'Failed to fetch board', error: e.message });
  }
});

// Get one by public link (no auth required)
router.get('/public/:linkId', async (req, res) => {
  try {
    const board = await Board.findOne({
      'publicAccess.enabled': true,
      'publicAccess.linkId': req.params.linkId,
    })
    .select('name description publicAccess shapes updatedAt createdAt')
    .lean();
    if (!board) return res.status(404).json({ message: 'Public board not found' });
    return res.json(board);
  } catch (e) {
    return res.status(500).json({ message: 'Failed to fetch public board', error: e.message });
  }
});

// Update name/description (owner or editor)
router.put('/:id', async (req, res) => {
  try {
    const { name, description } = req.body;
    const update = {};
    if (typeof name === 'string') update.name = name.trim() || 'Untitled document';
    if (typeof description === 'string') update.description = description.trim();

    const board = await Board.findOne({
      _id: req.params.id,
      $or: [
        { ownerId: req.user.uid },
        { 'collaborators.uid': req.user.uid, 'collaborators.role': 'editor' },
        { 'collaborators.email': req.user.email?.toLowerCase(), 'collaborators.role': 'editor' },
      ],
    });
    if (!board) return res.status(404).json({ message: 'Board not found' });
    const updated = await Board.findByIdAndUpdate(board._id, update, { new: true });
    return res.json(updated);
  } catch (e) {
    return res.status(500).json({ message: 'Failed to update board', error: e.message });
  }
});

// Save shapes (owner or editor) - optimized for real-time
router.put('/:id/shapes', async (req, res) => {
  try {
    const { shapes } = req.body;
    if (!Array.isArray(shapes)) return res.status(400).json({ message: 'shapes must be an array' });

    const board = await Board.findOne({
      _id: req.params.id,
      $or: [
        { ownerId: req.user.uid },
        { 'collaborators.uid': req.user.uid, 'collaborators.role': 'editor' },
        { 'collaborators.email': req.user.email?.toLowerCase(), 'collaborators.role': 'editor' },
      ],
    });
    if (!board) return res.status(404).json({ message: 'Board not found' });

    // Merge audit fields per shape id - optimized for real-time
    const prevById = new Map();
    for (const s of board.shapes || []) prevById.set(s.id, s);
    const nowIso = new Date().toISOString();
    const uid = req.user.uid;
    const merged = shapes.map((s) => {
      const prev = prevById.get(s.id) || {};
      return {
        ...s,
        _createdBy: prev._createdBy || uid,
        _createdAt: prev._createdAt || nowIso,
        _updatedBy: uid,
        _updatedAt: nowIso,
      };
    });

    await Board.updateOne({ _id: board._id }, { $set: { shapes: merged } });
    return res.json({ ok: true });
  } catch (e) {
    return res.status(500).json({ message: 'Failed to save shapes', error: e.message });
  }
});

// Delete (only mine)
router.delete('/:id', async (req, res) => {
  try {
    const result = await Board.deleteOne({ _id: req.params.id, ownerId: req.user.uid });
    if (result.deletedCount === 0) return res.status(404).json({ message: 'Board not found' });
    return res.json({ ok: true });
  } catch (e) {
    return res.status(500).json({ message: 'Failed to delete board', error: e.message });
  }
});

// Invite collaborator (owner only)
router.post('/:id/invite', async (req, res) => {
  try {
    const { email, role } = req.body || {};
    if (!email || !/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email)) {
      return res.status(400).json({ message: 'Valid email is required' });
    }
    if (!['editor', 'viewer'].includes(role)) {
      return res.status(400).json({ message: 'Invalid role' });
    }

    const board = await Board.findOne({ _id: req.params.id, ownerId: req.user.uid });
    if (!board) return res.status(404).json({ message: 'Board not found' });

    const normalizedEmail = String(email).toLowerCase().trim();
    const exists = board.collaborators?.some((c) => c.email === normalizedEmail);
    if (exists) return res.status(409).json({ message: 'Collaborator already invited' });

    const doc = {
      email: normalizedEmail,
      uid: '',
      role,
      invitedByUid: req.user.uid,
      invitedByEmail: req.user.email || '',
      invitedAt: new Date(),
      status: 'invited',
    };
    await Board.updateOne({ _id: board._id }, { $push: { collaborators: doc } });

    const origin = process.env.CLIENT_ORIGIN || 'http://localhost:3000';
    const inviteLink = `${origin}/board/${board._id}`;
    try {
      await sendInviteEmail({
        to: normalizedEmail,
        boardName: board.name,
        inviterEmail: req.user.email || '',
        inviteLink,
        role,
      });
    } catch (e) {
      // Continue even if email sending fails
      console.warn('sendInviteEmail failed:', e.message);
    }

    return res.json({ ok: true });
  } catch (e) {
    return res.status(500).json({ message: 'Failed to invite collaborator', error: e.message });
  }
});

// Accept invite (by invited user)
router.post('/:id/accept', async (req, res) => {
  try {
    const board = await Board.findOne({ _id: req.params.id, 'collaborators.email': req.user.email?.toLowerCase() });
    if (!board) return res.status(404).json({ message: 'Invite not found' });
    await Board.updateOne(
      { _id: board._id, 'collaborators.email': req.user.email?.toLowerCase() },
      {
        $set: {
          'collaborators.$.uid': req.user.uid,
          'collaborators.$.status': 'accepted',
          'collaborators.$.acceptedAt': new Date(),
        },
      }
    );
    return res.json({ ok: true });
  } catch (e) {
    return res.status(500).json({ message: 'Failed to accept invite', error: e.message });
  }
});

// Update collaborator role (owner only)
router.put('/:id/collaborators/:email/role', async (req, res) => {
  try {
    const { role } = req.body || {};
    if (!['editor', 'viewer'].includes(role)) {
      return res.status(400).json({ message: 'Invalid role' });
    }

    const board = await Board.findOne({ _id: req.params.id, ownerId: req.user.uid });
    if (!board) return res.status(404).json({ message: 'Board not found' });

    const result = await Board.updateOne(
      { _id: board._id, 'collaborators.email': req.params.email },
      { $set: { 'collaborators.$.role': role } }
    );

    if (result.matchedCount === 0) {
      return res.status(404).json({ message: 'Collaborator not found' });
    }

    return res.json({ ok: true });
  } catch (e) {
    return res.status(500).json({ message: 'Failed to update collaborator role', error: e.message });
  }
});

// Remove collaborator (owner only)
router.delete('/:id/collaborators/:email', async (req, res) => {
  try {
    const board = await Board.findOne({ _id: req.params.id, ownerId: req.user.uid });
    if (!board) return res.status(404).json({ message: 'Board not found' });

    const result = await Board.updateOne(
      { _id: board._id },
      { $pull: { collaborators: { email: req.params.email } } }
    );

    if (result.matchedCount === 0) {
      return res.status(404).json({ message: 'Board not found' });
    }

    return res.json({ ok: true });
  } catch (e) {
    return res.status(500).json({ message: 'Failed to remove collaborator', error: e.message });
  }
});

// Update public access settings (owner only)
router.put('/:id/public-access', async (req, res) => {
  try {
    const { enabled, role } = req.body || {};
    if (typeof enabled !== 'boolean') {
      return res.status(400).json({ message: 'enabled must be a boolean' });
    }
    if (enabled && !['viewer', 'editor'].includes(role)) {
      return res.status(400).json({ message: 'Invalid role for public access' });
    }

    const board = await Board.findOne({ _id: req.params.id, ownerId: req.user.uid });
    if (!board) return res.status(404).json({ message: 'Board not found' });

    const update = { 'publicAccess.enabled': enabled };
    if (enabled) {
      update['publicAccess.role'] = role || 'viewer';
      // Generate link ID if not exists
      const boardDoc = await Board.findById(req.params.id);
      if (!boardDoc.publicAccess.linkId) {
        update['publicAccess.linkId'] = Math.random().toString(36).substring(2, 15) + Math.random().toString(36).substring(2, 15);
      }
    } else {
      update['publicAccess.role'] = 'viewer';
      update['publicAccess.linkId'] = null;
    }

    await Board.updateOne({ _id: req.params.id }, { $set: update });
    return res.json({ ok: true });
  } catch (e) {
    return res.status(500).json({ message: 'Failed to update public access', error: e.message });
  }
});

// Update collaborator role (owner only)
router.put('/:id/collaborators/:email/role', async (req, res) => {
  try {
    const { role } = req.body || {};
    if (!['editor', 'viewer'].includes(role)) {
      return res.status(400).json({ message: 'Invalid role' });
    }

    const board = await Board.findOne({ _id: req.params.id, ownerId: req.user.uid });
    if (!board) return res.status(404).json({ message: 'Board not found' });

    const result = await Board.updateOne(
      { _id: board._id, 'collaborators.email': req.params.email },
      { $set: { 'collaborators.$.role': role } }
    );

    if (result.matchedCount === 0) {
      return res.status(404).json({ message: 'Collaborator not found' });
    }

    return res.json({ ok: true });
  } catch (e) {
    return res.status(500).json({ message: 'Failed to update collaborator role', error: e.message });
  }
});

// Remove collaborator (owner only)
router.delete('/:id/collaborators/:email', async (req, res) => {
  try {
    const board = await Board.findOne({ _id: req.params.id, ownerId: req.user.uid });
    if (!board) return res.status(404).json({ message: 'Board not found' });

    const result = await Board.updateOne(
      { _id: board._id },
      { $pull: { collaborators: { email: req.params.email } } }
    );

    if (result.matchedCount === 0) {
      return res.status(404).json({ message: 'Board not found' });
    }

    return res.json({ ok: true });
  } catch (e) {
    return res.status(500).json({ message: 'Failed to remove collaborator', error: e.message });
  }
});

// Update public access settings (owner only)
router.put('/:id/public-access', async (req, res) => {
  try {
    const { enabled, role } = req.body || {};
    if (typeof enabled !== 'boolean') {
      return res.status(400).json({ message: 'enabled must be a boolean' });
    }
    if (enabled && !['viewer', 'editor'].includes(role)) {
      return res.status(400).json({ message: 'Invalid role for public access' });
    }

    const board = await Board.findOne({ _id: req.params.id, ownerId: req.user.uid });
    if (!board) return res.status(404).json({ message: 'Board not found' });

    const update = { 'publicAccess.enabled': enabled };
    if (enabled) {
      update['publicAccess.role'] = role || 'viewer';
    } else {
      update['publicAccess.role'] = 'viewer';
      update['publicAccess.linkId'] = null;
    }

    await Board.updateOne({ _id: board._id }, { $set: update });
    return res.json({ ok: true });
  } catch (e) {
    return res.status(500).json({ message: 'Failed to update public access', error: e.message });
  }
});

module.exports = router;
