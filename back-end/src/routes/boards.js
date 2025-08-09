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

module.exports = router;


