import crypto from 'crypto';
import Report from '../models/Report';

export const saveReportAndGetUrl = async (
  pdfBuffer: Buffer,
  name: string,
  platform: string,
): Promise<string | null> => {
  try {
    const downloadToken = crypto.randomBytes(32).toString('hex');
    const report = new Report({
      name,
      pdf: pdfBuffer,
      platform,
      type: 'report',
      downloadToken,
    });
    await report.save();
    const backendUrl = process.env.BACKEND_URL || process.env.RAILWAY_STATIC_URL || 'http://localhost:5001';
    return `${backendUrl}/api/report/public/${downloadToken}`;
  } catch (err: any) {
    console.error('[Report] DB save failed (non-fatal):', err.message);
    return null;
  }
};
