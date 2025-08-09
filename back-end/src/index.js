const path = require('path');
require('dotenv').config({ path: path.join(__dirname, '.env') });
const express   = require('express');
const http      = require('http');
const mongoose  = require('mongoose');
const cors      = require('cors');
const { Server }= require('socket.io');

const app  = express();
const srv  = http.createServer(app);
const io   = new Server(srv, { cors: { origin: '*' } });

// Middleware
app.use(cors());
app.use(express.json());

// Routes
const boardsRouter = require('./routes/boards');

// Connect MongoDB
mongoose.connect(process.env.MONGO_URI, { useNewUrlParser: true, useUnifiedTopology: true })
  .then(() => console.log('✅ MongoDB connected'))
  .catch(err => console.error('❌ MongoDB error:', err));

// Example REST route
app.get('/api/ping', (req, res) => res.json({ msg: 'pong' }));

app.use('/api/boards', boardsRouter);

// Socket.io handlers
io.on('connection', socket => {
  console.log(`🟢 User connected: ${socket.id}`);

  socket.on('join-board', ({ boardId, userId, userName }) => {
    socket.join(boardId);
    socket.to(boardId).emit('user-joined', { userId, userName });
  });

  socket.on('draw', data => {
    io.to(data.boardId).emit('draw', data);
  });

  // Shape collaboration events
  socket.on('shape-create', data => {
    // data: { boardId, shape }
    if (!data || !data.boardId || !data.shape) return;
    io.to(data.boardId).emit('shape-created', { shape: data.shape });
  });

  socket.on('shape-update', data => {
    // data: { boardId, shapeId, props }
    if (!data || !data.boardId || !data.shapeId) return;
    io.to(data.boardId).emit('shape-updated', { shapeId: data.shapeId, props: data.props || {} });
  });

  socket.on('shape-delete', data => {
    // data: { boardId, shapeId }
    if (!data || !data.boardId || !data.shapeId) return;
    io.to(data.boardId).emit('shape-deleted', { shapeId: data.shapeId });
  });

  socket.on('disconnect', () => {
    console.log(`🔴 User disconnected: ${socket.id}`);
  });
});

// Start server
const PORT = process.env.PORT || 5000;
srv.listen(PORT, () => console.log(`🚀 Server listening on port ${PORT}`));
