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

async function cleanupOrphanedDocuments() {
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
    
    // Create a set of valid file IDs
    const validFileIds = new Set(vectorStoreFiles.data.map(file => file.id));
    console.log('Valid file IDs in vector store:', Array.from(validFileIds));
    
    // Get all documents for this user
    const documents = await PdfDocument.find({ userId: user._id });
    console.log(`Found ${documents.length} documents in database`);
    
    // Identify orphaned documents (those with vector file IDs not in the vector store)
    const orphanedDocuments = documents.filter(doc => 
      doc.vectorFileId && !validFileIds.has(doc.vectorFileId)
    );
    
    console.log(`Found ${orphanedDocuments.length} orphaned documents to clean up`);
    
    // Delete orphaned documents
    for (const doc of orphanedDocuments) {
      console.log(`Deleting orphaned document: ${doc._id} (${doc.filename})`);
      console.log(`- Vector file ID ${doc.vectorFileId} not found in vector store`);
      
      await PdfDocument.findByIdAndDelete(doc._id);
      console.log(`- Document deleted successfully`);
    }
    
    // Double check the remaining documents
    const remainingDocs = await PdfDocument.find({ userId: user._id });
    console.log(`Remaining documents in database: ${remainingDocs.length}`);
    for (const doc of remainingDocs) {
      console.log(`- ${doc._id}: ${doc.filename} (vector file ID: ${doc.vectorFileId})`);
    }
    
  } catch (error) {
    console.error('Error cleaning up orphaned documents:', error);
  } finally {
    // Close the connection
    await mongoose.disconnect();
    console.log('Disconnected from MongoDB');
  }
}

// Run the function
cleanupOrphanedDocuments(); 