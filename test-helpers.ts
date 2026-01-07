import { PoolClient } from 'pg';
import { pool } from '../src/config/database';
import jwt from 'jsonwebtoken';
import WebSocket from 'ws';

// Extend WebSocket type to include 'off' method
declare module 'ws' {
  interface WebSocket {
    off(event: string, listener: (...args: any[]) => void): void;
  }
}

const JWT_SECRET = process.env.JWT_SECRET || 'test-secret';

export interface TestUser {
  id: string;
  email: string;
  password: string;
  authToken: string;
}

export const createTestUser = async (): Promise<TestUser> => {
  const userId = `test-user-${Date.now()}`;
  const userEmail = `test-${Date.now()}@example.com`;
  const password = 'test-password';
  
  const authToken = jwt.sign({ userId }, JWT_SECRET, { expiresIn: '1h' });
  
  return {
    id: userId,
    email: userEmail,
    password,
    authToken
  };
};

export const createTestOrder = async (
  userId: string, 
  symbol: string, 
  side: 'BUY' | 'SELL', 
  price: number, 
  quantity: number,
  client?: PoolClient
): Promise<any> => {
  const query = `
    INSERT INTO orders (
      id, user_id, symbol, type, side, price, quantity, 
      filled_quantity, status, time_in_force, created_at, updated_at
    ) VALUES (
      $1, $2, $3, 'LIMIT', $4, $5, $6, 
      0, 'OPEN', 'GTC', NOW(), NOW()
    ) RETURNING *
  `;
  
  const orderId = `order-${Date.now()}`;
  const values = [orderId, userId, symbol, side, price, quantity];
  
  if (client) {
    const result = await client.query(query, values);
    return result.rows[0];
  }
  
  const result = await pool.query(query, values);
  return result.rows[0];
};

export const clearTestData = async (): Promise<void> => {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    await client.query('TRUNCATE TABLE orders CASCADE');
    await client.query('TRUNCATE TABLE trades CASCADE');
    await client.query('TRUNCATE TABLE account_balances CASCADE');
    await client.query('TRUNCATE TABLE account_transactions CASCADE');
    await client.query('COMMIT');
  } catch (error) {
    await client.query('ROLLBACK');
    throw error;
  } finally {
    client.release();
  }
};

export const waitForEvent = (ws: WebSocket & { on: Function, off: Function }, event: string, timeout = 5000): Promise<any> => {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => {
      ws.off('message', onMessage);
      reject(new Error(`Timeout waiting for event: ${event}`));
    }, timeout);

    const onMessage = (data: WebSocket.Data) => {
      try {
        const message = JSON.parse(data.toString());
        if (message.type === event) {
          clearTimeout(timer);
          ws.off('message', onMessage);
          resolve(message);
        }
      } catch (error) {
        clearTimeout(timer);
        ws.off('message', onMessage);
        reject(error);
      }
    };

    ws.on('message', onMessage);
  });
};
