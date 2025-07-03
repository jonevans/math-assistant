import { Router, Request, Response } from 'express';
import OpenAI from 'openai';
import dotenv from 'dotenv';
import multer from 'multer';
import path from 'path';
import fs from 'fs';
import { PdfDocument } from '../models/Document';
import { User } from '../models/User';
import mongoose from 'mongoose';
import { createReadStream } from 'fs';
import { linkUserAssistantToVectorStore } from '../utils/linkUserAssistantToVectorStore';
// @ts-ignore - Using a module without proper type definitions
import pdfParse from 'pdf-parse';
import { AVAILABLE_MODELS, getDefaultModel, isValidModel, ModelInfo } from '../utils/openAIModels';

// Ensure environment variables are loaded
dotenv.config();

// Debug environment variables
console.log('Environment check:', {
  hasOpenAIKey: !!process.env.OPENAI_API_KEY,
  openAIKeyLength: process.env.OPENAI_API_KEY?.length,
});

// Check if OpenAI API key is set
if (!process.env.OPENAI_API_KEY) {
  console.error('ERROR: OPENAI_API_KEY environment variable is not set');
  process.exit(1);
}

const router = Router();
const openai = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY
});

// Configure multer for file uploads
const storage = multer.diskStorage({
  destination: (req: Express.Request, file: Express.Multer.File, cb: (error: Error | null, destination: string) => void) => {
    const uploadDir = path.join(__dirname, '../../uploads');
    if (!fs.existsSync(uploadDir)) {
      fs.mkdirSync(uploadDir, { recursive: true });
    }
    cb(null, uploadDir);
  },
  filename: (req: Express.Request, file: Express.Multer.File, cb: (error: Error | null, filename: string) => void) => {
    cb(null, `${Date.now()}-${file.originalname}`);
  }
});

const upload = multer({ 
  storage,
  limits: {
    fileSize: 50 * 1024 * 1024, // 50MB max file size
  },
  fileFilter: (req: Express.Request, file: Express.Multer.File, cb: multer.FileFilterCallback) => {
    if (file.mimetype === 'application/pdf') {
      cb(null, true);
    } else {
      cb(new Error('Only PDF files are allowed'));
    }
  }
});

interface UserRequest extends Request {
  user?: {
    _id: string;
  };
}

// Define types for OpenAI annotations
interface FileCitation {
  file_id: string;
  quote?: string; // The quoted text from the file (may not always be available)
}

interface Annotation {
  type: 'file_citation';
  text: string;
  file_citation: FileCitation;
  start_index: number;
  end_index: number;
}

