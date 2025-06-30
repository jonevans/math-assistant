import OpenAI from 'openai';
import { PdfDocument } from '../models/Document';
import { User } from '../models/User';
import dotenv from 'dotenv';

// Load environment variables
dotenv.config();

const openai = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY
});

/**
 * Updates the status of all documents that are in "processing" status
 */
export async function updateProcessingDocuments() {
  try {
    console.log('[BACKGROUND] Starting document status update check');
    
    // Find all documents in processing status
    const processingDocuments = await PdfDocument.find({ status: 'processing' });
    
    if (processingDocuments.length === 0) {
      console.log('[BACKGROUND] No documents in processing status');
      return;
    }
    
    console.log(`[BACKGROUND] Found ${processingDocuments.length} documents in processing status`);
    
    for (const document of processingDocuments) {
      console.log(`[BACKGROUND] Checking document: ${document.filename} (ID: ${document._id})`);
      
      try {
        // First check if the file exists in OpenAI
        const fileInfo = await openai.files.retrieve(document.openaiFileId);
        console.log(`[BACKGROUND] OpenAI file exists: ${fileInfo.id}`);
        
        // Get the document's user to find their vector store
        const user = await User.findById(document.userId);
        
        if (user && user.vectorStoreId && document.vectorFileId) {
          try {
            // Check the file status in the vector store
            const vectorFileInfo = await openai.vectorStores.files.retrieve(
              user.vectorStoreId,
              document.vectorFileId
            );
            
            console.log(`[BACKGROUND] Vector file status: ${vectorFileInfo.status}`);
            
            // Update document status based on vector store status
            if (vectorFileInfo.status === 'completed' || vectorFileInfo.status === 'in_progress') {
              document.status = 'ready';
              await document.save();
              console.log(`[BACKGROUND] Updated document ${document._id} status to ready`);
            } else if (vectorFileInfo.status === 'failed') {
              document.status = 'failed';
              await document.save();
              console.log(`[BACKGROUND] Updated document ${document._id} status to failed`);
            }
          } catch (error) {
            console.error(`[BACKGROUND] Error checking vector file status:`, error);
            
            // Force mark document as ready if it's been in processing for more than 5 minutes
            const fiveMinutesAgo = new Date(Date.now() - 5 * 60 * 1000);
            if (document.createdAt < fiveMinutesAgo) {
              console.log(`[BACKGROUND] Document has been processing for over 5 minutes, forcing status to ready`);
              document.status = 'ready';
              await document.save();
            }
          }
        } else {
          console.log(`[BACKGROUND] Missing user, vectorStoreId, or document.vectorFileId`);
          
          // Force mark document as ready after 5 minutes
          const fiveMinutesAgo = new Date(Date.now() - 5 * 60 * 1000);
          if (document.createdAt < fiveMinutesAgo) {
            console.log(`[BACKGROUND] Document has been processing for over 5 minutes, forcing status to ready`);
            document.status = 'ready';
            await document.save();
          }
        }
      } catch (error) {
        console.error(`[BACKGROUND] Error checking document ${document._id}:`, error);
      }
    }
    
    console.log('[BACKGROUND] Completed document status update check');
  } catch (error) {
    console.error('[BACKGROUND] Error in updateProcessingDocuments:', error);
  }
}

/**
 * Starts the background job to periodically update document statuses
 * @param intervalMinutes How often to run the job, in minutes
 */
export function startDocumentStatusUpdater(intervalMinutes = 1) {
  // Run immediately on startup
  updateProcessingDocuments();
  
  // Then schedule to run periodically
  const intervalMs = intervalMinutes * 60 * 1000;
  const interval = setInterval(updateProcessingDocuments, intervalMs);
  
  console.log(`[BACKGROUND] Document status updater scheduled to run every ${intervalMinutes} minute(s)`);
  
  return interval;
} 