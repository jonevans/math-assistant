import mongoose from 'mongoose';
import dotenv from 'dotenv';
import OpenAI from 'openai';
import { User } from '../models/User';
import { PdfDocument } from '../models/Document';

// Load environment variables
dotenv.config();

const openai = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY
});

/**
 * Force updates all documents to ready status if they exist in the vector store
 */
async function forceUpdateDocumentStatus() {
  try {
    // Connect to MongoDB
    const MONGODB_URI = process.env.MONGODB_URI || 'mongodb://localhost:27017/math-assistant';
    await mongoose.connect(MONGODB_URI);
    console.log('Connected to MongoDB');

    // Get all users
    const users = await User.find();
    console.log(`Found ${users.length} users`);

    for (const user of users) {
      if (!user.vectorStoreId) {
        console.log(`User ${user.email} has no vector store ID, skipping`);
        continue;
      }

      console.log(`\nProcessing user ${user.email} with vector store ID: ${user.vectorStoreId}`);
      
      try {
        // Get all files in the vector store
        const vectorStoreFiles = await openai.vectorStores.files.list(user.vectorStoreId);
        console.log(`Found ${vectorStoreFiles.data.length} files in vector store`);
        
        // Create a set of vector file IDs for quick lookup
        const vectorFileIds = new Set(vectorStoreFiles.data.map(file => file.id));
        
        // Get all documents for this user
        const documents = await PdfDocument.find({ userId: user._id });
        console.log(`Found ${documents.length} documents for user ${user.email}`);
        
        let updatedCount = 0;
        
        // Update processing documents to ready if they're in the vector store
        for (const doc of documents) {
          console.log(`\nChecking document: ${doc.filename} (status: ${doc.status})`);
          
          if (doc.vectorFileId && vectorFileIds.has(doc.vectorFileId)) {
            // Vector file exists, mark as ready
            if (doc.status !== 'ready') {
              console.log(`  Updating status from ${doc.status} to ready`);
              doc.status = 'ready';
              await doc.save();
              updatedCount++;
            } else {
              console.log(`  Document is already marked as ready`);
            }
          } else if (doc.vectorFileId) {
            console.log(`  Vector file ID ${doc.vectorFileId} not found in vector store`);
          } else {
            console.log(`  Document has no vector file ID`);
          }
        }
        
        console.log(`\nUpdated ${updatedCount} documents for user ${user.email}`);
      } catch (error) {
        console.error(`Error processing user ${user.email}:`, error);
      }
    }
  } catch (error) {
    console.error('Error in script:', error);
  } finally {
    // Close the connection
    await mongoose.disconnect();
    console.log('Disconnected from MongoDB');
  }
}

// Run the script
forceUpdateDocumentStatus(); 