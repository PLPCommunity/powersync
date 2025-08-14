const express = require('express');
const Board = require('../models/Board');
const { verifyFirebase } = require('../middleware/auth');

const router = express.Router();

// everything below requires a valid Firebase ID token
router.use(verifyFirebase);

// Create a new board (attach owner)
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

// List only my boards
router.get('/', async (req, res) => {
  try {
    const boards = await Board.find({ ownerId: req.user.uid }).sort({ updatedAt: -1 });
    return res.json(boards);
  } catch (e) {
    return res.status(500).json({ message: 'Failed to fetch boards', error: e.message });
  }
});

// Get a single board I own
router.get('/:id', async (req, res) => {
  try {
    const board = await Board.findOne({ _id: req.params.id, ownerId: req.user.uid });
    if (!board) return res.status(404).json({ message: 'Board not found' });
    return res.json(board);
  } catch (e) {
    return res.status(500).json({ message: 'Failed to fetch board', error: e.message });
  }
});

// Update (name/description) only if I own it
router.put('/:id', async (req, res) => {
  try {
    const { name, description } = req.body;
    const update = {};
    if (typeof name === 'string') update.name = name.trim() || 'Untitled document';
    if (typeof description === 'string') update.description = description.trim();

    const board = await Board.findOneAndUpdate(
      { _id: req.params.id, ownerId: req.user.uid },
      update,
      { new: true }
    );
    if (!board) return res.status(404).json({ message: 'Board not found' });
    return res.json(board);
  } catch (e) {
    return res.status(500).json({ message: 'Failed to update board', error: e.message });
  }
});

// Overwrite shapes (autosave) if I own it
router.put('/:id/shapes', async (req, res) => {
  try {
    const { shapes } = req.body;
    if (!Array.isArray(shapes)) return res.status(400).json({ message: 'shapes must be an array' });

    const board = await Board.findOneAndUpdate(
      { _id: req.params.id, ownerId: req.user.uid },
      { $set: { shapes } },
      { new: true }
    );
    if (!board) return res.status(404).json({ message: 'Board not found' });
    return res.json({ ok: true });
  } catch (e) {
    return res.status(500).json({ message: 'Failed to save shapes', error: e.message });
  }
});

// Delete board I own
router.delete('/:id', async (req, res) => {
  try {
    const result = await Board.deleteOne({ _id: req.params.id, ownerId: req.user.uid });
    if (result.deletedCount === 0) return res.status(404).json({ message: 'Board not found' });
    return res.json({ ok: true });
  } catch (e) {
    return res.status(500).json({ message: 'Failed to delete board', error: e.message });
  }
});

module.exports = router;
