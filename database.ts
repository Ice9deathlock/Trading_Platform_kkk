import { Pool } from 'pg';
import dotenv from 'dotenv';
import { logger } from '../utils/logger';

dotenv.config();

const {
  DB_HOST,
  DB_PORT,
  DB_NAME,
  DB_USER,
  DB_PASSWORD,
  NODE_ENV
} = process.env;

const isProduction = NODE_ENV === 'production';

// Create a new pool of connections
const pool = new Pool({
  host: DB_HOST || 'localhost',
  port: parseInt(DB_PORT || '5432', 10),
  database: DB_NAME || 'trading_platform',
  user: DB_USER || 'postgres',
  password: DB_PASSWORD || 'postgres',
  ssl: isProduction ? { rejectUnauthorized: false } : false,
  // Maximum number of clients the pool should contain
  max: 20,
  // Maximum time a client can remain idle in the pool
  idleTimeoutMillis: 30000,
  // Maximum time to wait for a client to become available
  connectionTimeoutMillis: 2000,
});

// Test the database connection
const connectDB = async (): Promise<void> => {
  try {
    const client = await pool.connect();
    logger.info('Successfully connected to PostgreSQL database');
    client.release();
  } catch (error) {
    logger.error('Error connecting to PostgreSQL database:', error);
    process.exit(1);
  }
};

// Handle connection errors
pool.on('error', (err: Error) => {
  logger.error('Unexpected error on idle client', err);
  process.exit(-1);
});

// Export the pool and connectDB function
export { pool, connectDB };

// This file provides a connection pool to the PostgreSQL database and exports it for use in other parts of the application.
