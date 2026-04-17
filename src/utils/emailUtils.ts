import nodemailer from 'nodemailer';
import dotenv from 'dotenv';

dotenv.config();

const transporter = nodemailer.createTransport({
    service: 'gmail',
    auth: {
        user: process.env.EMAIL_USER,
        pass: process.env.EMAIL_PASSWORD
    }
});

export const sendPasswordResetEmail = async (email: string, resetToken: string): Promise<void> => {
    const resetUrl = `${process.env.FRONTEND_URL}/reset-password`;
    
    const mailOptions = {
        from: process.env.EMAIL_USER,
        to: email,
        subject: 'Password Reset Request',
        html: `
            <h1>Password Reset Request</h1>
            <p>You are receiving this email because you (or someone else) has requested a password reset for your account.</p>
            <p>Please click on the following link and enter the token provided along witht the new password to reset your password:</p>
            <a href="${resetUrl}">${resetUrl}</a>
            <p>TOKEN: ${resetToken}</p>
            <p>If you did not request this, please ignore this email and your password will remain unchanged.</p>
            <p>This link will expire in 1 hour.</p>
        `
    };

    try {
        await transporter.sendMail(mailOptions);
    } catch (error) {
        console.error('Error sending email:', error);
        throw new Error('Failed to send password reset email');
    }
}; 