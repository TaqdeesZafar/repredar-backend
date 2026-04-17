import mongoose, { Schema, Document, Types } from 'mongoose';

export interface IReport extends Document {
  name: string;
  pdf: Buffer;
  createdAt: Date;
  user: Types.ObjectId;
  platform: string;
  type: string;
}

const ReportSchema: Schema = new Schema({
  name: { type: String, required: true },
  pdf: { type: Buffer, required: true },
  createdAt: { type: Date, default: Date.now },
  user: { type: Schema.Types.ObjectId, ref: 'User', required: true },
  platform: { type: String, required: true },
  type: { type: String, enum: ['paid', 'free'], required: true },
});

const Report = mongoose.model<IReport>('Report', ReportSchema);
export default Report; 