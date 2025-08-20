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
    // 👥 collaborators invited to this board
    collaborators: {
      type: [
        new mongoose.Schema(
          {
            email: { type: String, required: true, index: true, lowercase: true, trim: true },
            uid: { type: String, default: '', index: true },
            role: { type: String, enum: ['editor', 'viewer'], default: 'viewer' },
            invitedByUid: { type: String, default: '' },
            invitedByEmail: { type: String, default: '' },
            invitedAt: { type: Date, default: Date.now },
            acceptedAt: { type: Date },
            status: { type: String, enum: ['invited', 'accepted'], default: 'invited' },
          },
          { _id: false }
        ),
      ],
      default: [],
    },
    // 🌐 public access settings
    publicAccess: {
      enabled: { type: Boolean, default: false },
      role: { type: String, enum: ['viewer', 'editor'], default: 'viewer' },
      linkId: { type: String, unique: true, sparse: true, index: true },
    },
  },
  { timestamps: true }
);

// Generate unique public link ID
BoardSchema.pre('save', function(next) {
  if (this.publicAccess?.enabled && !this.publicAccess.linkId) {
    this.publicAccess.linkId = Math.random().toString(36).substring(2, 15) + Math.random().toString(36).substring(2, 15);
  }
  next();
});

// Clear any existing model to avoid conflicts
if (mongoose.models.Board) {
  delete mongoose.models.Board;
}

module.exports = mongoose.model('Board', BoardSchema);


