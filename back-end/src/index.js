const path = require('path');
require('dotenv').config({ path: path.join(__dirname, '.env') });
const express   = require('express');
const http      = require('http');
const mongoose  = require('mongoose');
const cors      = require('cors');
const { Server }= require('socket.io');
const Board = require('./models/Board');

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
  socket.on('shape-create', async data => {
    // data: { boardId, shape }
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
    // data: { boardId, shapeId, props }
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
    // data: { boardId, shapeId }
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

  // Optional: board name updates via socket for real-time rename
  socket.on('board-rename', async data => {
    // data: { boardId, name }
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




// Start server
const PORT = process.env.PORT || 5000;
srv.listen(PORT, () => console.log(`🚀 Server listening on port ${PORT}`));
