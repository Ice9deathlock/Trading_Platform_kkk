import { Router } from 'express';
import * as userController from '../controllers/user.controller';
import { getProfile } from '../controllers/profile.controller';
import { protect } from '../utils/auth';
import { validate } from '../middleware/validate';
import { 
  updateProfileValidator,
  changePasswordValidator,
  forgotPasswordValidator,
  resetPasswordValidator,
  verifyEmailValidator
} from '../middleware/validators';

const router = Router();

// Public routes
router.post('/forgot-password', forgotPasswordValidator(), validate, userController.forgotPassword);
router.post('/reset-password/:token', resetPasswordValidator(), validate, userController.resetPassword);
router.get('/verify-email/:token', verifyEmailValidator(), validate, userController.verifyEmail);

// Protected routes (require authentication)
router.use(protect);

// User profile routes
router.get('/me', getProfile);
router.put('/profile', updateProfileValidator(), validate, userController.updateProfile);
router.put('/change-password', changePasswordValidator(), validate, userController.changePassword);
router.post('/send-verification-email', userController.sendVerificationEmail);

export default router;
