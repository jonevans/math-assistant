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

async function updateDocumentStatus() {
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
    
    // Retrieve all files in the vector store
    const vectorStoreFiles = await openai.vectorStores.files.list(user.vectorStoreId);
    console.log(`Found ${vectorStoreFiles.data.length} files in vector store`);
    
    // Create a map of file IDs to their status
    const fileStatusMap = new Map();
    for (const file of vectorStoreFiles.data) {
      fileStatusMap.set(file.id, file.status);
      console.log(`File ${file.id} status: ${file.status}`);
    }
    
    // Get all documents for this user
    const documents = await PdfDocument.find({ userId: user._id });
    console.log(`Found ${documents.length} documents in database`);
    
    // Update each document's status based on its vector file status
    let updatedCount = 0;
    for (const doc of documents) {
      console.log(`Checking document ${doc._id} (${doc.filename})`);
      
      // Skip documents with no vector file ID
      if (!doc.vectorFileId) {
        console.log(`- Document has no vector file ID`);
        continue;
      }
      
      // Get the status from the map
      const vectorFileStatus = fileStatusMap.get(doc.vectorFileId);
      if (!vectorFileStatus) {
        console.log(`- Vector file ID ${doc.vectorFileId} not found in vector store`);
        continue;
      }
      
      // Map vector store status to document status
      let newStatus = doc.status;
      if (vectorFileStatus === 'completed') {
        newStatus = 'ready';
      } else if (vectorFileStatus === 'failed') {
        newStatus = 'failed';
      } else if (vectorFileStatus === 'in_progress' || vectorFileStatus === 'cancelled') {
        newStatus = 'processing';
      }
      
      // Update if status is different
      if (doc.status !== newStatus) {
        console.log(`- Updating status from ${doc.status} to ${newStatus}`);
        doc.status = newStatus;
        await doc.save();
        updatedCount++;
      } else {
        console.log(`- Status is already ${doc.status}, no update needed`);
      }
    }
    
    console.log(`Updated ${updatedCount} documents`);
  } catch (error) {
    console.error('Error updating document status:', error);
  } finally {
    // Close the connection
    await mongoose.disconnect();
    console.log('Disconnected from MongoDB');
  }
}

// Run the function
updateDocumentStatus(); 