// index.js (backend)
const path = require('path');
require('dotenv').config({ path: path.join(__dirname, '.env') });

const express   = require('express');
const http      = require('http');
const mongoose  = require('mongoose');
const cors      = require('cors');
const { Server }= require('socket.io');
const Board     = require('./models/Board');

// 🔐 Ensure Firebase Admin is initialized for the SAME project as your frontend
// See ./firebaseAdmin.js from earlier steps — it should export the initialized admin instance.
const admin     = require('./firebaseAdmin'); // <-- make sure this file initializes admin

const app  = express();
const srv  = http.createServer(app);
const io   = new Server(srv, { cors: { origin: '*' } });

// CORS + JSON
app.use(cors({
  origin: true,
  // Make sure the Authorization header is allowed in preflight
  allowedHeaders: ['Content-Type', 'Authorization'],
}));
app.use(express.json());

// ---------- MongoDB ----------
mongoose.connect(process.env.MONGO_URI, {})
  .then(() => console.log('✅ MongoDB connected'))
  .catch(err => console.error('❌ MongoDB error:', err));

// ---------- Auth middleware ----------
function getBearer(req) {
  const h = req.headers['authorization'] || req.headers['Authorization'];
  if (!h) return null;
  const [scheme, token] = h.split(' ');
  if (scheme !== 'Bearer' || !token) return null;
  return token;
}

async function verifyFirebase(req, res, next) {
  try {
    const token = getBearer(req);
    if (!token) {
      return res.status(401).json({ message: 'Missing Authorization header' });
    }
    // Verify against YOUR Firebase project (must match frontend project)
    const decoded = await admin.auth().verifyIdToken(token);
    req.user = {
      uid: decoded.uid,
      email: decoded.email || '',
      name: decoded.name || decoded.email || '',
      picture: decoded.picture || '',
    };
    return next();
  } catch (err) {
    console.error('verifyFirebase failed:', err?.message || err);
    return res.status(401).json({ message: 'Invalid/expired Firebase token' });
  }
}

// ---------- Routes ----------
const boardsRouter = require('./routes/boards');
const usersRouter  = require('./routes/users');

// Simple health check (fixed signature)
app.get('/api/ping', (_req, res) => res.json({ msg: 'pong' }));

// Optional: quick debug to see claims when your token works
app.get('/api/whoami', verifyFirebase, (req, res) => {
  res.json({ user: req.user });
});

// IMPORTANT: protect your APIs with verifyFirebase.
// (If you already call verifyFirebase inside those routers, you can remove it there or here—just don’t double-verify.)
app.use('/api/users',  verifyFirebase, usersRouter);   // /api/users/sync expects a valid token
app.use('/api/boards', verifyFirebase, boardsRouter);  // all boards CRUD are scoped by req.user.uid

// ---------- Socket.IO (unchanged) ----------
io.on('connection', socket => {
  console.log(`🟢 User connected: ${socket.id}`);

  socket.on('join-board', ({ boardId, userId, userName }) => {
    socket.join(boardId);
    socket.to(boardId).emit('user-joined', { userId, userName });
  });

  socket.on('draw', data => {
    io.to(data.boardId).emit('draw', data);
  });

  socket.on('shape-create', async data => {
    console.log('📝 shape-create received:', { boardId: data?.boardId, shapeId: data?.shape?.id, shapeType: data?.shape?.type });
    if (!data || !data.boardId || !data.shape) {
      console.warn('❌ Invalid shape-create data:', data);
      return;
    }
    try {
      const result = await Board.updateOne(
        { _id: data.boardId },
        { $push: { shapes: data.shape } }
      );
      console.log('✅ shape-create persisted:', { matchedCount: result.matchedCount, modifiedCount: result.modifiedCount });
    } catch (e) {
      console.error('❌ Failed to persist shape-create:', e.message);
    }
    io.to(data.boardId).emit('shape-created', { shape: data.shape });
  });

  socket.on('shape-update', async data => {
    console.log('✏️ shape-update received:', { boardId: data?.boardId, shapeId: data?.shapeId, propsKeys: Object.keys(data?.props || {}) });
    if (!data || !data.boardId || !data.shapeId) {
      console.warn('❌ Invalid shape-update data:', data);
      return;
    }
    try {
      const props = data.props || {};
      const set = {};
      Object.keys(props).forEach(key => {
        set[`shapes.$[elem].${key}`] = props[key];
      });
      if (Object.keys(set).length) {
        const result = await Board.updateOne(
          { _id: data.boardId },
          { $set: set },
          { arrayFilters: [{ 'elem.id': data.shapeId }] }
        );
        console.log('✅ shape-update persisted:', { matchedCount: result.matchedCount, modifiedCount: result.modifiedCount });
      } else {
        console.log('⚠️ No props to update');
      }
    } catch (e) {
      console.error('❌ Failed to persist shape-update:', e.message);
    }
    io.to(data.boardId).emit('shape-updated', { shapeId: data.shapeId, props: data.props || {} });
  });

  socket.on('shape-delete', async data => {
    console.log('🗑️ shape-delete received:', { boardId: data?.boardId, shapeId: data?.shapeId });
    if (!data || !data.boardId || !data.shapeId) {
      console.warn('❌ Invalid shape-delete data:', data);
      return;
    }
    try {
      const result = await Board.updateOne(
        { _id: data.boardId },
        { $pull: { shapes: { id: data.shapeId } } }
      );
      console.log('✅ shape-delete persisted:', { matchedCount: result.matchedCount, modifiedCount: result.modifiedCount });
    } catch (e) {
      console.error('❌ Failed to persist shape-delete:', e.message);
    }
    io.to(data.boardId).emit('shape-deleted', { shapeId: data.shapeId });
  });

  socket.on('board-rename', async data => {
    if (!data || !data.boardId || typeof data.name !== 'string') return;
    try {
      await Board.updateOne(
        { _id: data.boardId },
        { $set: { name: data.name.trim() || 'Untitled document' } }
      );
      io.to(data.boardId).emit('board-renamed', { name: data.name.trim() || 'Untitled document' });
    } catch (e) {
      console.error('Failed to persist board-rename:', e.message);
    }
  });

  socket.on('disconnect', () => {
    console.log(`🔴 User disconnected: ${socket.id}`);
  });
});

// ---------- Start ----------
const PORT = process.env.PORT || 5000;
srv.listen(PORT, () => console.log(`🚀 Server listening on port ${PORT}`));
