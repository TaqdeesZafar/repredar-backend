import { Request, Response } from "express";
import bcrypt from "bcryptjs";
import jwt from "jsonwebtoken";
import dotenv from "dotenv";
import User from "../models/User";
import { sendPasswordResetEmail } from "../utils/emailUtils";
import { MailchimpService } from "../services/mailchimp.service";
import crypto from "crypto";

dotenv.config();

export const register = async (req: Request, res: Response): Promise<void> => {
    try {
        const { name, email, password } = req.body;

        let user = await User.findOne({ email });
        if (user) {
            res.status(400).json({ error: "User already exists" });
            return;
        }

        const hashedPassword = await bcrypt.hash(password, 10);

        user = new User({ name, email, password: hashedPassword });
        await user.save();

        MailchimpService.addUsersToList().catch(err => {
            console.error('[Mailchimp] Failed to add user to list:', err);
        });

        res.status(201).json({ message: "User registered successfully" });
    } catch (error: any) {
        res.status(500).json({ error: "Server error", details: error });
    }
};

export const login = async (req: Request, res: Response): Promise<void> => {
    try {
        const { email, password } = req.body;

        const user = await User.findOne({ email });
        if (!user || !user.password) {
            res.status(400).json({ error: "Invalid email or password" });
            return;
        }

        const isMatch = await bcrypt.compare(password, user.password);
        if (!isMatch) {
            res.status(400).json({ error: "Invalid email or password" });
            return;
        }

        const token = jwt.sign(
            { id: user._id, email: user.email },
            process.env.JWT_SECRET as string,
            { expiresIn: "1h" }
          );
          
        res.json({ token });
    } catch (error: any) {
        res.status(500).json({ error: "Server error", details: error });
    }
};

export const forgotPassword = async (req: Request, res: Response): Promise<void> => {
    try {
        const { email } = req.body;

        const user = await User.findOne({ email });
        if (!user) {
            res.status(400).json({ error: "No user found with this email" });
            return;
        }

        const resetToken = crypto.randomBytes(20).toString('hex');
        const resetExpires = new Date(Date.now() + 3600000);

        user.resetPasswordToken = resetToken;
        user.resetPasswordExpires = resetExpires;
        await user.save();

      
        await sendPasswordResetEmail(user.email, resetToken);

        res.json({ message: "Password reset email sent" });
    } catch (error: any) {
        res.status(500).json({ error: "Server error", details: error });
    }
};

export const resetPassword = async (req: Request, res: Response): Promise<void> => {
    try {
        const { token, password } = req.body;

        const user = await User.findOne({
            resetPasswordToken: token,
            resetPasswordExpires: { $gt: Date.now() }
        });

        if (!user) {
            res.status(400).json({ error: "Invalid or expired reset token" });
            return;
        }

        
        const hashedPassword = await bcrypt.hash(password, 10);
        user.password = hashedPassword;
        user.resetPasswordToken = undefined;
        user.resetPasswordExpires = undefined;
        await user.save();

        res.json({ message: "Password has been reset successfully" });
    } catch (error: any) {
        res.status(500).json({ error: "Server error", details: error });
    }
};

export const guestToken = async (req: Request, res: Response): Promise<void> => {
    try {
        const { email } = req.body;

        if (!email) {
            res.status(400).json({ error: "Email is required" });
            return;
        }

        let user = await User.findOne({ email });
        
        if (!user) {
            // Create a guest user
            user = new User({
                name: "Guest User",
                email: email,
            });
            await user.save();
            
            // Optionally add to Mailchimp
            MailchimpService.addUsersToList().catch(err => {
                console.error('[Mailchimp] Failed to add guest to list:', err);
            });
        }

        const token = jwt.sign(
            { id: user._id, email: user.email, isGuest: true },
            process.env.JWT_SECRET as string,
            { expiresIn: "24h" } // Guests get a longer token window to explore
        );
          
        res.json({ token });
    } catch (error: any) {
        res.status(500).json({ error: "Server error", details: error });
    }
};

