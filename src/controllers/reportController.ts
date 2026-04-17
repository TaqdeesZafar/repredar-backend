import { Request, Response } from 'express';
import Report from '../models/Report';

export const getUserReports = async (req: Request, res: Response) => {
  try {
    const userId = (req as any).user?.userId || (req as any).user?._id || (req as any).user?.id ;
    if (!userId) {
      res.status(401).json({ message: 'User not authenticated' });
      return;
    }
    const reports = await Report.find({ user: userId }).sort({ createdAt: -1 });
    res.json(reports);
  } catch (error) {
    res.status(500).json({ message: 'Failed to fetch reports', error } );
  }
};

export const downloadReportPdf = async (req: Request, res: Response) => {
  try {
    const userId = (req as any).user?.userId || (req as any).user?._id || (req as any).user?.id ;
    if (!userId) {
      res.status(401).json({ message: 'User not authenticated' });
      return;
    }
    const { id } = req.params;
    const report = await Report.findById(id);
    if (!report) {
      res.status(404).json({ message: 'Report not found' });
      return;
    }
    if (report.user.toString() !== userId.toString()) {
      res.status(403).json({ message: 'Forbidden: You do not have access to this report' });
      return;
    }
    res.setHeader('Content-Disposition', `attachment; filename="${report.name || 'report'}.pdf"`);
    res.setHeader('Content-Type', 'application/pdf');
    res.send(report.pdf);
  } catch (error) {
    res.status(500).json({ message: 'Failed to download PDF', error });
  }
}; 