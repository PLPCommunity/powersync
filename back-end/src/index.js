// index.js
const path = require('path');
require('dotenv').config({ path: path.join(__dirname, '.env') });
const express   = require('express');
const http      = require('http');
const mongoose  = require('mongoose');
const cors      = require('cors');
const cookieParser = require('cookie-parser');
const { Server }= require('socket.io');
const cookie = require('cookie');

const admin     = require('./firebaseAdmin');
const Board     = require('./models/Board');

const app  = express();
const srv  = http.createServer(app);
const io   = new Server(srv, { cors: { origin: true, credentials: true } });

// --- config ---
const SESSION_COOKIE_NAME = process.env.SESSION_COOKIE_NAME || 'fbSession';
const SESSION_COOKIE_MAXAGE_MS = Number(process.env.SESSION_COOKIE_MAXAGE_MS || 1000 * 60 * 60 * 24 * 5); // 5 days
const FRONTEND_ORIGIN = process.env.FRONTEND_ORIGIN || 'http://localhost:3000';
app.use(cors({ origin: 'http://localhost:3000', credentials: true }));


// --- middleware ---
app.use(cors({
  origin: FRONTEND_ORIGIN,
  credentials: true,                 // allow cookies to flow
}));
app.use(express.json());
app.use(cookieParser());

// --- mongo ---
mongoose.connect(process.env.MONGO_URI, {})
  .then(() => console.log('✅ MongoDB connected'))
  .catch(err => console.error('❌ MongoDB error:', err));

// --- auth helpers ---
async function verifySession(req, res, next) {
  try {
    const sessionCookie = req.cookies[SESSION_COOKIE_NAME];
    if (!sessionCookie) return res.status(401).json({ message: 'No session' });

    const decoded = await admin.auth().verifySessionCookie(sessionCookie, true); // check revocation
    req.user = {
      uid: decoded.uid,
      email: decoded.email || '',
      name: decoded.name || decoded.email || '',
      picture: decoded.picture || '',
    };
    next();
  } catch (e) {
    console.error('verifySession failed:', e.message);
    return res.status(401).json({ message: 'Invalid/expired session' });
  }
}

// Create a session cookie from a Firebase ID token (client calls this ONCE after login)
app.post('/api/sessionLogin', async (req, res) => {
  try {
    const { idToken } = req.body || {};
    if (!idToken) return res.status(400).json({ message: 'idToken required' });

    const sessionCookie = await admin.auth().createSessionCookie(idToken, { expiresIn: SESSION_COOKIE_MAXAGE_MS });

    // Set secure cookie
    res.cookie(SESSION_COOKIE_NAME, sessionCookie, {
      maxAge: SESSION_COOKIE_MAXAGE_MS,
      httpOnly: true,
      secure: process.env.NODE_ENV === 'production',
      sameSite: 'lax',
      path: '/',
    });
    res.json({ ok: true });
  } catch (e) {
    console.error('sessionLogin error:', e.message);
    res.status(401).json({ message: 'Failed to create session' });
  }
});

// Clear the session cookie
app.post('/api/sessionLogout', (req, res) => {
  res.clearCookie(SESSION_COOKIE_NAME, { path: '/' });
  res.json({ ok: true });
});

// health
app.get('/api/ping', (_req, res) => res.json({ msg: 'pong' }));

// routers (now protected by cookie sessions)
const boardsRouter = require('./routes/boards'); // should rely on req.user.uid
const usersRouter  = require('./routes/users');  // creates/updates user by req.user

app.use('/api/users',  verifySession, usersRouter);
app.use('/api/boards', verifySession, boardsRouter);

// --- socket.io (optional auth by cookie) ---
io.use(async (socket, next) => {
  try {
    const raw = socket.handshake.headers.cookie || '';
    const cookies = cookie.parse(raw);
    const sessionCookie = cookies[SESSION_COOKIE_NAME];
    if (!sessionCookie) return next(); // allow unauth or block: return next(new Error('unauthorized'));

    const decoded = await admin.auth().verifySessionCookie(sessionCookie, true);
    socket.user = { uid: decoded.uid, email: decoded.email || '' };
    next();
  } catch (e) {
    console.warn('socket auth skipped/failed:', e.message);
    next(); // or next(new Error('unauthorized'));
  }
});

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
    if (!data || !data.boardId || !data.shape) return;
    try {
      await Board.updateOne({ _id: data.boardId }, { $push: { shapes: data.shape } });
    } catch (e) {
      console.error('❌ persist create:', e.message);
    }
    io.to(data.boardId).emit('shape-created', { shape: data.shape });
  });

  socket.on('shape-update', async data => {
    if (!data || !data.boardId || !data.shapeId) return;
    try {
      const set = {};
      Object.keys(data.props || {}).forEach(k => (set[`shapes.$[e].${k}`] = data.props[k]));
      if (Object.keys(set).length) {
        await Board.updateOne(
          { _id: data.boardId },
          { $set: set },
          { arrayFilters: [{ 'e.id': data.shapeId }] }
        );
      }
    } catch (e) {
      console.error('❌ persist update:', e.message);
    }
    io.to(data.boardId).emit('shape-updated', { shapeId: data.shapeId, props: data.props || {} });
  });

  socket.on('shape-delete', async data => {
    if (!data || !data.boardId || !data.shapeId) return;
    try {
      await Board.updateOne({ _id: data.boardId }, { $pull: { shapes: { id: data.shapeId } } });
    } catch (e) {
      console.error('❌ persist delete:', e.message);
    }
    io.to(data.boardId).emit('shape-deleted', { shapeId: data.shapeId });
  });

  socket.on('board-rename', async data => {
    if (!data || !data.boardId || typeof data.name !== 'string') return;
    try {
      await Board.updateOne({ _id: data.boardId }, { $set: { name: data.name.trim() || 'Untitled document' } });
      io.to(data.boardId).emit('board-renamed', { name: data.name.trim() || 'Untitled document' });
    } catch (e) {
      console.error('Failed to persist board-rename:', e.message);
    }
  });

  socket.on('disconnect', () => {
    console.log(`🔴 User disconnected: ${socket.id}`);
  });
});

const PORT = process.env.PORT || 5000;
srv.listen(PORT, () => console.log(`🚀 Server listening on port ${PORT}`));
