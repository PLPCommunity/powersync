const express = require('express');
const Board = require('../models/Board');

const router = express.Router();

// Create a new board
router.post('/', async (req, res) => {
  try {
    const { name, description } = req.body;
    if (!name || !name.trim()) {
      return res.status(400).json({ message: 'Board name is required' });
    }
    const board = await Board.create({ name: name.trim(), description: description?.trim() || '' });
    return res.status(201).json(board);
  } catch (error) {
    return res.status(500).json({ message: 'Failed to create board', error: error.message });
  }
});

// List boards
router.get('/', async (_req, res) => {
  try {
    const boards = await Board.find({}).sort({ createdAt: -1 });
    return res.json(boards);
  } catch (error) {
    return res.status(500).json({ message: 'Failed to fetch boards', error: error.message });
  }
});

// Get a single board by id
router.get('/:id', async (req, res) => {
  try {
    const board = await Board.findById(req.params.id);
    if (!board) return res.status(404).json({ message: 'Board not found' });
    return res.json(board);
  } catch (error) {
    return res.status(500).json({ message: 'Failed to fetch board', error: error.message });
  }
});

// Update board basic fields (e.g., name)
router.put('/:id', async (req, res) => {
  try {
    const { name, description } = req.body;
    const update = {};
    if (typeof name === 'string') update.name = name.trim() || 'Untitled document';
    if (typeof description === 'string') update.description = description.trim();
    const board = await Board.findByIdAndUpdate(req.params.id, update, { new: true });
    if (!board) return res.status(404).json({ message: 'Board not found' });
    return res.json(board);
  } catch (error) {
    return res.status(500).json({ message: 'Failed to update board', error: error.message });
  }
});

// Overwrite shapes array (autosave)
router.put('/:id/shapes', async (req, res) => {
  try {
    const { shapes } = req.body;
    console.log(`💾 REST autosave shapes: boardId=${req.params.id}, shapeCount=${Array.isArray(shapes) ? shapes.length : 'invalid'}`);
    if (!Array.isArray(shapes)) return res.status(400).json({ message: 'shapes must be an array' });
    const board = await Board.findByIdAndUpdate(
      req.params.id,
      { $set: { shapes } },
      { new: true }
    );
    if (!board) {
      console.warn(`❌ Board not found for shapes autosave: ${req.params.id}`);
      return res.status(404).json({ message: 'Board not found' });
    }
    console.log(`✅ REST autosave complete: ${shapes.length} shapes saved`);
    return res.json({ ok: true });
  } catch (error) {
    console.error(`❌ REST autosave failed:`, error.message);
    return res.status(500).json({ message: 'Failed to save shapes', error: error.message });
  }
});

router.delete('/:id', async (req, res) => {
  try {
    const { id } = req.params;

    if (!mongoose.isValidObjectId(id)) {
      return res.status(400).json({ message: 'Invalid board id' });
    }

    const deleted = await Board.findByIdAndDelete(id);
    if (!deleted) {
      return res.status(404).json({ message: 'Board not found' });
    }

    return res.status(200).json({ ok: true, deletedId: id });
  } catch (err) {
    console.error('DELETE /api/boards/:id failed:', err);   // ✅ visible in server logs
    return res.status(500).json({ message: 'Failed to delete board', error: err.message });
  }
});

module.exports = router;


