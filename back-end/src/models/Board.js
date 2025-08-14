const mongoose = require('mongoose');

const BoardSchema = new mongoose.Schema(
  {
    name: {
      type: String,
      required: true,
      trim: true,
      minlength: 1,
      maxlength: 120,
    },
    description: {
      type: String,
      trim: true,
      default: '',
      maxlength: 500,
    },
    // / 🔐 ownership
    ownerId: { type: String, required: true, index: true },    // Firebase uid
    ownerName: { type: String, default: '' },
    ownerEmail: { type: String, default: '', index: true },
    createdBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      required: false,
    },
    // Persisted shapes state for the board (saved in real-time by clients)
    shapes: {
      type: [mongoose.Schema.Types.Mixed],
      default: [],
    },
  },
  { timestamps: true }
);




// Clear any existing model to avoid conflicts
if (mongoose.models.Board) {
  delete mongoose.models.Board;
}

module.exports = mongoose.model('Board', BoardSchema);


