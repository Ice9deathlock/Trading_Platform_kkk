import { Router } from 'express';
import * as healthController from '../controllers/health.controller';
import { apiLimiter } from '../middleware/rateLimiter';

const router = Router();

// Health check endpoints (public)
router.get('/health', apiLimiter, healthController.healthCheck);
router.get('/ready', apiLimiter, healthController.readinessCheck);
router.get('/live', apiLimiter, healthController.livenessCheck);

export default router;