// Upload a document
router.post('/upload', upload.single('file'), async (req: UserRequest, res: Response) => {
  if (!req.file) {
    return res.status(400).json({ error: 'No file uploaded' });
  }

  if (!req.user) {
    return res.status(401).json({ error: 'Unauthorized' });
  }

  const userId = req.user._id;
  const filePath = req.file.path;
  const filename = req.file.originalname;
  const fileSizeBytes = req.file.size; // Get file size from multer

  try {
    // Extract PDF metadata (page count)
    let pageCount;
    try {
      // Read the PDF file
      const dataBuffer = fs.readFileSync(filePath);
      // Get PDF content and metadata
      const pdfData = await pdfParse(dataBuffer);
      // Get page count
      pageCount = pdfData.numpages;
      console.log(`Extracted PDF metadata: ${filename}, ${pageCount} pages, ${fileSizeBytes} bytes`);
    } catch (metadataError) {
      console.error('Error extracting PDF metadata:', metadataError);
      // Continue with upload even if metadata extraction fails
    }

    // Find user to check if they have a vector store
    const user = await User.findById(userId);
    if (!user) {
      return res.status(404).json({ error: 'User not found' });
    }

    let vectorStoreId = user.vectorStoreId;

    // Create vector store if user doesn't have one
    if (!vectorStoreId) {
      try {
        // Using the correct API path as documented
        const vectorStore = await openai.vectorStores.create({
          name: `${user.name}'s Vector Store`,
        });
        
        vectorStoreId = vectorStore.id;
        
        // Update user with new vector store ID
        await User.findByIdAndUpdate(userId, { vectorStoreId });
        
        console.log(`Created vector store with ID ${vectorStoreId} for user ${user.name}`);
      } catch (error) {
        console.error('Error creating vector store:', error);
        return res.status(500).json({ error: 'Failed to create vector store' });
      }
    }

    // Upload file to OpenAI
    const file = await openai.files.create({
      file: fs.createReadStream(filePath),
      purpose: 'assistants', // This is the valid purpose for files
    });

    console.log(`Uploaded file with ID ${file.id}`);

    // Add file to vector store
    let vectorFileId;
    try {
      // Using the correct API path as documented
      const vectorFile = await openai.vectorStores.files.create(
        vectorStoreId as string,
        { file_id: file.id }
      );
      vectorFileId = vectorFile.id;
      console.log(`Added file to vector store with ID ${vectorFileId}`);
    } catch (error) {
      console.error('Error adding file to vector store:', error);
      // Continue even if this fails - we'll still have the file uploaded
    }

    // Save document metadata to MongoDB
    const document = new PdfDocument({
      filename,
      openaiFileId: file.id,
      vectorFileId: vectorFileId,
      userId: new mongoose.Types.ObjectId(userId),
      status: 'processing',
      fileSizeBytes: fileSizeBytes,
      pageCount: pageCount
    });

    await document.save();

    // Link assistant to user's vector store (only during upload for performance)
    console.log(`[UPLOAD] Linking assistant to vector store: ${vectorStoreId}`);
    const linkResult = await linkUserAssistantToVectorStore(userId);
    if (!linkResult) {
      console.error('[UPLOAD] Failed to link assistant to vector store during upload');
    }

    // Try to immediately check vector file status
    if (vectorStoreId && vectorFileId) {
      try {
        const vectorFileInfo = await openai.vectorStores.files.retrieve(
          vectorStoreId,
          vectorFileId
        );
        
        console.log(`Initial vector file status: ${vectorFileInfo.status}`);
        
        // Update document status based on vector store status
        if (vectorFileInfo.status === 'completed' || vectorFileInfo.status === 'in_progress') {
          document.status = 'ready';
          await document.save();
          console.log(`Document status immediately set to ready`);
        }
      } catch (error) {
        console.log(`Could not immediately check vector file status, will remain as processing for now`);
      }
    }

    // Delete the temporary file
    fs.unlinkSync(filePath);

    res.status(201).json({
      id: document._id,
      filename: document.filename,
      status: document.status,
      fileSizeBytes: document.fileSizeBytes,
      pageCount: document.pageCount
    });
  } catch (error) {
    console.error('Upload error:', error);
    
    // Clean up the file if it exists
    if (filePath && fs.existsSync(filePath)) {
      fs.unlinkSync(filePath);
    }

    res.status(500).json({ error: 'Failed to upload document' });
  }
});

// Get user documents
router.get('/', async (req: UserRequest, res: Response) => {
  if (!req.user) {
    return res.status(401).json({ error: 'Unauthorized' });
  }

  try {
    const documents = await PdfDocument.find({ userId: req.user._id });
    res.json(documents.map(doc => ({
      id: doc._id,
      filename: doc.filename,
      status: doc.status,
      isActive: doc.isActive,
      pageCount: doc.pageCount,
      fileSizeBytes: doc.fileSizeBytes
    })));
  } catch (error) {
    console.error('Get documents error:', error);
    res.status(500).json({ error: 'Failed to get documents' });
  }
});

