import mongoose from 'mongoose';
import dotenv from 'dotenv';
import OpenAI from 'openai';
import { User } from '../models/User';

// Load environment variables
dotenv.config();

const openai = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY
});

async function linkAssistantToVectorStore() {
  try {
    // Connect to MongoDB
    const MONGODB_URI = process.env.MONGODB_URI || 'mongodb://localhost:27017/math-assistant';
    await mongoose.connect(MONGODB_URI);
    console.log('Connected to MongoDB');

    // Get test user
    const user = await User.findOne({ email: 'test@example.com' });
    if (!user) {
      console.error('Test user not found');
      return;
    }

    if (!user.vectorStoreId) {
      console.error('User has no vector store ID');
      return;
    }

    console.log(`Found user with vector store ID: ${user.vectorStoreId}`);
    
    // Get the assistant ID from environment or hardcoded value
    const assistantId = "asst_dxxSHuryqquwSCK7fxBQXoiJ";
    
    // Retrieve current assistant
    try {
      const assistant = await openai.beta.assistants.retrieve(assistantId);
      console.log('Found assistant:', assistant.name);
      
      // Update the assistant to use our vector store
      const updatedAssistant = await openai.beta.assistants.update(assistantId, {
        tool_resources: {
          file_search: {
            vector_store_ids: [user.vectorStoreId]
          }
        }
      });
      
      console.log(`Successfully updated assistant to use vector store: ${user.vectorStoreId}`);
      console.log('Updated assistant details:', {
        id: updatedAssistant.id,
        name: updatedAssistant.name,
        tools: updatedAssistant.tools,
        tool_resources: updatedAssistant.tool_resources
      });
    } catch (error) {
      console.error('Error updating assistant:', error);
    }
  } catch (error) {
    console.error('Error linking assistant to vector store:', error);
  } finally {
    // Close the connection
    await mongoose.disconnect();
    console.log('Disconnected from MongoDB');
  }
}

// Run the function
linkAssistantToVectorStore(); 