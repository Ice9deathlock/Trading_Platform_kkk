import { Request, Response } from 'express';
import UserModel from '../models/user.model';
import { logger } from '../utils/logger';

// Get user profile
export const getProfile = async (req: Request, res: Response) => {
  try {
    const user = await UserModel.findById((req as any).user.id);
    
    if (!user) {
      return res.status(404).json({
        success: false,
        message: 'User not found',
      });
    }

    // Remove sensitive data
    const { password, ...userData } = user;

    res.status(200).json({
      success: true,
      data: userData,
    });
  } catch (error) {
    logger.error('Error getting user profile:', error);
    res.status(500).json({
      success: false,
      message: 'Internal server error',
    });
  }
};
