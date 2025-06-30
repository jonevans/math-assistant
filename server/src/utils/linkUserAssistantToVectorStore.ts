import mongoose, { Document } from 'mongoose';
import dotenv from 'dotenv';
import OpenAI from 'openai';
import { User } from '../models/User';

// Define interface for user document to fix TypeScript error
interface IUserDocument extends Document {
  _id: mongoose.Types.ObjectId;
  email: string;
  name: string;
  vectorStoreId?: string;
}

// Load environment variables
dotenv.config();

const openai = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY
});

/**
 * Links an assistant to the vector store of the specified user
 * This function is meant to be called when running a query
 * to ensure the assistant is using the proper vector store
 */
export async function linkUserAssistantToVectorStore(userId: string): Promise<boolean> {
  try {
    // Get user
    const user = await User.findById(userId);
    if (!user) {
      console.error(`[LINK_ASSISTANT] User not found: ${userId}`);
      return false;
    }

    if (!user.vectorStoreId) {
      console.error(`[LINK_ASSISTANT] User has no vector store ID: ${user.email}`);
      return false;
    }

    console.log(`[LINK_ASSISTANT] Linking assistant to vector store ID: ${user.vectorStoreId} for user: ${user.email}`);
    
    // Get the assistant ID from environment or hardcoded value
    const assistantId = process.env.OPENAI_ASSISTANT_ID || "asst_dxxSHuryqquwSCK7fxBQXoiJ";
    
    try {
      const assistant = await openai.beta.assistants.retrieve(assistantId);
      console.log(`[LINK_ASSISTANT] Found assistant: ${assistant.name}`);
      
      // Update the assistant to use our vector store
      const updatedAssistant = await openai.beta.assistants.update(assistantId, {
        tool_resources: {
          file_search: {
            vector_store_ids: [user.vectorStoreId]
          }
        }
      });
      
      console.log(`[LINK_ASSISTANT] Successfully updated assistant to use vector store: ${user.vectorStoreId}`);
      return true;
    } catch (error) {
      console.error('[LINK_ASSISTANT] Error updating assistant:', error);
      return false;
    }
  } catch (error) {
    console.error('[LINK_ASSISTANT] Error linking assistant to vector store:', error);
    return false;
  }
}

/**
 * Standalone script to link the assistant to a specific user's vector store
 * Can be used for testing or manual updates
 */
async function linkAssistantToSpecificUser(email: string) {
  try {
    // Connect to MongoDB
    const MONGODB_URI = process.env.MONGODB_URI || 'mongodb://localhost:27017/math-assistant';
    await mongoose.connect(MONGODB_URI);
    console.log('Connected to MongoDB');

    // Get user by email with type assertion
    const user = await User.findOne({ email }) as IUserDocument;
    if (!user) {
      console.error(`User with email ${email} not found`);
      return;
    }
    
    const userId = user._id.toString();
    const result = await linkUserAssistantToVectorStore(userId);
    console.log(`Link assistant result: ${result ? 'Success' : 'Failed'}`);
  } catch (error) {
    console.error('Error in standalone script:', error);
  } finally {
    // Close the connection
    await mongoose.disconnect();
    console.log('Disconnected from MongoDB');
  }
}

// If running this file directly, link the assistant to the test user
if (require.main === module) {
  const userEmail = process.argv[2] || 'test@example.com';
  console.log(`Running standalone script for user: ${userEmail}`);
  linkAssistantToSpecificUser(userEmail);
} 