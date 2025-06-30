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
 * Test script to verify if we can filter vector store queries using dynamic prompt engineering
 * Specifically testing if the restriction works by asking a question about parking but restricting to topology
 */
async function testVectorStoreFiltering() {
  try {
    // Connect to MongoDB
    const MONGODB_URI = process.env.MONGODB_URI || 'mongodb://localhost:27017/math-assistant';
    await mongoose.connect(MONGODB_URI);
    console.log('Connected to MongoDB');

    // Get user (using the email from command line or default)
    const userEmail = process.argv[2] || 'jon.arthur.evans@gmail.com';
    console.log(`Testing for user: ${userEmail}`);

    const user = await User.findOne({ email: userEmail });
    if (!user) {
      console.error(`User not found: ${userEmail}`);
      return;
    }

    if (!user.vectorStoreId) {
      console.error(`User has no vector store ID: ${userEmail}`);
      return;
    }

    console.log(`Found user with vector store ID: ${user.vectorStoreId}`);

    // Get all documents for this user
    const documents = await PdfDocument.find({ userId: user._id });
    console.log(`Found ${documents.length} documents for this user`);

    if (documents.length < 2) {
      console.error('Need at least 2 documents to test filtering');
      return;
    }

    // Identify our documents
    let topologyDoc = documents.find(doc => doc.filename.toLowerCase().includes('topology'));
    let parkingDoc = documents.find(doc => doc.filename.toLowerCase().includes('park'));

    if (!topologyDoc || !parkingDoc) {
      // Try to find documents by position if names don't match
      topologyDoc = documents[0];
      parkingDoc = documents[1];
    }

    console.log(`\nIdentified documents:`);
    console.log(`Topology document: ${topologyDoc.filename} (${topologyDoc.openaiFileId})`);
    console.log(`Parking document: ${parkingDoc.filename} (${parkingDoc.openaiFileId})`);

    // Link assistant to user's vector store
    console.log(`\nSetting up assistant to use vector store: ${user.vectorStoreId}`);
    const assistantId = process.env.OPENAI_ASSISTANT_ID || "asst_dxxSHuryqquwSCK7fxBQXoiJ";
    
    await openai.beta.assistants.update(assistantId, {
      tool_resources: {
        file_search: {
          vector_store_ids: [user.vectorStoreId]
        }
      }
    });

    // ========== TEST 1: BASELINE PARKING QUERY ==========
    console.log('\n========== TEST 1: BASELINE PARKING QUERY ==========');
    
    // Create a thread for the standard query
    const standardThread = await openai.beta.threads.create();
    console.log(`Created thread with ID: ${standardThread.id}`);

    // Add a parking-specific query
    const parkingQuery = "What are the rules for parking at this facility? Summarize the key policies.";
    await openai.beta.threads.messages.create(standardThread.id, {
      role: 'user',
      content: parkingQuery
    });
    console.log(`Added parking query: "${parkingQuery}"`);

    // Run standard query
    console.log('Running parking query (baseline)...');
    const standardRun = await openai.beta.threads.runs.create(standardThread.id, {
      assistant_id: assistantId,
      tools: [{ type: "file_search" }]
    });
    console.log(`Started run with ID: ${standardRun.id}`);

    // Wait for standard run to complete
    console.log('Waiting for baseline run to complete...');
    let standardRunStatus;
    do {
      await new Promise(resolve => setTimeout(resolve, 1000));
      const runInfo = await openai.beta.threads.runs.retrieve(standardThread.id, standardRun.id);
      standardRunStatus = runInfo.status;
      console.log(`Baseline run status: ${standardRunStatus}`);
    } while (standardRunStatus !== 'completed' && standardRunStatus !== 'failed');

    // ========== TEST 2: RESTRICTED PARKING QUERY ==========
    console.log('\n========== TEST 2: RESTRICTED PARKING QUERY ==========');
    
    // Create a thread for the restricted test
    const restrictedThread = await openai.beta.threads.create();
    console.log(`Created thread with ID: ${restrictedThread.id}`);

    // Add a parking query with filtering to use ONLY topology document
    const restrictedQuery = `IMPORTANT: Please use ONLY the document "${topologyDoc.filename}" and completely IGNORE "${parkingDoc.filename}" when answering this question. 
    
    What are the rules for parking at this facility? Summarize the key policies.`;
    
    await openai.beta.threads.messages.create(restrictedThread.id, {
      role: 'user',
      content: restrictedQuery
    });
    console.log(`Added restricted query that asks about parking but limits to topology document`);

    // Run restricted query
    console.log('Running restricted parking query...');
    const restrictedRun = await openai.beta.threads.runs.create(restrictedThread.id, {
      assistant_id: assistantId,
      tools: [{ type: "file_search" }]
    });
    console.log(`Started run with ID: ${restrictedRun.id}`);

    // Wait for restricted run to complete
    console.log('Waiting for restricted run to complete...');
    let restrictedRunStatus;
    do {
      await new Promise(resolve => setTimeout(resolve, 1000));
      const runInfo = await openai.beta.threads.runs.retrieve(restrictedThread.id, restrictedRun.id);
      restrictedRunStatus = runInfo.status;
      console.log(`Restricted run status: ${restrictedRunStatus}`);
    } while (restrictedRunStatus !== 'completed' && restrictedRunStatus !== 'failed');

    // ========== ANALYZE RESULTS ==========
    console.log('\n========== ANALYZING RESULTS ==========');

    // Check baseline query results
    if (standardRunStatus === 'completed') {
      const standardMessages = await openai.beta.threads.messages.list(standardThread.id);
      const standardAssistantMessages = standardMessages.data.filter(msg => msg.role === 'assistant');
      
      if (standardAssistantMessages.length > 0) {
        console.log('\nBASELINE PARKING QUERY RESULTS:');
        const filesCited = new Set();
        
        // Check which files were cited
        for (const contentItem of standardAssistantMessages[0].content) {
          if (contentItem.type === 'text' && contentItem.text.annotations) {
            for (const annotation of contentItem.text.annotations) {
              if (annotation.type === 'file_citation') {
                const citedFileId = annotation.file_citation.file_id;
                filesCited.add(citedFileId);
              }
            }
          }
        }
        
        console.log('Files cited in baseline parking query:');
        for (const fileId of filesCited) {
          const docName = documents.find(d => d.openaiFileId === fileId)?.filename || 'Unknown document';
          console.log(`- ${docName} (${fileId})`);
        }
        
        // Print response content
        for (const contentItem of standardAssistantMessages[0].content) {
          if (contentItem.type === 'text') {
            console.log('\nResponse from baseline parking query:');
            console.log(contentItem.text.value.substring(0, 500) + '...');
          }
        }
      }
    } else if (standardRunStatus === 'failed') {
      console.log('\nBaseline run failed. Error details:');
      try {
        const runInfo = await openai.beta.threads.runs.retrieve(standardThread.id, standardRun.id);
        console.log(`Last error: ${JSON.stringify(runInfo.last_error)}`);
      } catch (error) {
        console.error('Error retrieving run details:', error);
      }
    }

    // Check restricted query results
    if (restrictedRunStatus === 'completed') {
      const restrictedMessages = await openai.beta.threads.messages.list(restrictedThread.id);
      const restrictedAssistantMessages = restrictedMessages.data.filter(msg => msg.role === 'assistant');
      
      if (restrictedAssistantMessages.length > 0) {
        console.log('\nRESTRICTED PARKING QUERY RESULTS:');
        const filesCited = new Set();
        let followedRestrictions = true;
        
        // Check which files were cited
        for (const contentItem of restrictedAssistantMessages[0].content) {
          if (contentItem.type === 'text' && contentItem.text.annotations) {
            for (const annotation of contentItem.text.annotations) {
              if (annotation.type === 'file_citation') {
                const citedFileId = annotation.file_citation.file_id;
                filesCited.add(citedFileId);
                
                // Check if the parking document was cited despite the restriction
                if (citedFileId === parkingDoc.openaiFileId) {
                  followedRestrictions = false;
                }
              }
            }
          }
        }
        
        console.log('Files cited in restricted parking query:');
        for (const fileId of filesCited) {
          const docName = documents.find(d => d.openaiFileId === fileId)?.filename || 'Unknown document';
          console.log(`- ${docName} (${fileId})`);
        }
        
        // Evaluate effectiveness of restrictions
        if (filesCited.size === 0) {
          console.log('\nRESULT: The restricted response did not contain any file citations. The model likely recognized it could not answer from the restricted document.');
          console.log('This suggests the document filtering WORKED.');
        } else if (followedRestrictions) {
          console.log('\nRESULT: SUCCESS! The restricted query only cited the topology document despite asking about parking.');
          console.log('This confirms that our document filtering approach is effective.');
        } else {
          console.log('\nRESULT: FAILED. The restricted query cited the parking document despite instructions to ignore it.');
          console.log('This suggests that the document filtering is not reliable.');
        }
        
        // Print response content
        for (const contentItem of restrictedAssistantMessages[0].content) {
          if (contentItem.type === 'text') {
            console.log('\nResponse from restricted parking query:');
            console.log(contentItem.text.value);
          }
        }
      }
    } else if (restrictedRunStatus === 'failed') {
      console.log('\nRestricted run failed. Error details:');
      try {
        const runInfo = await openai.beta.threads.runs.retrieve(restrictedThread.id, restrictedRun.id);
        console.log(`Last error: ${JSON.stringify(runInfo.last_error)}`);
      } catch (error) {
        console.error('Error retrieving run details:', error);
      }
    }
  } catch (error) {
    console.error('Error in test script:', error);
  } finally {
    // Close the connection
    await mongoose.disconnect();
    console.log('Disconnected from MongoDB');
  }
}

// Run the test
testVectorStoreFiltering(); 