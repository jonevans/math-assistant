# Math Assistant Server

This is the backend API for the Math Assistant application.

## Document Metadata

The system now extracts and stores real metadata from PDF documents:

- Page count
- File size in bytes

### Updating existing documents with metadata

To update existing documents that don't have page count or file size information, run:

```bash
npm run update-metadata
```

This script will:
1. Find all documents without page count data
2. Download each PDF file from OpenAI's storage
3. Extract page count and file size information
4. Update the document records in MongoDB
5. Clean up temporary files

## Other Scripts

The server includes several utility scripts:

- `npm run link-assistant`: Link users to the OpenAI assistant
- `npm run update-status`: Update processing status of documents
- `npm run cleanup-orphaned`: Remove orphaned document records 