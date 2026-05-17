'use strict';

const mongoose = require('mongoose');

/**
 * Establishes the Mongoose connection.
 * Called once on server startup.
 */
async function connectMongo() {
  const uri = process.env.MONGO_URI;
  if (!uri) throw new Error('MONGO_URI environment variable is not set');

  try {
    await mongoose.connect(uri, {
      serverSelectionTimeoutMS: 10_000,
      socketTimeoutMS: 45_000,
    });
    console.log('[Mongo] Connected to MongoDB');
  } catch (err) {
    console.error('[Mongo] Connection failed:', err.message);
    throw err;
  }

  mongoose.connection.on('error', (err) => {
    console.error('[Mongo] Connection error:', err.message);
  });

  mongoose.connection.on('disconnected', () => {
    console.warn('[Mongo] Disconnected from MongoDB');
  });
}

// ── Schema ────────────────────────────────────────────────────────────────────

const messageSchema = new mongoose.Schema(
  {
    role: {
      type: String,
      enum: ['user', 'bot'],
      required: true,
    },
    content: {
      type: String,
      required: true,
      maxlength: 4000,
    },
    timestamp: {
      type: Date,
      default: Date.now,
    },
  },
  { _id: false }
);

const conversationLogSchema = new mongoose.Schema(
  {
    ticketId: {
      type: String,
      required: true,
      index: true,
    },
    userId: {
      type: String,
      required: true,
      index: true,
    },
    messages: {
      type: [messageSchema],
      default: [],
    },
  },
  {
    timestamps: true, // adds createdAt + updatedAt via Mongoose
    collection: 'conversation_logs',
  }
);

const ConversationLog = mongoose.model('ConversationLog', conversationLogSchema);

module.exports = { connectMongo, ConversationLog };
