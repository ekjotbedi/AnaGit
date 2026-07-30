'use strict';

const mongoose = require('mongoose');
const cacheEntrySchema = new mongoose.Schema(
  {
    key: { type: String, required: true, unique: true, index: true },
    data: { type: mongoose.Schema.Types.Mixed },
    etag: { type: String },
    link: { type: String },
    status: { type: Number },
    freshUntil: { type: Date },
  },
  { timestamps: true }
);

module.exports = mongoose.model('CacheEntry', cacheEntrySchema);
