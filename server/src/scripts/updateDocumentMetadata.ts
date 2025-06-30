import mongoose from 'mongoose';
import dotenv from 'dotenv';
import { PdfDocument } from '../models/Document';
import OpenAI from 'openai';
import fs from 'fs';
import path from 'path';
// @ts-ignore - Using a module without proper type definitions
import pdfParse from 'pdf-parse';

// Load environment variables
dotenv.config();

// Create OpenAI client
const openai = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY
});

// Connect to MongoDB
mongoose
  .connect(process.env.MONGODB_URI || 'mongodb://localhost:27017/math-assistant')
  .then(() => console.log('Connected to MongoDB'))
  .catch(err => {
    console.error('MongoDB connection error:', err);
    process.exit(1);
  });

// Ensure the temp directory exists
const tempDir = path.join(__dirname, '../../temp');
if (!fs.existsSync(tempDir)) {
  fs.mkdirSync(tempDir, { recursive: true });
}

async function updateDocumentMetadata() {
  try {
    console.log('Starting metadata update for documents...');

    // Find documents without page count
    const documents = await PdfDocument.find({ 
      $or: [
        { pageCount: { $exists: false } },
        { pageCount: null }
      ]
    });

    console.log(`Found ${documents.length} documents to update`);

    for (const doc of documents) {
      console.log(`Processing document: ${doc.filename} (${doc._id})`);
      
      try {
        // Download the file from OpenAI
        const tempFilePath = path.join(tempDir, `${doc._id}.pdf`);
        
        console.log(`Downloading file ${doc.openaiFileId} to ${tempFilePath}`);
        const response = await openai.files.content(doc.openaiFileId);
        const buffer = Buffer.from(await response.arrayBuffer());
        fs.writeFileSync(tempFilePath, buffer);
        
        // Extract PDF metadata
        console.log('Extracting metadata...');
        const pdfData = await pdfParse(buffer);
        const pageCount = pdfData.numpages;
        const fileSizeBytes = buffer.length;
        
        console.log(`Extracted metadata: ${pageCount} pages, ${fileSizeBytes} bytes`);
        
        // Update the document
        doc.pageCount = pageCount;
        if (!doc.fileSizeBytes) {
          doc.fileSizeBytes = fileSizeBytes;
        }
        await doc.save();
        
        console.log(`Updated document ${doc._id}`);
        
        // Clean up temp file
        fs.unlinkSync(tempFilePath);
      } catch (error) {
        console.error(`Error processing document ${doc._id}:`, error);
      }
    }
    
    console.log('Document metadata update completed');
  } catch (error) {
    console.error('Failed to update document metadata:', error);
  } finally {
    // Disconnect from MongoDB
    await mongoose.disconnect();
    console.log('Disconnected from MongoDB');
  }
}

// Run the update function
updateDocumentMetadata(); 