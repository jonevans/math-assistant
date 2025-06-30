// Load environment variables first
import dotenv from 'dotenv';
dotenv.config();

// Debug environment variables
console.log('Server starting with environment:', {
  hasOpenAIKey: !!process.env.OPENAI_API_KEY,
  port: process.env.PORT,
  mongoUri: process.env.MONGODB_URI,
});

import express, { Request, Response, NextFunction } from 'express';
import cors from 'cors';
import mongoose from 'mongoose';
import { authRouter } from './routes/auth';
import { documentsRouter } from './routes/documents';
import { User } from './models/User';
import jwt from 'jsonwebtoken';

const app = express();
const port = process.env.PORT || 3001;

// CORS configuration
const corsOptions = {
  origin: [
    'http://localhost:3000',
    'https://math-assistant-client.onrender.com'
  ],
  credentials: true,
  methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Authorization']
};

// Middleware
app.use(cors(corsOptions));
app.use(express.json());

// Authentication middleware
interface AuthRequest extends Request {
  user?: any;
}

const authMiddleware = async (req: AuthRequest, res: Response, next: NextFunction) => {
  try {
    // Get token from Authorization header
    const authHeader = req.headers.authorization;
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      return res.status(401).json({ error: 'Authentication required' });
    }

    const token = authHeader.split(' ')[1];
    
    // Verify the JWT token
    const decoded = jwt.verify(token, process.env.JWT_SECRET as string);
    if (!decoded || typeof decoded !== 'object' || !decoded._id) {
      return res.status(401).json({ error: 'Invalid token' });
    }
    
    // Find the user in the database
    const user = await User.findById(decoded._id);
    
    if (!user) {
      return res.status(401).json({ error: 'User not found' });
    }
    
    // Attach user to request object
    req.user = user;
    next();
  } catch (error) {
    console.error('Auth middleware error:', error);
    res.status(401).json({ error: 'Authentication failed' });
  }
};

// Routes
app.use('/api/auth', authRouter);
app.use('/api/documents', authMiddleware, documentsRouter);

// MongoDB connection
const MONGODB_URI = process.env.MONGODB_URI || 'mongodb://localhost:27017/math-assistant';
mongoose.connect(MONGODB_URI)
  .then(() => {
    console.log('Connected to MongoDB');
  })
  .catch((error) => {
    console.error('Error connecting to MongoDB:', error);
  });

// API health check endpoint
app.get('/api', (req, res) => {
  res.send('Math Assistant API is running');
});

// Health check endpoint
app.get('/health', (req, res) => {
  res.json({ status: 'ok' });
});

app.listen(port, () => {
  console.log(`Server is running on port ${port}`);
}); 