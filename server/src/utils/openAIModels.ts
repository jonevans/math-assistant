import { OpenAI } from 'openai';

// Define types for model information
export interface ModelInfo {
  id: string;
  name: string;
  description: string;
  capabilities: string[];
  contextWindow: number;
  cost: string;
  isDefault?: boolean;
  available?: boolean; // Add availability flag
}

// Define available models for document QA
export const AVAILABLE_MODELS: ModelInfo[] = [
  {
    id: 'o4-mini',
    name: 'o4-mini (Not Yet Available)',
    description: 'Compact high-performance model with strong reasoning capabilities.',
    capabilities: ['Efficient reasoning', 'Advanced document understanding', 'Mathematical equation support'],
    contextWindow: 64000,
    cost: 'Low',
    isDefault: false,
    available: false // Mark as not available
  },
  {
    id: 'o3-mini',
    name: 'o3-mini',
    description: 'Compact high-reasoning model for efficient document processing.',
    capabilities: ['Efficient reasoning', 'Fast document processing', 'Good for complex tasks'],
    contextWindow: 16000,
    cost: 'Very Low',
    isDefault: true, // Set as default
    available: true
  }
];

// Function to get default model
export function getDefaultModel(): ModelInfo {
  const defaultModel = AVAILABLE_MODELS.find(model => model.isDefault);
  return defaultModel || AVAILABLE_MODELS.find(model => model.available) || AVAILABLE_MODELS[0];
}

// Function to get a model by ID
export function getModelById(modelId: string): ModelInfo | undefined {
  return AVAILABLE_MODELS.find(model => model.id === modelId);
}

// Function to check if a model is valid
export function isValidModel(modelId: string): boolean {
  const model = AVAILABLE_MODELS.find(model => model.id === modelId);
  return !!model && !!model.available;
}

// Function to get OpenAI assistants models
export async function getOpenAIAssistantModels(): Promise<string[]> {
  try {
    const openai = new OpenAI({
      apiKey: process.env.OPENAI_API_KEY
    });
    
    // Return only available models
    return AVAILABLE_MODELS.filter(model => model.available).map(model => model.id);
  } catch (error) {
    console.error('Failed to retrieve OpenAI models:', error);
    // Return hardcoded fallback list
    return ['o3-mini'];
  }
} 