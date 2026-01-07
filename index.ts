import express, { Application, Request, Response, NextFunction } from 'express';
import cors from 'cors';
import dotenv from 'dotenv';
import http from 'http';
import helmet from 'helmet';
import compression from 'compression';
import { logger } from './utils/logger';
import { errorHandler } from './middleware/errorHandler';
import { connectDB } from './config/database';
import { apiLimiter, authLimiter, sensitiveActionLimiter } from './middleware/rateLimiter';
import { initWebSocket } from './services/websocket.service';
import authRoutes from './routes/auth.routes';
import userRoutes from './routes/user.routes';
import healthRoutes from './routes/health.routes';
import tradingRoutes from './routes/trading.routes';

dotenv.config();

const app: Application = express();
const server = http.createServer(app);

// Initialize WebSocket server
const webSocketService = initWebSocket(server);

// Export WebSocket service for use in other modules
export { webSocketService };

// Security middleware
app.use(helmet());
app.use(compression());
app.use(cors({
  origin: process.env.CLIENT_URL || '*',
  credentials: true,
  methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Authorization'],
}));

// Body parser
app.use(express.json({ limit: '10kb' }));
app.use(express.urlencoded({ extended: true, limit: '10kb' }));

// Apply rate limiting to API routes
app.use('/api/auth', authLimiter, authRoutes);
app.use('/api/users', apiLimiter, userRoutes);
app.use('/api/trading', apiLimiter, tradingRoutes);
app.use('/api/health', healthRoutes);

// Health check routes (no auth required)
app.use('/api/v1/health', healthRoutes);

// Auth routes (public)
app.use('/api/v1/auth', [
  sensitiveActionLimiter, // Stricter rate limiting for auth endpoints
  authRoutes
]);

// User routes (protected)
app.use('/api/v1/users', [
  authLimiter, // Rate limiting for authenticated endpoints
  userRoutes
]);

// Handle 404 - Not Found
app.use((req: Request, res: Response) => {
  res.status(404).json({
    status: 'error',
    message: 'Not Found',
    code: 404,
  });
});

// Error handling middleware
app.use(errorHandler);

// Start server
const PORT = process.env.PORT || 3000;
const NODE_ENV = process.env.NODE_ENV || 'development';

const startServer = async () => {
  try {
    await connectDB();
    
    server.listen(PORT, () => {
      logger.info(`Server running in ${NODE_ENV} mode on port ${PORT}`);
      logger.info(`API Documentation: http://localhost:${PORT}/api-docs`);
    });
  } catch (error) {
    logger.error('Failed to start server:', error);
    process.exit(1);
  }
};

// Handle unhandled promise rejections
process.on('unhandledRejection', (err: Error) => {
  logger.error(`Unhandled Rejection: ${err.message}`, { stack: err.stack });
  // Close server & exit process
  server.close(() => process.exit(1));
});

// Handle uncaught exceptions
process.on('uncaughtException', (err: Error) => {
  logger.error(`Uncaught Exception: ${err.message}`, { stack: err.stack });
  // Close server & exit process
  server.close(() => process.exit(1));
});

// Handle SIGTERM signal (for Docker/container environments)
process.on('SIGTERM', () => {
  logger.info('SIGTERM received. Shutting down gracefully');
  server.close(() => {
    logger.info('Process terminated');
  });
});

// Start the server
if (process.env.NODE_ENV !== 'test') {
  startServer();
}

export { app, server }; // For testing purposes
