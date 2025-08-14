const mongoose = require('mongoose');

const userSchema = new mongoose.Schema({
  uid:      { type: String, required: true, unique: true, index: true },
  email:    { type: String, required: true, index: true },
  name:     { type: String, default: '' },
  photoURL: { type: String, default: '' },
  provider: { type: String, default: '' },
}, { timestamps: true });

module.exports = mongoose.model('User', userSchema);