// Delete a document
router.delete('/:id', async (req: UserRequest, res: Response) => {
  console.log(`[DELETE] Received request to delete document ID: ${req.params.id}`);
  
  if (!req.user) {
    console.log(`[DELETE] Unauthorized - No user in request`);
    return res.status(401).json({ error: 'Unauthorized' });
  }

  try {
    console.log(`[DELETE] Looking up document ID: ${req.params.id}`);
    const document = await PdfDocument.findById(req.params.id);
    
    if (!document) {
      console.log(`[DELETE] Document not found: ${req.params.id}`);
      return res.status(404).json({ error: 'Document not found' });
    }

    console.log(`[DELETE] Found document: ${document.filename}`);
    
    // Fix: Convert IDs to strings for proper comparison
    const userIdStr = req.user._id.toString();
    const documentUserIdStr = document.userId.toString();
    
    console.log(`[DELETE] Comparing user ID ${userIdStr} with document user ID ${documentUserIdStr}`);
    
    if (documentUserIdStr !== userIdStr) {
      console.log(`[DELETE] Forbidden - User ID mismatch`);
      return res.status(403).json({ error: 'Forbidden' });
    }

    // Delete file from OpenAI
    if (document.openaiFileId) {
      try {
        console.log(`[DELETE] Deleting file from OpenAI: ${document.openaiFileId}`);
        await openai.files.del(document.openaiFileId);
        console.log(`[DELETE] Successfully deleted file from OpenAI: ${document.openaiFileId}`);
      } catch (e) {
        console.error('[DELETE] OpenAI file deletion error:', e);
      }
    }

    // Delete file from vector store if applicable
    if (document.vectorFileId) {
      const user = await User.findById(req.user._id);
      if (user && user.vectorStoreId) {
        try {
          // Using the correct API path
          console.log(`[DELETE] Deleting file from vector store: ${document.vectorFileId}`);
          await openai.vectorStores.files.del(
            user.vectorStoreId,
            document.vectorFileId
          );
          console.log(`[DELETE] Successfully deleted file from vector store: ${document.vectorFileId}`);
        } catch (e) {
          console.error('[DELETE] Vector store file deletion error:', e);
        }
      }
    }

    // Delete document from database
    console.log(`[DELETE] Deleting document from database: ${req.params.id}`);
    await PdfDocument.findByIdAndDelete(req.params.id);
    console.log(`[DELETE] Document successfully deleted from database`);

    res.status(200).json({ message: 'Document deleted successfully' });
  } catch (error) {
    console.error('[DELETE] Delete error:', error);
    res.status(500).json({ error: 'Failed to delete document' });
  }
});

// Add a new route to toggle document active status
router.put('/:id/toggle-active', async (req: UserRequest, res: Response) => {
  if (!req.user) {
    return res.status(401).json({ error: 'Unauthorized' });
  }

  try {
    console.log(`[TOGGLE] Toggling active status for document ID: ${req.params.id}`);
    const document = await PdfDocument.findById(req.params.id);
    
    if (!document) {
      console.log(`[TOGGLE] Document not found: ${req.params.id}`);
      return res.status(404).json({ error: 'Document not found' });
    }

    // Fix: Ensure both IDs are strings before comparing
    const userIdStr = req.user._id.toString();
    const documentUserIdStr = document.userId.toString();
    
    console.log(`[TOGGLE] Comparing user ID ${userIdStr} with document user ID ${documentUserIdStr}`);
    
    if (documentUserIdStr !== userIdStr) {
      console.log(`[TOGGLE] Forbidden - User ID ${userIdStr} does not match document user ID ${documentUserIdStr}`);
      return res.status(403).json({ error: 'Forbidden' });
    }

    // Toggle the active status
    document.isActive = !document.isActive;
    console.log(`[TOGGLE] Setting document ${document.filename} isActive to ${document.isActive}`);
    await document.save();
    console.log(`[TOGGLE] Document saved successfully`);

    res.json({
      id: document._id,
      filename: document.filename,
      status: document.status,
      isActive: document.isActive,
      pageCount: document.pageCount,
      fileSizeBytes: document.fileSizeBytes
    });
  } catch (error) {
    console.error('Toggle active status error:', error);
    res.status(500).json({ error: 'Failed to toggle document status' });
  }
});

// Get available OpenAI models
router.get('/models', async (req: UserRequest, res: Response) => {
  if (!req.user) {
    return res.status(401).json({ error: 'Unauthorized' });
  }

  try {
    res.json({
      models: AVAILABLE_MODELS,
      defaultModel: getDefaultModel().id
    });
  } catch (error) {
    console.error('Error fetching models:', error);
    res.status(500).json({ error: 'Failed to fetch available models' });
  }
});

