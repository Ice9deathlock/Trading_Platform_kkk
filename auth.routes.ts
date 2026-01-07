import { Router } from 'express';
import * as authController from '../controllers/auth.controller';
import { 
  registerValidator, 
  loginValidator, 
  refreshTokenValidator,
  updateProfileValidator,
  changePasswordValidator 
} from '../middleware/validators';
import { protect } from '../utils/auth';
import { validate } from '../middleware/validate';

const router = Router();

// Public routes
router.post('/register', registerValidator(), validate, authController.register);
router.post('/login', loginValidator(), validate, authController.login);
router.post('/refresh-token', refreshTokenValidator(), validate, authController.refreshToken);

// Protected routes
router.use(protect);

router.get('/me', authController.getMe);
router.post('/logout', authController.logout);
router.put('/profile', updateProfileValidator(), validate, authController.updateProfile);
router.put('/change-password', changePasswordValidator(), validate, authController.changePassword);

export default router;
