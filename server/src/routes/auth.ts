import { Router, Request, Response } from 'express';
import { OAuth2Client } from 'google-auth-library';
import { User } from '../models/User';
import jwt from 'jsonwebtoken';
import { authenticateToken } from '../middleware/auth';

const router = Router();
const client = new OAuth2Client(process.env.GOOGLE_CLIENT_ID);

// Ensure JWT_SECRET is available
if (!process.env.JWT_SECRET) {
  console.error('ERROR: JWT_SECRET environment variable is not set');
  process.exit(1);
}

// Get current user information
router.get('/me', authenticateToken, async (req: Request, res: Response) => {
  try {
    // @ts-ignore: user is attached by the authenticateToken middleware
    const userId = req.user?._id;
    
    if (!userId) {
      return res.status(401).json({ error: 'Unauthorized' });
    }
    
    const user = await User.findById(userId);
    
    if (!user) {
      return res.status(404).json({ error: 'User not found' });
    }
    
    // Return user info
    res.json({
      email: user.email,
      name: user.name,
      picture: user.picture
    });
  } catch (error) {
    console.error('Get user error:', error);
    res.status(500).json({ error: 'Failed to get user information' });
  }
});

// Verify Google token and create/update user
router.post('/google', async (req: Request, res: Response) => {
  try {
    const { token } = req.body;
    const ticket = await client.verifyIdToken({
      idToken: token,
      audience: process.env.GOOGLE_CLIENT_ID
    });
    
    const payload = ticket.getPayload();
    if (!payload || !payload.email) {
      throw new Error('Invalid token payload');
    }

    // Find existing user or create a new one
    let user = await User.findOne({ email: payload.email });
    
    if (!user) {
      // Create a new user
      user = new User({
        email: payload.email,
        name: payload.name || 'User',
        picture: payload.picture,
        googleId: payload.sub, // Use the Google subject ID as googleId
      });
      await user.save();
      console.log('New user created:', user.email);
    } else {
      // Update existing user information
      user.name = payload.name || user.name;
      user.picture = payload.picture || user.picture;
      await user.save();
      console.log('User updated:', user.email);
    }

    // Generate a JWT token with expiration
    const jwtToken = jwt.sign(
      { _id: user._id, email: user.email },
      process.env.JWT_SECRET as string,
      { expiresIn: '24h' } // Token expires in 24 hours
    );

    // Set HTTP-only cookie with the token
    res.cookie('token', jwtToken, {
      httpOnly: true,
      secure: process.env.NODE_ENV === 'production', // Secure in production
      sameSite: 'strict',
      maxAge: 24 * 60 * 60 * 1000 // 24 hours in milliseconds
    });

    // Return user info and token
    res.json({
      email: user.email,
      name: user.name,
      picture: user.picture,
      token: jwtToken // Send token in response body for client-side storage
    });
  } catch (error) {
    console.error('Auth error:', error);
    res.status(401).json({ error: 'Authentication failed' });
  }
});

export const authRouter = router; 