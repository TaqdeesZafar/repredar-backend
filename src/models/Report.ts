import mongoose, { Schema, Document, Types } from 'mongoose';

export interface IReport extends Document {
  name: string;
  pdf: Buffer;
  createdAt: Date;
  user: Types.ObjectId;
  platform: string;
  type: string;
  downloadToken: string;
  expiresAt: Date;
}

const ReportSchema: Schema = new Schema({
  name: { type: String, required: true },
  pdf: { type: Buffer, required: true },
  createdAt: { type: Date, default: Date.now },
  user: { type: Schema.Types.ObjectId, ref: 'User', required: false },
  platform: { type: String, required: true },
  type: { type: String, required: true },
  downloadToken: { type: String, required: false },
  expiresAt: { type: Date, default: () => new Date(Date.now() + 7 * 24 * 60 * 60 * 1000) },
});

const Report = mongoose.model<IReport>('Report', ReportSchema);
export default Report;
