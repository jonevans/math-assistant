import React, { useState, useEffect, useCallback } from 'react';
import {
  Box,
  Grid,
  Paper,
  Typography,
  List,
  ListItem,
  ListItemText,
  ListItemSecondaryAction,
  IconButton,
  TextField,
  Button,
  CircularProgress,
  Switch,
  Card,
  CardContent,
  Divider,
  Tooltip,
  MenuItem,
  FormControl,
  InputLabel,
  Select,
  SelectChangeEvent,
} from '@mui/material';
import { Delete as DeleteIcon, Send as SendIcon, FileCopy as DocumentIcon } from '@mui/icons-material';
import { useDropzone } from 'react-dropzone';
import axios from 'axios';
import ReactMarkdown from 'react-markdown';

interface Message {
  role: 'user' | 'assistant';
  content: string;
}

interface Document {
  id: string;
  filename: string;
  status: 'processing' | 'ready' | 'failed';
  isActive: boolean;
  pageCount?: number;
  fileSizeBytes?: number;
}

// Add model interface
interface Model {
  id: string;
  name: string;
  description: string;
  capabilities: string[];
  contextWindow: number;
  cost: string;
  isDefault?: boolean;
  available?: boolean;
}

// Add a new component for the typing indicator
const TypingIndicator = () => (
  <Box
    sx={{
      maxWidth: '85%',
      alignSelf: 'flex-start',
      mt: 1
    }}
  >
    <Box
      sx={{
        position: 'relative',
        p: 2,
        bgcolor: 'grey.100',
        borderRadius: 2,
        borderTopLeftRadius: 0,
        display: 'flex',
        gap: 1,
        alignItems: 'center',
        boxShadow: '0 1px 2px rgba(0,0,0,0.1)',
        '&::before': {
          content: '""',
          position: 'absolute',
          top: 0,
          left: -8,
          borderRight: '8px solid',
          borderRightColor: 'grey.100',
          borderTop: '8px solid transparent',
        }
      }}
    >
      <Box sx={{ display: 'flex', gap: 0.5, alignItems: 'center' }}>
        {[0, 1, 2].map((dot) => (
          <Box
            key={dot}
            sx={{
              width: 8,
              height: 8,
              borderRadius: '50%',
              backgroundColor: 'text.secondary',
              opacity: 0.5,
              animation: 'bouncingDot 1.4s infinite',
              animationDelay: `${dot * 0.2}s`,
              '@keyframes bouncingDot': {
                '0%, 100%': {
                  transform: 'translateY(0)',
                },
                '50%': {
                  transform: 'translateY(-4px)',
                  opacity: 0.8,
                }
              }
            }}
          />
        ))}
      </Box>
      <Typography variant="body2" color="text.secondary">
        Assistant is typing...
      </Typography>
    </Box>
  </Box>
);

