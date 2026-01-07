import { Request, Response } from 'express';
import { validationResult } from 'express-validator';
import UserModel from '../models/user.model';
import { logger } from '../utils/logger';
import { generateToken } from '../utils/auth';
import { sendEmail } from '../services/email.service';

// Send verification email
export const sendVerificationEmail = async (req: Request, res: Response) => {
  try {
    const { email } = req.body;
    
    // Find user by email
    const user = await UserModel.findByEmail(email);
    if (!user) {
      return res.status(200).json({
        success: true,
        message: 'If the email exists, a verification link has been sent',
      });
    }

    // Check if email is already verified
    if (user.is_email_verified) {
      return res.status(400).json({
        success: false,
        message: 'Email is already verified',
      });
    }

    // Generate new verification token
    const verificationToken = user.email_verification_token || (await UserModel.createVerificationToken(user.id!));
    
    // Send verification email
    const verificationUrl = `${process.env.CLIENT_URL}/verify-email?token=${verificationToken}`;
    await sendEmail({
      to: user.email,
      subject: 'Verify Your Email',
      template: 'verify-email',
      context: {
        name: user.first_name || 'User',
        verificationUrl,
      },
    });

    res.status(200).json({
      success: true,
      message: 'Verification email sent successfully',
    });
  } catch (error) {
    logger.error('Error sending verification email:', error);
    res.status(500).json({
      success: false,
      message: 'Error sending verification email',
    });
  }
};

// Verify email
export const verifyEmail = async (req: Request, res: Response) => {
  try {
    const { token } = req.params;

    // Find user by verification token
    const user = await UserModel.findByVerificationToken(token);
    if (!user) {
      return res.status(400).json({
        success: false,
        message: 'Invalid or expired verification token',
      });
    }

    // Verify user email
    await UserModel.verifyEmail(user.id!);

    // Generate JWT token
    const authToken = generateToken(user.id!, user.email);
    const refreshToken = generateRefreshToken(user.id!, user.email);

    res.status(200).json({
      success: true,
      message: 'Email verified successfully',
      token: authToken,
      refreshToken,
    });
  } catch (error) {
    logger.error('Error verifying email:', error);
    res.status(500).json({
      success: false,
      message: 'Error verifying email',
    });
  }
};

// Forgot password
export const forgotPassword = async (req: Request, res: Response) => {
  try {
    const { email } = req.body;
    
    // Find user by email
    const user = await UserModel.findByEmail(email);
    if (!user) {
      return res.status(200).json({
        success: true,
        message: 'If the email exists, a password reset link has been sent',
      });
    }

    // Generate password reset token
    const resetToken = await UserModel.createPasswordResetToken(email);
    if (!resetToken) {
      throw new Error('Failed to generate password reset token');
    }
    
    // Send password reset email
    const resetUrl = `${process.env.CLIENT_URL}/reset-password?token=${resetToken}`;
    await sendEmail({
      to: user.email,
      subject: 'Reset Your Password',
      template: 'reset-password',
      context: {
        name: user.first_name || 'User',
        resetUrl,
      },
    });

    res.status(200).json({
      success: true,
      message: 'Password reset email sent successfully',
    });
  } catch (error) {
    logger.error('Error in forgot password:', error);
    res.status(500).json({
      success: false,
      message: 'Error processing forgot password request',
    });
  }
};

// Reset password
export const resetPassword = async (req: Request, res: Response) => {
  try {
    const { token } = req.params;
    const { password } = req.body;

    // Reset password
    const isSuccess = await UserModel.resetPassword(token, password);
    
    if (!isSuccess) {
      return res.status(400).json({
        success: false,
        message: 'Invalid or expired password reset token',
      });
    }

    res.status(200).json({
      success: true,
      message: 'Password reset successful',
    });
  } catch (error) {
    logger.error('Error resetting password:', error);
    res.status(500).json({
      success: false,
      message: 'Error resetting password',
    });
  }
};

// Update user profile
export const updateProfile = async (req: Request, res: Response) => {
  try {
    const { id } = req.user!;
    const updates = req.body;

    // Update user profile
    const updatedUser = await UserModel.updateProfile(id, updates);
    
    // Remove sensitive data
    const { password, ...userWithoutPassword } = updatedUser;

    res.status(200).json({
      success: true,
      data: userWithoutPassword,
    });
  } catch (error) {
    logger.error('Error updating profile:', error);
    res.status(500).json({
      success: false,
      message: 'Error updating profile',
    });
  }
};

// Change password
export const changePassword = async (req: Request, res: Response) => {
  try {
    const { id } = req.user!;
    const { currentPassword, newPassword } = req.body;

    // Find user by ID
    const user = await UserModel.findById(id);
    if (!user) {
      return res.status(404).json({
        success: false,
        message: 'User not found',
      });
    }

    // Verify current password
    const isMatch = await UserModel.verifyPassword(currentPassword, user.password);
    if (!isMatch) {
      return res.status(400).json({
        success: false,
        message: 'Current password is incorrect',
      });
    }

    // Update password
    await UserModel.updatePassword(id, newPassword);

    res.status(200).json({
      success: true,
      message: 'Password updated successfully',
    });
  } catch (error) {
    logger.error('Error changing password:', error);
    res.status(500).json({
      success: false,
      message: 'Error changing password',
    });
  }
};
