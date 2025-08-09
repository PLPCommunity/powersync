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
    createdBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      required: false,
    },
    // Optional: lightweight persistence of strokes for simple history
    // For now we keep drawing in-memory via WebSocket; this is reserved for future use
    strokes: {
      type: [
        {
          points: [{ x: Number, y: Number }],
          color: { type: String, default: '#000000' },
          width: { type: Number, default: 2 },
        },
      ],
      default: [],
    },
  },
  { timestamps: true }
);

module.exports = mongoose.models.Board || mongoose.model('Board', BoardSchema);


