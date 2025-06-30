# Math PDF Assistant

An AI-powered application that helps users understand and work with mathematical documents. Upload PDFs and engage in intelligent conversations about their content.

## Features

- PDF document upload and management
- AI-powered document analysis and querying
- Real-time chat interface with mathematical notation support
- Google OAuth authentication
- Document search and context-aware responses

## Tech Stack

- Frontend: React.js, TypeScript, Material-UI, Tailwind CSS
- Backend: Node.js, Express.js, TypeScript
- Database: MongoDB
- AI: OpenAI Assistants API with file search capabilities
- Authentication: Google OAuth

## Prerequisites

- Node.js (v18 or higher)
- MongoDB
- OpenAI API key
- Google OAuth credentials

## Setup

1. Clone the repository
2. Install dependencies:
   ```bash
   npm install
   ```
3. Set up environment variables:
   - Create `.env` files in both frontend and backend directories
   - Add necessary API keys and configuration

4. Start development servers:
   ```bash
   npm run dev
   ```

## Environment Variables

### Backend (.env)
```
PORT=3001
MONGODB_URI=your_mongodb_uri
OPENAI_API_KEY=your_openai_key
GOOGLE_CLIENT_ID=your_google_client_id
GOOGLE_CLIENT_SECRET=your_google_client_secret
JWT_SECRET=your_jwt_secret
```

### Frontend (.env)
```
VITE_API_URL=http://localhost:3001
VITE_GOOGLE_CLIENT_ID=your_google_client_id
```

## Project Structure

```
math-pdf-assistant/
├── frontend/          # React frontend application
├── backend/           # Express backend server
├── package.json       # Root package.json with workspace config
└── README.md         # Project documentation
``` 