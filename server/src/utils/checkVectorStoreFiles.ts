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

async function checkVectorStoreFiles() {
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

    console.log('Found user:', user);
    
    // Check if user has a vector store ID
    if (!user.vectorStoreId) {
      console.log('User has no vector store ID, creating one...');
      const vectorStore = await openai.vectorStores.create({
        name: `${user.name}'s Vector Store`,
      });
      
      user.vectorStoreId = vectorStore.id;
      await user.save();
      console.log(`Created vector store with ID ${vectorStore.id}`);
    } else {
      console.log(`User has vector store ID: ${user.vectorStoreId}`);
      
      // Verify the vector store exists
      try {
        const vectorStore = await openai.vectorStores.retrieve(user.vectorStoreId);
        console.log('Vector store exists:', vectorStore);
      } catch (error) {
        console.error('Error retrieving vector store:', error);
        console.log('Creating a new vector store...');
        
        const vectorStore = await openai.vectorStores.create({
          name: `${user.name}'s Vector Store (new)`,
        });
        
        user.vectorStoreId = vectorStore.id;
        await user.save();
        console.log(`Created new vector store with ID ${vectorStore.id}`);
      }
    }
    
    // Get all OpenAI files
    const allFiles = await openai.files.list();
    console.log(`Found ${allFiles.data.length} files in OpenAI`);
    
    // Get user's documents
    const documents = await PdfDocument.find({ userId: user._id });
    console.log(`Found ${documents.length} documents in database`);
    
    // Log document details
    for (const doc of documents) {
      console.log(`Document: ${doc.filename}, OpenAI File ID: ${doc.openaiFileId}, Vector File ID: ${doc.vectorFileId || 'NONE'}`);
      
      // Check if the file exists in OpenAI
      try {
        const fileInfo = await openai.files.retrieve(doc.openaiFileId);
        console.log(`  File exists in OpenAI: ${fileInfo.id}, Purpose: ${fileInfo.purpose}`);
      } catch (error) {
        console.error(`  Error retrieving file ${doc.openaiFileId}:`, error);
        continue;
      }
      
      // If no vector file ID, try to add it to the vector store
      if (!doc.vectorFileId && user.vectorStoreId) {
        try {
          console.log(`  Adding file ${doc.openaiFileId} to vector store ${user.vectorStoreId}...`);
          const vectorFile = await openai.vectorStores.files.create(
            user.vectorStoreId,
            { file_id: doc.openaiFileId }
          );
          
          doc.vectorFileId = vectorFile.id;
          await doc.save();
          console.log(`  Successfully added file to vector store. Vector File ID: ${vectorFile.id}`);
        } catch (error) {
          console.error(`  Error adding file to vector store:`, error);
        }
      } else if (doc.vectorFileId && user.vectorStoreId) {
        // Check if the vector file exists
        try {
          const vectorFileInfo = await openai.vectorStores.files.retrieve(
            user.vectorStoreId,
            doc.vectorFileId
          );
          console.log(`  Vector file exists: ${vectorFileInfo.id}, Status: ${vectorFileInfo.status}`);
        } catch (error) {
          console.error(`  Error retrieving vector file ${doc.vectorFileId}:`, error);
          
          // Try to re-add it
          try {
            console.log(`  Re-adding file ${doc.openaiFileId} to vector store ${user.vectorStoreId}...`);
            const vectorFile = await openai.vectorStores.files.create(
              user.vectorStoreId,
              { file_id: doc.openaiFileId }
            );
            
            doc.vectorFileId = vectorFile.id;
            await doc.save();
            console.log(`  Successfully re-added file to vector store. Vector File ID: ${vectorFile.id}`);
          } catch (reAddError) {
            console.error(`  Error re-adding file to vector store:`, reAddError);
          }
        }
      }
    }
    
    // Get files in the vector store
    try {
      if (user.vectorStoreId) {
        const vectorStoreFiles = await openai.vectorStores.files.list(user.vectorStoreId);
        console.log(`\nFiles in vector store ${user.vectorStoreId}:`);
        
        for (const file of vectorStoreFiles.data) {
          console.log(`  File ID: ${file.id}, File Object ID: ${file.object}, Status: ${file.status}`);
        }
      }
    } catch (error) {
      console.error('Error listing vector store files:', error);
    }
  } catch (error) {
    console.error('Error checking vector store files:', error);
  } finally {
    // Close the connection
    await mongoose.disconnect();
    console.log('Disconnected from MongoDB');
  }
}

// Run the function
checkVectorStoreFiles(); 