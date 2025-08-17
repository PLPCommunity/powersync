// src/index.js
const path = require('path');
require('dotenv').config({ path: path.join(__dirname, '.env') });

const express = require('express');
const http = require('http');
const mongoose = require('mongoose');
const cors = require('cors');
const cookieParser = require('cookie-parser');
const { Server } = require('socket.io');

const Board = require('./models/Board');
const admin = require('./firebaseAdmin'); // your existing admin init
const boardsRouter = require('./routes/boards');
const usersRouter = require('./routes/users');

const app = express();
const srv = http.createServer(app);

const CLIENT_ORIGIN = process.env.CLIENT_ORIGIN || 'http://localhost:3000';
const PORT = process.env.PORT || 5000;
const SESSION_COOKIE_NAME = '__session';

const io = new Server(srv, {
  cors: { origin: CLIENT_ORIGIN, credentials: true },
});

// --- Middleware ---
app.use(cors({ origin: CLIENT_ORIGIN, credentials: true }));
app.use(express.json());
app.use(cookieParser());

// --- Mongo ---
mongoose
  .connect(process.env.MONGO_URI, { dbName: process.env.MONGO_DB || undefined })
  .then(() => console.log('✅ MongoDB connected'))
  .catch((err) => {
    console.error('❌ MongoDB error:', err.message);
    process.exit(1);
  });

// --- Health ---
app.get('/api/ping', (req, res) => res.json({ msg: 'pong' }));

// --- Session cookie routes (Firebase Session Cookies) ---
function baseCookieOptions() {
  const isProd = process.env.NODE_ENV === 'production';
  return {
    httpOnly: true,
    secure: isProd,       // HTTPS in prod
    sameSite: 'lax',
    path: '/',
  };
}

// app.post('/api/sessionLogin', async (req, res) => {
//   try {
//     const { idToken } = req.body || {};
//     if (!idToken) return res.status(400).json({ message: 'idToken is required' });

//     // Optional: verify to fail fast
//     await admin.auth().verifyIdToken(idToken);

//     const expiresIn = 5 * 24 * 60 * 60 * 1000; // 5 days
//     const sessionCookie = await admin.auth().createSessionCookie(idToken, { expiresIn });
//     res.cookie(SESSION_COOKIE_NAME, sessionCookie, { ...baseCookieOptions(), maxAge: expiresIn });
//     return res.json({ ok: true });
//   } catch (e) {
//     return res.status(401).json({ message: 'Invalid idToken', error: e.message });
//   }
// });
app.post('/api/sessionLogin', async (req, res) => {
  try {
    const { idToken } = req.body || {};
    if (!idToken) return res.status(400).json({ message: 'idToken is required' });

    // This throws with a detailed reason if invalid
    const decoded = await admin.auth().verifyIdToken(idToken);
    console.log('Decoded token OK:', { uid: decoded.uid, aud: decoded.aud, iss: decoded.iss });

    const expiresIn = 5 * 24 * 60 * 60 * 1000;
    const sessionCookie = await admin.auth().createSessionCookie(idToken, { expiresIn });
    res.cookie('__session', sessionCookie, { ...baseCookieOptions(), maxAge: expiresIn });
    return res.json({ ok: true });
  } catch (e) {
    console.error('sessionLogin failed:', e.message);
    return res.status(401).json({ message: 'Invalid idToken', error: e.message });
  }
});


app.post('/api/sessionLogout', async (req, res) => {
  // If you want to revoke on Firebase side, you could verify and revoke refresh tokens:
  // try {
  //   const cookie = req.cookies[SESSION_COOKIE_NAME];
  //   if (cookie) {
  //     const decoded = await admin.auth().verifySessionCookie(cookie, true);
  //     await admin.auth().revokeRefreshTokens(decoded.sub);
  //   }
  // } catch {}
  res.clearCookie(SESSION_COOKIE_NAME, { ...baseCookieOptions(), maxAge: 0 });
  return res.json({ ok: true });
});

// --- Mount protected routers (they do their own verify middleware) ---
app.use('/api/boards', boardsRouter);
app.use('/api/users', usersRouter);

// --- Socket.io collaboration (unchanged logic) ---
io.on('connection', (socket) => {
  console.log('🟢 Socket connected:', socket.id);

  socket.on('join-board', ({ boardId, userId, userName }) => {
    socket.join(boardId);
    socket.to(boardId).emit('user-joined', { userId, userName });
  });

  socket.on('draw', (data) => {
    io.to(data.boardId).emit('draw', data);
  });

  socket.on('shape-create', async (data) => {
    try {
      if (!data || !data.boardId || !data.shape) return;
      await Board.updateOne(
        { _id: data.boardId },
        { $push: { shapes: data.shape } }
      );
      io.to(data.boardId).emit('shape-created', { shape: data.shape });
    } catch (e) {
      console.error('shape-create error:', e.message);
    }
  });

  socket.on('shape-update', async (data) => {
    try {
      if (!data || !data.boardId || !data.shapeId) return;
      const props = data.props || {};
      const set = {};
      Object.keys(props).forEach((k) => (set[`shapes.$[elem].${k}`] = props[k]));
      if (Object.keys(set).length) {
        await Board.updateOne(
          { _id: data.boardId },
          { $set: set },
          { arrayFilters: [{ 'elem.id': data.shapeId }] }
        );
      }
      io.to(data.boardId).emit('shape-updated', { shapeId: data.shapeId, props });
    } catch (e) {
      console.error('shape-update error:', e.message);
    }
  });

  socket.on('shape-delete', async (data) => {
    try {
      if (!data || !data.boardId || !data.shapeId) return;
      await Board.updateOne(
        { _id: data.boardId },
        { $pull: { shapes: { id: data.shapeId } } }
      );
      io.to(data.boardId).emit('shape-deleted', { shapeId: data.shapeId });
    } catch (e) {
      console.error('shape-delete error:', e.message);
    }
  });

  socket.on('board-rename', async (data) => {
    try {
      if (!data || !data.boardId || typeof data.name !== 'string') return;
      await Board.updateOne(
        { _id: data.boardId },
        { $set: { name: data.name.trim() || 'Untitled document' } }
      );
      io.to(data.boardId).emit('board-renamed', { name: data.name.trim() || 'Untitled document' });
    } catch (e) {
      console.error('board-rename error:', e.message);
    }
  });

  socket.on('disconnect', () => {
    console.log('🔴 Socket disconnected:', socket.id);
  });
});

// --- Start ---
srv.listen(PORT, () => {
  console.log(`🚀 Server listening on ${PORT}`);
  console.log(`🌐 CORS origin: ${CLIENT_ORIGIN}`);
});
