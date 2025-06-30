import { Schema, model, Document } from 'mongoose';

interface IUser extends Document {
  email: string;
  name: string;
  picture?: string;
  googleId: string;
  vectorStoreId?: string;
  createdAt: Date;
  updatedAt: Date;
}

const userSchema = new Schema<IUser>({
  email: { type: String, required: true, unique: true },
  name: { type: String, required: true },
  picture: { type: String },
  googleId: { type: String, required: true, unique: true },
  vectorStoreId: { type: String },
}, {
  timestamps: true
});

export const User = model<IUser>('User', userSchema); 