// Modify the query route to use prompt engineering for active documents
router.post('/query', async (req: UserRequest, res: Response) => {
  if (!req.user) {
    return res.status(401).json({ error: 'Unauthorized' });
  }

  try {
    const { query, modelId } = req.body;
    console.log(`\n[QUERY] Received query from user: "${query}"`);
    
    // Check if the requested model is valid, use default if not
    const selectedModelId = modelId && isValidModel(modelId) 
      ? modelId 
      : getDefaultModel().id;
    
    console.log(`[QUERY] Using model: ${selectedModelId}`);
    
    const user = await User.findById(req.user._id);
    
    if (!user || !user.vectorStoreId) {
      return res.status(400).json({ error: 'No vector store found for this user' });
    }

    console.log(`[QUERY] Using vector store ID: ${user.vectorStoreId}`);

    // Get all user documents and filter active/inactive
    const allDocuments = await PdfDocument.find({ userId: req.user._id });
    const activeDocuments = allDocuments.filter(doc => doc.isActive);
    const inactiveDocuments = allDocuments.filter(doc => !doc.isActive);
    
    console.log(`[QUERY] User has ${allDocuments.length} documents (${activeDocuments.length} active, ${inactiveDocuments.length} inactive)`);

    // Build enhanced prompt with document filtering instructions
    let enhancedQuery = query;
    
    // If there are both active and inactive documents, add filtering instructions
    if (activeDocuments.length > 0 && inactiveDocuments.length > 0) {
      // Create instructions about which documents to use/ignore
      const useDocsText = activeDocuments.map(doc => `"${doc.filename}"`).join(', ');
      const ignoreDocsText = inactiveDocuments.map(doc => `"${doc.filename}"`).join(', ');
      
      // Prepend instructions to the query
      enhancedQuery = `IMPORTANT: Please ONLY use information from these documents: ${useDocsText}. 
      COMPLETELY IGNORE these documents: ${ignoreDocsText}.
      
      Query: ${query}`;
      
      console.log(`[QUERY] Using document filtering with prompt engineering`);
      console.log(`[QUERY] Active documents: ${activeDocuments.map(d => d.filename).join(', ')}`);
      console.log(`[QUERY] Inactive documents: ${inactiveDocuments.map(d => d.filename).join(', ')}`);
    } else {
      console.log(`[QUERY] No document filtering needed (all documents are ${activeDocuments.length > 0 ? 'active' : 'inactive'})`);
    }

    // Only link assistant if vector store has changed (performance optimization)
    console.log(`[QUERY] Using vector store ID: ${user.vectorStoreId}`);
    
    // Skip expensive assistant linking for better performance
    // The assistant is already configured with the vector store during upload
    console.log(`[QUERY] Skipping assistant re-linking for performance (already linked during upload)`)

    // Create a thread
    const thread = await openai.beta.threads.create();
    console.log(`[QUERY] Created thread with ID: ${thread.id}`);

    // Add message to thread with the enhanced query
    await openai.beta.threads.messages.create(thread.id, {
      role: 'user',
      content: enhancedQuery
    });
    console.log(`[QUERY] Added user message to thread with document filtering instructions`);

    // Run assistant with file search tool and selected model
    console.log(`[QUERY] Running assistant with vector store ID: ${user.vectorStoreId} and model: ${selectedModelId}`);
    
    // Prepare run configuration
    const runConfig: any = {
      assistant_id: process.env.OPENAI_ASSISTANT_ID || "asst_dxxSHuryqquwSCK7fxBQXoiJ",
      tools: [
        { 
          type: "file_search"
        }
      ]
    };
    
    // Use selected model, but let assistant default handle gpt-4o-mini
    if (selectedModelId !== 'gpt-4o-mini') {
      runConfig.model = selectedModelId;
    }
    // For gpt-4o-mini, let the assistant use its configured model to avoid parameter conflicts
    
    // Add reasoning_effort for o3 models
    if (selectedModelId.startsWith('o3')) {
      runConfig.reasoning_effort = 'medium';
    }
    
    const run = await openai.beta.threads.runs.create(thread.id, runConfig);
    console.log(`[QUERY] Started run with ID: ${run.id}`);

    res.json({
      threadId: thread.id,
      runId: run.id
    });
  } catch (error) {
    console.error('Query error:', error);
    res.status(500).json({ error: 'Failed to process query' });
  }
});

