import express from 'express';
import mongoose from 'mongoose';
import dotenv from 'dotenv';
import cors from 'cors';
import cookieParser from 'cookie-parser';
import { authRouter } from './routes/auth';
import { documentsRouter } from './routes/documents';
import { authenticateToken } from './middleware/auth';
import { startDocumentStatusUpdater } from './utils/documentStatusUpdater';

// Load environment variables
dotenv.config();

// Create Express app
const app = express();

// Middleware
app.use(express.json());
app.use(cors({
  origin: process.env.CLIENT_URL || 'http://localhost:3000',
  credentials: true,
}));
app.use(cookieParser());

// Connect to MongoDB
const MONGODB_URI = process.env.MONGODB_URI || 'mongodb://localhost:27017/math-assistant';
mongoose.connect(MONGODB_URI)
  .then(() => console.log('Connected to MongoDB'))
  .catch(err => console.error('MongoDB connection error:', err));

// Routes
app.use('/api/auth', authRouter);
app.use('/api/documents', authenticateToken, documentsRouter);

// Root route for API health check
app.get('/api', (req, res) => {
  res.send('Math Assistant API is running');
});

// Start the server
const PORT = process.env.PORT || 5000;
app.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`);
  
  // Start background document status updater
  // Check every 1 minute for documents that need status updates
  startDocumentStatusUpdater(1);
});

export default app; 