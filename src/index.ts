import express, { Express, Request, Response } from 'express';
import cors from 'cors';
import './jobs/cronjob'; 
import mongoose from "mongoose";
import dotenv from "dotenv";
import TwitterRoutes from './routes/twitterRoutes';
import TiktokRoutes from './routes/tiktokRoutes';
import LinkedinRoutes from './routes/linkedinRoutes';
import FacebookRoutes from './routes/facebookRoutes';
import InstagramRoutes from './routes/instagramRoutes';
import GoogleRoutes from './routes/googleRoutes';
import CrossPlatformRoutes from './routes/crossPlatformRoutes';
import authRoutes from './routes/authRoutes';
import ReportRoutes from './routes/reportRoutes';
import UserRoutes from './routes/userRoutes';
import signupLogRoutes from './routes/signupLogRoutes';
import searchLogRoutes from './routes/searchLogRoutes';

dotenv.config();

const app: Express = express();
const PORT = process.env.PORT || 5000;

app.use(cors()); 

// app.use(express.json()); 

app.get("/", (req: Request, res: Response) => {
    res.send("Hello World!");
});
app.use('/api/twitter', express.json(), TwitterRoutes); 
app.use('/api/tiktok', express.json(), TiktokRoutes); 
app.use('/api/linkedin', express.json(), LinkedinRoutes); 
app.use('/api/facebook', express.json(), FacebookRoutes); 
app.use('/api/instagram', express.json(), InstagramRoutes); 
app.use('/api/google', express.json(), GoogleRoutes); 
app.use('/api/crossplatform', express.json(), CrossPlatformRoutes); 
app.use('/api/report', express.json(), ReportRoutes);
app.use('/api/auth', express.json(), authRoutes);
app.use('/api/users', express.json(), UserRoutes);
app.use('/api/signup-logs', express.json(), signupLogRoutes);
app.use('/api/search-logs', express.json(), searchLogRoutes);

const connectDB = async () => {
    try {
        await mongoose.connect(process.env.MONGO_URI as string);
        console.log("MongoDB Connected");
    } catch (err) {
        console.error("MongoDB Connection Error:", err);
        console.log("Server starting in offline-database mode...");
    }
    app.listen(PORT, () => console.log(`Server running on port ${PORT}`));
};

connectDB();