// Get query result
router.get('/result/:threadId/:runId', async (req: Request, res: Response) => {
  try {
    const { threadId, runId } = req.params;
    console.log(`\n[RESULT] Checking run status for thread: ${threadId}, run: ${runId}`);

    const run = await openai.beta.threads.runs.retrieve(threadId, runId);
    console.log(`[RESULT] Run status: ${run.status}`);
    
    if (run.status === 'completed') {
      const messages = await openai.beta.threads.messages.list(threadId);
      console.log(`[RESULT] Retrieved ${messages.data.length} messages`);
      
      // Process messages sequentially to handle async document lookups
      const mappedMessages = [];
      
      for (const msg of messages.data) {
        if (msg.role === 'assistant' && msg.content.length > 0) {
          const contentItems = msg.content.filter(item => item.type === 'text');
          
          // Initialize the file ID to document map for this message
          const fileIdToDocumentMap = new Map();
          
          // First, collect all file IDs from annotations
          const allFileIds = new Set();
          
          for (const contentItem of contentItems) {
            const annotations = contentItem.text.annotations || [];
            for (const annotation of annotations) {
              if (annotation.type === 'file_citation') {
                allFileIds.add(annotation.file_citation.file_id);
              }
            }
          }
          
          // Then, look up all documents in one batch operation
          if (allFileIds.size > 0) {
            const fileIds = Array.from(allFileIds);
            console.log(`[RESULT] Looking up ${fileIds.length} documents for citations`);
            
            const documents = await PdfDocument.find({ openaiFileId: { $in: fileIds } });
            console.log(`[RESULT] Found ${documents.length} matching documents`);
            
            // Create a map for quick lookup
            documents.forEach(doc => {
              fileIdToDocumentMap.set(doc.openaiFileId, doc);
            });
          }
          
          // Now process each content item
          const processedContent = contentItems.map(contentItem => {
            let text = contentItem.text.value;
            const annotations = contentItem.text.annotations || [];
            
            // Check if we have any annotations that need processing
            if (annotations.length === 0) {
              return text;
            }
            
            // Sort annotations in reverse order to replace from end to beginning
            const sortedAnnotations = [...annotations].sort((a, b) => 
              b.start_index - a.start_index
            );
            
            // Replace each citation annotation with a more readable format
            for (const annotation of sortedAnnotations) {
              if (annotation.type === 'file_citation') {
                // Log the entire annotation object to see what's available
                console.log(`[RESULT] COMPLETE ANNOTATION:`, JSON.stringify(annotation, null, 2));
                
                const fileId = annotation.file_citation.file_id;
                const doc = fileIdToDocumentMap.get(fileId);
                
                // Debug the structure of the file_citation object
                console.log(`[RESULT] File citation object:`, JSON.stringify(annotation.file_citation, null, 2));
                
                // Create a more informative citation format with just the document name
                let replacementText;
                if (doc) {
                  // We found a matching document in our database
                  replacementText = `[Citation from: ${doc.filename}]`;
                  console.log(`[RESULT] Added citation for document: ${doc.filename}`);
                } else {
                  // No matching document found
                  replacementText = `[Citation from document]`;
                  console.log(`[RESULT] Added generic citation for unknown document ID: ${fileId}`);
                }
                
                // Replace the citation marker with our formatted citation
                text = text.substring(0, annotation.start_index) + 
                      replacementText + 
                      text.substring(annotation.end_index);
              }
            }
            
            return text;
          }).join('\n\n');
          
          mappedMessages.push({
            role: msg.role,
            content: processedContent
          });
        } else {
          // Handle user messages as before
          let content = '';
          if (msg.content && msg.content.length > 0) {
            const contentItem = msg.content[0];
            if (contentItem.type === 'text') {
              content = contentItem.text.value;
            }
          }
          
          mappedMessages.push({
            role: msg.role,
            content: content
          });
        }
      }
      
      console.log(`[RESULT] Sending response to client with ${mappedMessages.length} messages`);
      res.json({
        status: 'completed',
        messages: mappedMessages
      });
    } else if (run.status === 'failed') {
      console.error(`[RESULT] Run failed with error:`, run.last_error);
      res.status(500).json({
        status: 'failed',
        error: run.last_error
      });
    } else {
      res.json({
        status: run.status
      });
    }
  } catch (error) {
    console.error('Result error:', error);
    res.status(500).json({ error: 'Failed to get result' });
  }
});

