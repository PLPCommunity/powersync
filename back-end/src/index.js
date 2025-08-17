// src/index.js
const path = require('path');
require('dotenv').config({ path: path.join(__dirname, '.env') });

const express = require('express');
const http = require('http');
const mongoose = require('mongoose');
const cors = require('cors');
const cookieParser = require('cookie-parser');
const { Server } = require('socket.io');

const Board = require('./models/Board');          // used by socket handlers
const boardsRouter = require('./routes/boards');  // requires verifyFirebase internally
const usersRouter  = require('./routes/users');   // requires verifyFirebase on /sync

/* ------------------------------ App & Server ------------------------------ */
const app = express();
const srv = http.createServer(app);

/* ---------------------------------- CORS ---------------------------------- */
// Allow cookies (for session-based Firebase ID token) from your frontend
const FRONTEND_ORIGIN =
  process.env.FRONTEND_ORIGIN ||
  'http://localhost:5173'; // Vite default; change if your frontend runs elsewhere

app.use(cors({
  origin: FRONTEND_ORIGIN,
  credentials: true,                 // <— lets browser send/receive cookies
  methods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Authorization'],
}));

/* ----------------------------- Core Middleware ---------------------------- */
app.use(cookieParser());             // read __session cookie if you use it
app.use(express.json({ limit: '2mb' }));

/* ------------------------------ Mongo Connect ----------------------------- */
const mongoUri = process.env.MONGO_URI;
if (!mongoUri) {
  console.error('❌ Missing MONGO_URI in environment');
  process.exit(1);
}

mongoose.connect(mongoUri)
  .then(() => console.log('✅ MongoDB connected'))
  .catch((err) => {
    console.error('❌ MongoDB connection error:', err.message);
    process.exit(1);
  });

/* --------------------------------- Routes --------------------------------- */
app.get('/api/health', (_req, res) => res.json({ ok: true }));
app.get('/api/ping',   (_req, res) => res.json({ msg: 'pong' }));

app.use('/api/users',  usersRouter);
app.use('/api/boards', boardsRouter);

// 404 for unknown API routes
app.use('/api', (_req, res) => res.status(404).json({ message: 'Not Found' }));

/* ------------------------------- Socket.IO -------------------------------- */
const io = new Server(srv, {
  cors: {
    origin: FRONTEND_ORIGIN,
    methods: ['GET', 'POST'],
    credentials: true,
  },
});

io.on('connection', (socket) => {
  console.log(`🟢 User connected: ${socket.id}`);

  socket.on('join-board', ({ boardId, userId, userName }) => {
    if (!boardId) return;
    socket.join(boardId);
    socket.to(boardId).emit('user-joined', { userId, userName });
  });

  socket.on('draw', (data) => {
    if (!data?.boardId) return;
    io.to(data.boardId).emit('draw', data);
  });

  // ---------- Collaborative shape events ----------
  socket.on('shape-create', async (data) => {
    // data: { boardId, shape }
    try {
      if (!data?.boardId || !data?.shape) return;
      console.log('📝 shape-create:', { boardId: data.boardId, id: data.shape?.id, type: data.shape?.type });

      await Board.updateOne(
        { _id: data.boardId },
        { $push: { shapes: data.shape } }
      );

      io.to(data.boardId).emit('shape-created', { shape: data.shape });
    } catch (e) {
      console.error('❌ shape-create persist failed:', e.message);
    }
  });

  socket.on('shape-update', async (data) => {
    // data: { boardId, shapeId, props }
    try {
      if (!data?.boardId || !data?.shapeId) return;
      const props = data.props || {};
      const set = {};
      Object.keys(props).forEach((k) => { set[`shapes.$[elem].${k}`] = props[k]; });

      if (Object.keys(set).length) {
        await Board.updateOne(
          { _id: data.boardId },
          { $set: set },
          { arrayFilters: [{ 'elem.id': data.shapeId }] }
        );
      }

      io.to(data.boardId).emit('shape-updated', { shapeId: data.shapeId, props: props });
    } catch (e) {
      console.error('❌ shape-update persist failed:', e.message);
    }
  });

  socket.on('shape-delete', async (data) => {
    // data: { boardId, shapeId }
    try {
      if (!data?.boardId || !data?.shapeId) return;
      await Board.updateOne(
        { _id: data.boardId },
        { $pull: { shapes: { id: data.shapeId } } }
      );
      io.to(data.boardId).emit('shape-deleted', { shapeId: data.shapeId });
    } catch (e) {
      console.error('❌ shape-delete persist failed:', e.message);
    }
  });

  socket.on('board-rename', async (data) => {
    // data: { boardId, name }
    try {
      if (!data?.boardId || typeof data.name !== 'string') return;
      const name = data.name.trim() || 'Untitled document';

      await Board.updateOne(
        { _id: data.boardId },
        { $set: { name } }
      );

      io.to(data.boardId).emit('board-renamed', { name });
    } catch (e) {
      console.error('❌ board-rename persist failed:', e.message);
    }
  });

  socket.on('disconnect', () => {
    console.log(`🔴 User disconnected: ${socket.id}`);
  });
});

/* ------------------------------- Start Server ----------------------------- */
const PORT = Number(process.env.PORT || 5000);
srv.listen(PORT, () => {
  console.log(`🚀 Server listening on http://localhost:${PORT}`);
  console.log(`🔗 CORS origin: ${FRONTEND_ORIGIN}`);
});

/* ----------------------------- Process Safety ----------------------------- */
process.on('unhandledRejection', (reason) => {
  console.error('UNHANDLED REJECTION:', reason);
});
process.on('uncaughtException', (err) => {
  console.error('UNCAUGHT EXCEPTION:', err);
});
