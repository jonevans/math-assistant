import { Schema, model, Document } from 'mongoose';
import mongoose from 'mongoose';

export interface IPdfDocument extends Document {
  filename: string;
  openaiFileId: string;
  vectorFileId?: string;
  userId: mongoose.Types.ObjectId;
  status: 'processing' | 'ready' | 'failed';
  isActive: boolean;
  pageCount?: number;
  fileSizeBytes?: number;
  createdAt: Date;
  updatedAt: Date;
}

const pdfDocumentSchema = new Schema<IPdfDocument>({
  filename: { type: String, required: true },
  openaiFileId: { type: String, required: true },
  vectorFileId: { type: String },
  userId: { type: Schema.Types.ObjectId, ref: 'User', required: true },
  status: { 
    type: String, 
    enum: ['processing', 'ready', 'failed'],
    default: 'processing'
  },
  isActive: { 
    type: Boolean, 
    default: true 
  },
  pageCount: { 
    type: Number 
  },
  fileSizeBytes: { 
    type: Number 
  }
}, {
  timestamps: true
});

export const PdfDocument = model<IPdfDocument>('Document', pdfDocumentSchema); 