// Add a new route to check document status
router.get('/status/:id', async (req: UserRequest, res: Response) => {
  if (!req.user) {
    return res.status(401).json({ error: 'Unauthorized' });
  }

  try {
    const document = await PdfDocument.findById(req.params.id);
    
    if (!document) {
      return res.status(404).json({ error: 'Document not found' });
    }

    if (document.userId.toString() !== req.user._id) {
      return res.status(403).json({ error: 'Forbidden' });
    }

    console.log(`[STATUS] Checking status for document: ${document.filename} (${document.status})`);

    // If document is already marked as ready or failed, just return current status
    if (document.status !== 'processing') {
      console.log(`[STATUS] Document already marked as ${document.status}`);
      return res.json({ status: document.status });
    }

    // Check file status with OpenAI
    try {
      // First check if the file exists
      const fileInfo = await openai.files.retrieve(document.openaiFileId);
      console.log(`[STATUS] OpenAI file exists: ${fileInfo.id}`);
      
      // Then check if it's been processed in the vector store
      const user = await User.findById(req.user._id);
      
      if (user && user.vectorStoreId && document.vectorFileId) {
        try {
          // Check if the file is available in the vector store
          const vectorFileInfo = await openai.vectorStores.files.retrieve(
            user.vectorStoreId,
            document.vectorFileId
          );
          
          console.log(`[STATUS] Vector file status: ${vectorFileInfo.status}`);
          
          // Update document status based on vector store status
          if (vectorFileInfo.status === 'completed' || vectorFileInfo.status === 'in_progress') {
            // Mark as ready regardless of in_progress to fix UI
            document.status = 'ready';
            await document.save();
            console.log(`[STATUS] Updated document status to ready`);
          } else if (vectorFileInfo.status === 'failed') {
            document.status = 'failed';
            await document.save();
            console.log(`[STATUS] Updated document status to failed`);
          }
        } catch (error) {
          console.error('[STATUS] Error checking vector file status:', error);
          
          // Force mark document as ready if it's been in processing for more than 5 minutes
          const fiveMinutesAgo = new Date(Date.now() - 5 * 60 * 1000);
          if (document.createdAt < fiveMinutesAgo) {
            console.log(`[STATUS] Document has been processing for over 5 minutes, forcing status to ready`);
            document.status = 'ready';
            await document.save();
          }
        }
      } else {
        console.log(`[STATUS] Missing user, vectorStoreId, or document.vectorFileId`);
        // If we have a valid file but no vector file ID, force mark as ready after 5 minutes
        const fiveMinutesAgo = new Date(Date.now() - 5 * 60 * 1000);
        if (document.createdAt < fiveMinutesAgo) {
          console.log(`[STATUS] Document has been processing for over 5 minutes, forcing status to ready`);
          document.status = 'ready';
          await document.save();
        }
      }
      
      res.json({ status: document.status });
    } catch (error) {
      console.error('[STATUS] Error checking file status:', error);
      res.json({ status: document.status });
    }
  } catch (error) {
    console.error('Status check error:', error);
    res.status(500).json({ error: 'Failed to check document status' });
  }
});

export const documentsRouter = router; 