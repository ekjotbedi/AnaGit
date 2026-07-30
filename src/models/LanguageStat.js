'use strict';

const mongoose = require('mongoose');

/*
 The language breakdown of a repository (bytes of code per language),
 plus the percentage we compute from it..one document per repo.
 */
const languageStatSchema = new mongoose.Schema(
  {
    repo: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Repository',
      required: true,
      unique: true, // one current language breakdown per repo
      index: true,
    },
    totalBytes: { type: Number, default: 0 },
    languages: [
      {
        _id: false,
        language: { type: String },
        bytes: { type: Number },
        percentage: { type: Number },
      },
    ],
    capturedAt: { type: Date, default: Date.now },
  },
  { timestamps: true }
);

module.exports = mongoose.model('LanguageStat', languageStatSchema);