// Add a new component to format message content with citations and markdown
const FormattedMessageContent = ({ content }: { content: string }) => {
  // Direct approach - find and replace citation markers directly with React components
  const parts: React.ReactNode[] = [];
  
  // Handle both citation formats
  const citationFromRegex = /\[Citation from: ([^\]]+)\]/g;
  const genericCitationRegex = /\[Citation from document\]/g;
  
  // Keep track of where we are in the text
  let lastIndex = 0;
  let match;
  
  // Process regular citations
  const contentCopy = content.slice(); // Create a copy to prevent regex index issues
  
  // Reset regexes
  citationFromRegex.lastIndex = 0;
  
  // First, find all citation markers and create an array of segments
  const segments: { 
    type: 'text' | 'citation';
    content: string;
    docName?: string;
    index: number;
  }[] = [];
  
  // Add all regular text
  segments.push({
    type: 'text',
    content,
    index: 0
  });
  
  // Process all citations with document names
  while ((match = citationFromRegex.exec(content)) !== null) {
    // Split the segment at this point
    const matchIndex = match.index;
    const matchLength = match[0].length;
    const docName = match[1];
    
    // Find which segment this match is in
    for (let i = 0; i < segments.length; i++) {
      const segment = segments[i];
      if (segment.type !== 'text') continue;
      
      const segmentStart = segment.index;
      const segmentEnd = segmentStart + segment.content.length;
      
      if (matchIndex >= segmentStart && matchIndex < segmentEnd) {
        // This match is in this segment, split it
        const beforeText = segment.content.substring(0, matchIndex - segmentStart);
        const afterText = segment.content.substring(matchIndex - segmentStart + matchLength);
        
        // Replace the current segment with three new ones
        segments.splice(
          i, 
          1, 
          { type: 'text', content: beforeText, index: segmentStart },
          { type: 'citation', content: match[0], docName, index: matchIndex },
          { type: 'text', content: afterText, index: matchIndex + matchLength }
        );
        
        // Since we modified the array, break and restart the loop
        break;
      }
    }
  }
  
  // Process generic citations
  genericCitationRegex.lastIndex = 0;
  while ((match = genericCitationRegex.exec(content)) !== null) {
    // Similar logic for generic citations
    const matchIndex = match.index;
    const matchLength = match[0].length;
    
    // Find which segment this match is in
    for (let i = 0; i < segments.length; i++) {
      const segment = segments[i];
      if (segment.type !== 'text') continue;
      
      const segmentStart = segment.index;
      const segmentEnd = segmentStart + segment.content.length;
      
      if (matchIndex >= segmentStart && matchIndex < segmentEnd) {
        // This match is in this segment, split it
        const beforeText = segment.content.substring(0, matchIndex - segmentStart);
        const afterText = segment.content.substring(matchIndex - segmentStart + matchLength);
        
        // Replace the current segment with three new ones
        segments.splice(
          i, 
          1, 
          { type: 'text', content: beforeText, index: segmentStart },
          { type: 'citation', content: match[0], index: matchIndex },
          { type: 'text', content: afterText, index: matchIndex + matchLength }
        );
        
        // Since we modified the array, break and restart the loop
        break;
      }
    }
  }
  
  // Now render all segments
  return (
    <>
      {segments.filter(segment => segment.content.trim().length > 0).map((segment, i) => {
        if (segment.type === 'citation') {
          // Render a citation
          const docName = segment.docName || 'Document';
          
          return (
            <Tooltip
              key={`citation-${i}`}
              title={
                <Box sx={{ p: 1, maxWidth: 250 }}>
                  <Typography variant="body2" sx={{ fontWeight: 500, mb: 1 }}>
                    Referenced from: {docName}
                  </Typography>
                  <Typography variant="caption" color="text.secondary">
                    Information cited from this document.
                  </Typography>
                </Box>
              }
              arrow
              placement="top"
            >
              <Box
                component="span"
                sx={{
                  display: 'inline-flex',
                  alignItems: 'center',
                  backgroundColor: 'rgba(25, 118, 210, 0.1)',
                  color: 'primary.main',
                  fontWeight: 500,
                  borderRadius: 1,
                  px: 0.8,
                  py: 0.3,
                  mx: 0.5,
                  fontSize: '0.85em',
                  whiteSpace: 'nowrap',
                  cursor: 'help',
                }}
              >
                <DocumentIcon fontSize="small" sx={{ mr: 0.5, fontSize: '1em' }} />
                {docName}
              </Box>
            </Tooltip>
          );
        } else {
          // Render regular text
          return (
            <ReactMarkdown key={`text-${i}`}>
              {segment.content}
            </ReactMarkdown>
          );
        }
      })}
    </>
  );
};

