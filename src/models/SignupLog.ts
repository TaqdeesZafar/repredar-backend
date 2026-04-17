import mongoose, { Schema, Document } from 'mongoose';

export interface ISignupLog extends Document {
  eventType: 'PAGE_VISIT' | 'SIGNUP_ATTEMPT';
  ipAddress: string;
  userAgent: string;
  timestamp: Date;
  success?: boolean;
  errorMessage?: string;
}

const SignupLogSchema: Schema = new Schema({
  eventType: {
    type: String,
    enum: ['PAGE_VISIT', 'SIGNUP_ATTEMPT'],
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
  success: {
    type: Boolean
  },
  errorMessage: {
    type: String
  }
});

export default mongoose.model<ISignupLog>('SignupLog', SignupLogSchema); 