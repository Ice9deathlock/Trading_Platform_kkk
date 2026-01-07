import { Request, Response } from 'express';
import { pool } from '../config/database';
import { logger } from '../utils/logger';

interface HealthCheckResponse {
  status: 'ok' | 'error';
  timestamp: string;
  uptime: number;
  database: {
    status: 'up' | 'down';
    version?: string;
  };
  memory: NodeJS.MemoryUsage;
  environment: string;
  version: string;
}

export const healthCheck = async (req: Request, res: Response) => {
  const startTime = process.hrtime();
  const health: HealthCheckResponse = {
    status: 'ok',
    timestamp: new Date().toISOString(),
    uptime: process.uptime(),
    database: { status: 'down' },
    memory: process.memoryUsage(),
    environment: process.env.NODE_ENV || 'development',
    version: process.env.npm_package_version || '1.0.0',
  };

  try {
    // Check database connection
    const dbResult = await pool.query('SELECT version()');
    health.database = {
      status: 'up',
      version: dbResult.rows[0]?.version,
    };
  } catch (error) {
    health.status = 'error';
    health.database = { status: 'down' };
    logger.error('Database health check failed:', error);
  }

  // Calculate response time
  const hrTime = process.hrtime(startTime);
  const responseTime = hrTime[0] * 1000 + hrTime[1] / 1e6; // Convert to ms

  // Add response time to headers
  res.setHeader('X-Response-Time', `${responseTime.toFixed(2)}ms`);

  // Return appropriate status code based on health status
  const statusCode = health.status === 'ok' ? 200 : 503;
  
  // Log health check
  logger.info(`Health check: ${health.status.toUpperCase()}`, {
    status: health.status,
    responseTime: `${responseTime.toFixed(2)}ms`,
    database: health.database.status,
  });

  // Don't expose sensitive information in production
  if (process.env.NODE_ENV === 'production') {
    const { memory, ...publicHealth } = health;
    return res.status(statusCode).json(publicHealth);
  }

  res.status(statusCode).json(health);
};

export const readinessCheck = async (req: Request, res: Response) => {
  const checks = {
    database: false,
  };
  let isReady = true;

  try {
    await pool.query('SELECT 1');
    checks.database = true;
  } catch (error) {
    isReady = false;
    logger.error('Readiness check failed:', error);
  }

  const status = isReady ? 200 : 503;
  res.status(status).json({
    status: isReady ? 'ready' : 'not ready',
    checks,
    timestamp: new Date().toISOString(),
  });
};

export const livenessCheck = (req: Request, res: Response) => {
  res.status(200).json({
    status: 'alive',
    timestamp: new Date().toISOString(),
    uptime: process.uptime(),
  });
};