const Home: React.FC = () => {
  const [documents, setDocuments] = useState<Document[]>([]);
  const [messages, setMessages] = useState<Message[]>([]);
  const [query, setQuery] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [isUploading, setIsUploading] = useState(false);
  const [uploadError, setUploadError] = useState<string | null>(null);
  const [storageQuota] = useState(500 * 1024 * 1024); // 500MB in bytes
  const messagesEndRef = React.useRef<HTMLDivElement>(null);
  
  // Add state for models
  const [availableModels, setAvailableModels] = useState<Model[]>([]);
  const [selectedModel, setSelectedModel] = useState<string>('');
  const [isLoadingModels, setIsLoadingModels] = useState(false);

  // Auto-scroll to bottom of messages
  const scrollToBottom = () => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  };

  // Scroll to bottom when messages change
  useEffect(() => {
    scrollToBottom();
  }, [messages]);

  useEffect(() => {
    // Fetch user's documents on component mount
    fetchDocuments();
    fetchAvailableModels();

    // Set up interval to check status of processing documents
    const statusInterval = setInterval(checkProcessingDocuments, 10000); // every 10 seconds

    // Cleanup interval on component unmount
    return () => clearInterval(statusInterval);
  }, []);

  const fetchDocuments = async () => {
    try {
      const response = await axios.get(
        `${process.env.REACT_APP_API_URL}/api/documents`
      );
      setDocuments(response.data);
    } catch (error) {
      console.error('Failed to fetch documents:', error);
    }
  };

  // Add function to fetch available models
  const fetchAvailableModels = async () => {
    try {
      setIsLoadingModels(true);
      const response = await axios.get(
        `${process.env.REACT_APP_API_URL}/api/documents/models`
      );
      setAvailableModels(response.data.models);
      setSelectedModel(response.data.defaultModel);
    } catch (error) {
      console.error('Failed to fetch available models:', error);
    } finally {
      setIsLoadingModels(false);
    }
  };

  // Add handler for model change
  const handleModelChange = (event: SelectChangeEvent) => {
    setSelectedModel(event.target.value);
  };

  // Check status of any documents that are still processing
  const checkProcessingDocuments = useCallback(async () => {
    const processingDocs = documents.filter(doc => doc.status === 'processing');
    
    if (processingDocs.length === 0) return;
    
    try {
      // Check each processing document
      const updatedDocs = [...documents];
      let hasUpdates = false;
      
      for (const doc of processingDocs) {
        const response = await axios.get(
          `${process.env.REACT_APP_API_URL}/api/documents/status/${doc.id}`
        );
        
        // If status has changed, update the document
        if (response.data.status !== doc.status) {
          const docIndex = updatedDocs.findIndex(d => d.id === doc.id);
          if (docIndex !== -1) {
            updatedDocs[docIndex] = {
              ...updatedDocs[docIndex],
              status: response.data.status
            };
            hasUpdates = true;
          }
        }
      }
      
      // Only update state if there were changes
      if (hasUpdates) {
        setDocuments(updatedDocs);
      }
    } catch (error) {
      console.error('Failed to check document status:', error);
    }
  }, [documents]);

  const { getRootProps, getInputProps } = useDropzone({
    accept: {
      'application/pdf': ['.pdf'],
    },
    onDrop: handleFileDrop,
    disabled: isUploading,
  });

  async function handleFileDrop(acceptedFiles: File[]) {
    const file = acceptedFiles[0];
    if (!file) return;

    setIsUploading(true);
    setUploadError(null);

    const formData = new FormData();
    formData.append('file', file);

    try {
      const response = await axios.post(
        `${process.env.REACT_APP_API_URL}/api/documents/upload`,
        formData,
        {
          headers: {
            'Content-Type': 'multipart/form-data',
          }
        }
      );
      setDocuments([...documents, response.data]);
    } catch (error: any) {
      console.error('Upload failed:', error);
      let errorMessage = 'Upload failed. Please try again.';
      
      if (error.response?.data?.error) {
        errorMessage = error.response.data.error;
      } else if (error.message?.includes('large') || error.response?.status === 413) {
        errorMessage = 'File is too large. Maximum file size is 50MB.';
      }
      
      setUploadError(errorMessage);
    } finally {
      setIsUploading(false);
    }
  }

  async function handleSendQuery() {
    if (!query.trim() || documents.length === 0) return;

    try {
      setIsLoading(true);
      
      // Add user message to chat
      const userMessage: Message = { role: 'user', content: query };
      setMessages([...messages, userMessage]);
      
      // Send query with selected model
      const response = await axios.post(
        `${process.env.REACT_APP_API_URL}/api/documents/query`,
        { 
          query,
          modelId: selectedModel 
        }
      );

      const { threadId, runId } = response.data;

      // Poll for result with exponential backoff and timeout
      const checkResult = async (attempt = 0) => {
        const maxAttempts = 60; // 5 minutes max wait time
        
        if (attempt >= maxAttempts) {
          console.error('Query timeout: Maximum polling attempts reached');
          setMessages(prev => [
            ...prev, 
            { role: 'assistant', content: 'Sorry, the request timed out. Please try again.' }
          ]);
          setIsLoading(false);
          return;
        }

        try {
          const resultResponse = await axios.get(
            `${process.env.REACT_APP_API_URL}/api/documents/result/${threadId}/${runId}`
          );

          if (resultResponse.data.status === 'completed') {
            const newMessages = resultResponse.data.messages;
            // Just add the assistant's response
            if (newMessages.length > 0) {
              const assistantMessage = newMessages.find((msg: any) => msg.role === 'assistant');
              if (assistantMessage) {
                setMessages(prev => [...prev, assistantMessage]);
              }
            }
            setIsLoading(false);
            setQuery('');
          } else if (resultResponse.data.status === 'failed') {
            console.error('Query failed:', resultResponse.data.error);
            setMessages(prev => [
              ...prev, 
              { role: 'assistant', content: 'Sorry, I encountered an error processing your request.' }
            ]);
            setIsLoading(false);
          } else {
            // Continue polling with exponential backoff (max 5 seconds)
            const delay = Math.min(1000 + (attempt * 200), 5000);
            setTimeout(() => checkResult(attempt + 1), delay);
          }
        } catch (error) {
          console.error('Polling error:', error);
          // Retry with exponential backoff
          const delay = Math.min(1000 + (attempt * 200), 5000);
          setTimeout(() => checkResult(attempt + 1), delay);
        }
      };

      checkResult();
    } catch (error) {
      console.error('Query failed:', error);
      setMessages(prev => [
        ...prev, 
        { role: 'assistant', content: 'Sorry, I encountered an error processing your request.' }
      ]);
      setIsLoading(false);
    }
  }

  async function handleDeleteDocument(docId: string) {
    try {
      console.log(`Attempting to delete document ${docId}...`);
      
      const response = await axios.delete(
        `${process.env.REACT_APP_API_URL}/api/documents/${docId}`
      );
      
      console.log('Delete successful:', response.data);
      setDocuments(documents.filter((doc) => doc.id !== docId));
    } catch (error: any) {
      console.error('Delete failed:', error);
      
      // Log more detailed error information
      if (error.response) {
        // The request was made and the server responded with a status code
        // that falls out of the range of 2xx
        console.error('Error response:', {
          data: error.response.data,
          status: error.response.status,
          headers: error.response.headers,
        });
      } else if (error.request) {
        // The request was made but no response was received
        console.error('Error request:', error.request);
      } else {
        // Something happened in setting up the request that triggered an Error
        console.error('Error message:', error.message);
      }
      
      // You could add a toast notification here if you have a toast library
      alert(`Failed to delete document: ${error.response?.data?.error || error.message}`);
    }
  }

  // Add handler for toggling document active status
  async function handleToggleActive(docId: string) {
    try {
      const response = await axios.put(
        `${process.env.REACT_APP_API_URL}/api/documents/${docId}/toggle-active`
      );
      
      // Update the document in the state
      setDocuments(documents.map(doc => 
        doc.id === docId ? { ...doc, isActive: response.data.isActive } : doc
      ));
    } catch (error) {
      console.error('Failed to toggle document status:', error);
    }
  }

  // Helper function to format file size
  const formatFileSize = (bytes?: number): string => {
    if (!bytes) return '0 B';
    
    const units = ['B', 'KB', 'MB', 'GB'];
    let size = bytes;
    let unitIndex = 0;
    
    while (size >= 1024 && unitIndex < units.length - 1) {
      size /= 1024;
      unitIndex++;
    }
    
    return `${size.toFixed(1)} ${units[unitIndex]}`;
  };
  
  // Calculate total used storage
  const calculateUsedStorage = (): number => {
    return documents.reduce((total, doc) => total + (doc.fileSizeBytes || 0), 0);
  };
  
  // Calculate percentage used
  const calculatePercentageUsed = (): number => {
    const used = calculateUsedStorage();
    return Math.min(Math.round((used / storageQuota) * 100), 100);
  };

  return (
    <Grid container spacing={3}>
      <Grid item xs={12} md={4}>
        <Paper sx={{ p: 3, height: '100%', borderRadius: 2 }}>
          <Typography variant="h5" gutterBottom fontWeight="500" sx={{ mb: 3 }}>
            Your Documents
          </Typography>
          <Typography variant="subtitle2" color="text.secondary" sx={{ mb: 2 }}>
            Select documents to use in conversation
          </Typography>
          
          <Box
            {...getRootProps()}
            sx={{
              border: '2px dashed rgba(25, 118, 210, 0.4)',
              borderRadius: 2,
              p: 3,
              mb: 3,
              textAlign: 'center',
              cursor: isUploading ? 'default' : 'pointer',
              opacity: isUploading ? 0.7 : 1,
              position: 'relative',
              backgroundColor: 'rgba(25, 118, 210, 0.03)',
              transition: 'all 0.2s ease-in-out',
              '&:hover': {
                backgroundColor: 'rgba(25, 118, 210, 0.08)',
                borderColor: 'primary.main',
              },
            }}
          >
            <input {...getInputProps()} />
            <Box sx={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 1 }}>
              {isUploading ? (
                <>
                  <CircularProgress size={30} sx={{ mb: 2 }} />
                  <Typography>Uploading document...</Typography>
                </>
              ) : (
                <>
                  <Box 
                    sx={{ 
                      display: 'flex', 
                      justifyContent: 'center', 
                      alignItems: 'center',
                      width: 50,
                      height: 50,
                      mb: 2,
                      borderRadius: '50%',
                      backgroundColor: 'rgba(25, 118, 210, 0.1)',
                    }}
                  >
                    <DocumentIcon sx={{ fontSize: 30, color: 'primary.main' }} />
                  </Box>
                  <Typography variant="subtitle1" fontWeight="500">Upload PDF Documents</Typography>
                  <Typography variant="body2" color="text.secondary">
                    Drag and drop or click to browse
                  </Typography>
                </>
              )}
            </Box>
          </Box>
          
          {uploadError && (
            <Box sx={{ color: 'error.main', mb: 3, textAlign: 'center' }}>
              <Typography variant="body2">{uploadError}</Typography>
            </Box>
          )}
          
          <Divider sx={{ mb: 2 }} />
          
          {documents.length === 0 ? (
            <Box sx={{ textAlign: 'center', py: 3, color: 'text.secondary' }}>
              <Typography variant="body2">No documents uploaded yet</Typography>
            </Box>
          ) : (
            <>
              {documents.map((doc) => (
                <Card 
                  key={doc.id} 
                  sx={{ 
                    mb: 2, 
                    borderRadius: 2,
                    boxShadow: '0 2px 8px rgba(0,0,0,0.05)',
                    transition: 'all 0.2s',
                    '&:hover': {
                      boxShadow: '0 4px 12px rgba(0,0,0,0.1)',
                    }
                  }}
                >
                  <CardContent sx={{ p: 2, '&:last-child': { pb: 2 } }}>
                    <Box sx={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between' }}>
                      <Box sx={{ display: 'flex', alignItems: 'flex-start', gap: 1 }}>
                        <DocumentIcon sx={{ color: 'text.secondary', mt: 0.5 }} />
                        <Box>
                          <Typography variant="body1" fontWeight="500" noWrap sx={{ maxWidth: 150 }}>
                            {doc.filename}
                          </Typography>
                          <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
                            {doc.status === 'processing' ? (
                              <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.5 }}>
                                <CircularProgress size={12} />
                                <Typography variant="caption" color="text.secondary">Processing...</Typography>
                              </Box>
                            ) : doc.status === 'ready' ? (
                              <Typography variant="caption" color="success.main">Ready</Typography>
                            ) : (
                              <Typography variant="caption" color="error.main">Failed</Typography>
                            )}
                          </Box>
                          <Box sx={{ mt: 0.5 }}>
                            <Typography variant="caption" color="text.secondary">
                              {doc.pageCount ? `${doc.pageCount} pages • ` : ''}
                              {formatFileSize(doc.fileSizeBytes)}
                            </Typography>
                          </Box>
                        </Box>
                      </Box>
                      
                      <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
                        <Box sx={{ display: 'flex', alignItems: 'center' }}>
                          <Switch
                            size="small"
                            checked={doc.isActive !== false}
                            onChange={() => handleToggleActive(doc.id)}
                            disabled={doc.status !== 'ready'}
                            sx={{ mr: 0.5 }}
                          />
                          <Typography variant="caption" color={doc.isActive ? 'success.main' : 'text.secondary'}>
                            {doc.isActive !== false ? 'Active' : 'Inactive'}
                          </Typography>
                        </Box>
                        
                        <IconButton
                          size="small"
                          aria-label="delete"
                          onClick={() => handleDeleteDocument(doc.id)}
                          disabled={doc.status === 'processing'}
                          sx={{ 
                            color: 'text.secondary',
                            '&:hover': { color: 'error.main' }
                          }}
                        >
                          <DeleteIcon fontSize="small" />
                        </IconButton>
                      </Box>
                    </Box>
                  </CardContent>
                </Card>
              ))}
              
              <Divider sx={{ my: 2 }} />
              
              {/* Storage quota section */}
              <Box sx={{ mt: 2 }}>
                <Box sx={{ display: 'flex', justifyContent: 'space-between', mb: 1 }}>
                  <Typography variant="body2" color="text.secondary">Storage Used</Typography>
                  <Typography variant="body2" fontWeight="500">
                    {formatFileSize(calculateUsedStorage())} of {formatFileSize(storageQuota)}
                  </Typography>
                </Box>
                
                <Box 
                  sx={{ 
                    height: '8px', 
                    bgcolor: 'rgba(0,0,0,0.09)', 
                    borderRadius: 1,
                    overflow: 'hidden'
                  }}
                >
                  <Box 
                    sx={{ 
                      height: '100%', 
                      width: `${calculatePercentageUsed()}%`,
                      bgcolor: calculatePercentageUsed() > 90 ? 'error.main' : 'primary.main',
                      transition: 'width 0.3s ease-in-out'
                    }} 
                  />
                </Box>
                
                <Typography variant="caption" color="text.secondary" sx={{ mt: 0.5, display: 'block' }}>
                  {calculatePercentageUsed()}% of total storage
                </Typography>
              </Box>
            </>
          )}
        </Paper>
      </Grid>
      <Grid item xs={12} md={8}>
        <Paper 
          sx={{ 
            p: 3, 
            height: '100%', 
            display: 'flex', 
            flexDirection: 'column', 
            borderRadius: 2,
            boxShadow: '0 4px 12px rgba(0,0,0,0.05)'
          }}
        >
          <Typography variant="h5" gutterBottom fontWeight="500" sx={{ mb: 3 }}>
            Chat
          </Typography>
          <Box 
            sx={{ 
              flexGrow: 1, 
              mb: 3, 
              overflowY: 'auto', 
              maxHeight: '500px',
              display: 'flex',
              flexDirection: 'column',
              gap: 2,
              px: 1,
              // Add custom scrollbar styling
              '&::-webkit-scrollbar': {
                width: '8px',
              },
              '&::-webkit-scrollbar-track': {
                background: 'rgba(0,0,0,0.05)',
                borderRadius: 10,
              },
              '&::-webkit-scrollbar-thumb': {
                background: 'rgba(0,0,0,0.15)',
                borderRadius: 10,
                '&:hover': {
                  background: 'rgba(0,0,0,0.25)',
                },
              },
            }}
          >
            {messages.length === 0 ? (
              <Box sx={{ 
                textAlign: 'center', 
                color: 'text.secondary', 
                p: 4,
                display: 'flex',
                flexDirection: 'column',
                alignItems: 'center',
                justifyContent: 'center',
                height: '100%',
                opacity: 0.7
              }}>
                <DocumentIcon sx={{ fontSize: 50, mb: 2, color: 'primary.main', opacity: 0.7 }} />
                <Typography variant="body1" fontWeight="500" mb={1}>
                  Start the conversation
                </Typography>
                <Typography variant="body2">
                  Upload a document and ask questions about it
                </Typography>
              </Box>
            ) : (
              <>
                {messages.map((message, index) => (
                  <Box
                    key={index}
                    sx={{
                      maxWidth: message.role === 'assistant' ? '85%' : '80%',
                      alignSelf: message.role === 'assistant' ? 'flex-start' : 'flex-end',
                      animation: '0.3s ease-out 0s 1 slideIn',
                      '@keyframes slideIn': {
                        from: {
                          opacity: 0,
                          transform: message.role === 'assistant' 
                            ? 'translateX(-10px)' 
                            : 'translateX(10px)'
                        },
                        to: {
                          opacity: 1,
                          transform: 'translateX(0)'
                        }
                      }
                    }}
                  >
                    <Box
                      sx={{
                        position: 'relative',
                        p: 2,
                        bgcolor: message.role === 'assistant' ? 'grey.100' : 'primary.main',
                        borderRadius: 2,
                        ...(message.role === 'assistant' 
                          ? { borderTopLeftRadius: 0 } 
                          : { borderTopRightRadius: 0 }),
                        color: message.role === 'assistant' ? 'text.primary' : 'white',
                        boxShadow: '0 1px 2px rgba(0,0,0,0.1)',
                        '&::before': {
                          content: '""',
                          position: 'absolute',
                          top: 0,
                          ...(message.role === 'assistant' 
                            ? { left: -8, borderRight: '8px solid', borderRightColor: 'grey.100' } 
                            : { right: -8, borderLeft: '8px solid', borderLeftColor: 'primary.main' }),
                          borderTop: '8px solid transparent',
                        }
                      }}
                    >
                      <Typography variant="body1" sx={{ whiteSpace: 'pre-wrap' }}>
                        {message.role === 'assistant' ? (
                          <FormattedMessageContent content={message.content} />
                        ) : (
                          message.content
                        )}
                      </Typography>
                      <Typography 
                        variant="caption" 
                        sx={{ 
                          display: 'block', 
                          textAlign: message.role === 'assistant' ? 'left' : 'right',
                          mt: 1,
                          opacity: 0.7
                        }}
                      >
                        {message.role === 'assistant' ? 'Assistant' : 'You'}
                      </Typography>
                    </Box>
                  </Box>
                ))}
                {isLoading && <TypingIndicator />}
                <div ref={messagesEndRef} />
              </>
            )}
          </Box>
          <Box 
            sx={{ 
              display: 'flex', 
              flexDirection: 'column',
              gap: 2,
              borderTop: '1px solid',
              borderColor: 'divider',
              pt: 3
            }}
          >
            {/* Move text field and button before model dropdown */}
            <Box sx={{ display: 'flex', gap: 1 }}>
              <TextField
                fullWidth
                variant="outlined"
                placeholder="Ask a question about your documents..."
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                disabled={isLoading || documents.length === 0}
                onKeyDown={(e) => {
                  if (e.key === 'Enter' && !e.shiftKey) {
                    e.preventDefault();
                    if (query.trim() && documents.length > 0 && !isLoading) {
                      handleSendQuery();
                    }
                  }
                }}
                sx={{ 
                  '& .MuiOutlinedInput-root': {
                    borderRadius: 2
                  }
                }}
              />
              <Button
                variant="contained"
                endIcon={isLoading ? <CircularProgress size={20} color="inherit" /> : <SendIcon />}
                onClick={handleSendQuery}
                disabled={isLoading || !query.trim() || documents.length === 0}
                sx={{ 
                  borderRadius: 2,
                  minWidth: '100px',
                  transition: 'all 0.2s',
                  '&:not(:disabled):hover': {
                    transform: 'translateY(-2px)',
                    boxShadow: '0 4px 8px rgba(0,0,0,0.2)'
                  }
                }}
              >
                {isLoading ? 'Sending' : 'Send'}
              </Button>
            </Box>
            
            {/* Model selection dropdown moved below */}
            <FormControl variant="outlined" size="small" sx={{ maxWidth: '300px' }}>
              <InputLabel id="model-select-label">AI Model</InputLabel>
              <Select
                labelId="model-select-label"
                id="model-select"
                value={selectedModel}
                onChange={handleModelChange}
                label="AI Model"
                disabled={isLoading || isLoadingModels}
              >
                {availableModels.map((model) => (
                  <MenuItem 
                    key={model.id} 
                    value={model.id}
                    disabled={model.available === false}
                    sx={model.available === false ? { 
                      opacity: 0.6,
                      color: 'text.disabled',
                      fontStyle: 'italic'
                    } : {}}
                  >
                    <Tooltip 
                      title={
                        <Box sx={{ p: 1 }}>
                          <Typography variant="subtitle2">{model.name}</Typography>
                          <Typography variant="body2">{model.description}</Typography>
                          <Typography variant="caption" component="div" sx={{ mt: 1 }}>
                            Context window: {model.contextWindow.toLocaleString()} tokens
                          </Typography>
                          <Typography variant="caption" component="div">
                            Cost: {model.cost}
                          </Typography>
                          {model.available === false && (
                            <Typography variant="caption" component="div" color="error.main" sx={{ mt: 1 }}>
                              This model is not yet available for Assistants API
                            </Typography>
                          )}
                        </Box>
                      }
                      placement="top"
                      arrow
                    >
                      <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
                        <Typography>{model.name}</Typography>
                        {model.isDefault && (
                          <Typography variant="caption" sx={{ color: 'text.secondary' }}>
                            (Default)
                          </Typography>
                        )}
                      </Box>
                    </Tooltip>
                  </MenuItem>
                ))}
              </Select>
            </FormControl>
          </Box>
        </Paper>
      </Grid>
    </Grid>
  );
};

export default Home; 