// server/config/db.js
const mongoose = require('mongoose');
const logger = require('../utils/logger');

let isConnected = false;

/**
 * Connect to MongoDB with retry + graceful failure.
 * Safe to call multiple times — returns existing connection if already open.
 */
async function connectDB() {
  if (isConnected) return mongoose.connection;

  const uri = process.env.MONGODB_URI;
  if (!uri) {
    logger.error('MONGODB_URI is not set. Aborting connection.');
    throw new Error('MONGODB_URI missing');
  }

  mongoose.set('strictQuery', true);
  mongoose.set('bufferCommands', false); // fail fast instead of buffering forever

  const options = {
    serverSelectionTimeoutMS: 10000,
    socketTimeoutMS: 45000,
    maxPoolSize: 10,
    minPoolSize: 1,
    autoIndex: process.env.NODE_ENV !== 'production'
  };

  let attempts = 0;
  const maxAttempts = 5;

  while (attempts < maxAttempts) {
    try {
      await mongoose.connect(uri, options);
      isConnected = true;
      logger.info(`MongoDB connected → ${mongoose.connection.host}/${mongoose.connection.name}`);

      // ---- Connection event handlers ----
      mongoose.connection.on('disconnected', () => {
        isConnected = false;
        logger.warn('MongoDB disconnected');
      });

      mongoose.connection.on('reconnected', () => {
        isConnected = true;
        logger.info('MongoDB reconnected');
      });

      mongoose.connection.on('error', (err) => {
        logger.error(`MongoDB error: ${err.message}`);
      });

      return mongoose.connection;
    } catch (err) {
      attempts++;
      const delay = Math.min(2000 * attempts, 10000);
      logger.error(`MongoDB connection attempt ${attempts} failed: ${err.message}. Retrying in ${delay}ms...`);
      await new Promise((r) => setTimeout(r, delay));
    }
  }

  throw new Error('MongoDB connection failed after multiple attempts');
}

/**
 * Graceful shutdown — call from process signal handlers.
 */
async function disconnectDB() {
  if (!isConnected) return;
  await mongoose.connection.close();
  isConnected = false;
  logger.info('MongoDB connection closed');
}

function getConnectionState() {
  const states = ['disconnected', 'connected', 'connecting', 'disconnecting'];
  return states[mongoose.connection.readyState] || 'unknown';
}

module.exports = { connectDB, disconnectDB, getConnectionState };