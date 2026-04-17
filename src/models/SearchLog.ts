import mongoose, { Schema, Document } from 'mongoose';

export interface ISearchLog extends Document {
  platform: 'TWITTER' | 'TIKTOK' | 'LINKEDIN' | 'FACEBOOK' | 'CROSS_PLATFORM';
  searchQuery: string;
  ipAddress: string;
  userAgent: string;
  timestamp: Date;
  userId?: string;
  resultCount?: number;
  filters?: {
    [key: string]: any;
  };
}

const SearchLogSchema: Schema = new Schema({
  platform: {
    type: String,
    enum: ['TWITTER', 'TIKTOK', 'LINKEDIN', 'FACEBOOK', 'CROSS_PLATFORM'],
    required: true
  },
  searchQuery: {
    type: String,
    required: true
  },
  ipAddress: {
    type: String,
    required: true
  },
  userAgent: {
    type: String,
    required: true
  },
  timestamp: {
    type: Date,
    default: Date.now
  },
  userId: {
    type: Schema.Types.ObjectId,
    ref: 'User',
    required: false
  },
  resultCount: {
    type: Number
  },
  filters: {
    type: Schema.Types.Mixed
  }
});

// Add index for faster queries
SearchLogSchema.index({ platform: 1, timestamp: -1 });
SearchLogSchema.index({ searchQuery: 'text' });

export default mongoose.model<ISearchLog>('SearchLog', SearchLogSchema); 