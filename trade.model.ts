import { Pool, PoolClient, QueryResult } from 'pg';
import { v4 as uuidv4 } from 'uuid';
import { pool } from '../config/database';

export interface Trade {
  id: string;
  orderId: string;
  userId: string;
  symbol: string;
  price: number;
  quantity: number;
  commission: number;
  commissionAsset: string;
  isBuyer: boolean;
  isMaker: boolean;
  isBestMatch: boolean;
  createdAt: Date;
}

export class TradeModel {
  private pool: Pool;

  constructor() {
    this.pool = pool;
  }

  async createTrade(tradeData: Omit<Trade, 'id' | 'createdAt'>, client?: PoolClient): Promise<Trade> {
    const query = `
      INSERT INTO trades (
        id, order_id, user_id, symbol, price, quantity, 
        commission, commission_asset, is_buyer, is_maker, is_best_match
      ) 
      VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11)
      RETURNING 
        id, order_id as "orderId", user_id as "userId", 
        symbol, price, quantity, commission, 
        commission_asset as "commissionAsset",
        is_buyer as "isBuyer", 
        is_maker as "isMaker",
        is_best_match as "isBestMatch",
        created_at as "createdAt"
    `;

    const values = [
      uuidv4(),
      tradeData.orderId,
      tradeData.userId,
      tradeData.symbol,
      tradeData.price,
      tradeData.quantity,
      tradeData.commission,
      tradeData.commissionAsset,
      tradeData.isBuyer,
      tradeData.isMaker,
      tradeData.isBestMatch ?? true,
    ];

    try {
      const result = client 
        ? await client.query<Trade>(query, values)
        : await this.pool.query<Trade>(query, values);
      
      return this.mapTradeFromDb(result.rows[0]);
    } catch (error) {
      console.error('Error creating trade:', error);
      throw new Error('Failed to create trade');
    }
  }

  async getTradesByOrderId(orderId: string, userId: string, client?: PoolClient): Promise<Trade[]> {
    const query = `
      SELECT 
        id, order_id as "orderId", user_id as "userId", 
        symbol, price, quantity, commission, 
        commission_asset as "commissionAsset",
        is_buyer as "isBuyer", 
        is_maker as "isMaker",
        is_best_match as "isBestMatch",
        created_at as "createdAt"
      FROM trades 
      WHERE order_id = $1 AND user_id = $2
      ORDER BY created_at DESC
    `;

    try {
      const result = client
        ? await client.query<Trade>(query, [orderId, userId])
        : await this.pool.query<Trade>(query, [orderId, userId]);
      
      return result.rows.map(row => this.mapTradeFromDb(row));
    } catch (error) {
      console.error('Error fetching trades by order ID:', error);
      throw new Error('Failed to fetch trades');
    }
  }

  async getTradesByUserId(
    userId: string, 
    symbol?: string, 
    limit = 100,
    client?: PoolClient
  ): Promise<Trade[]> {
    let query = `
      SELECT 
        t.id, t.order_id as "orderId", t.user_id as "userId", 
        t.symbol, t.price, t.quantity, t.commission, 
        t.commission_asset as "commissionAsset",
        t.is_buyer as "isBuyer", 
        t.is_maker as "isMaker",
        t.is_best_match as "isBestMatch",
        t.created_at as "createdAt"
      FROM trades t
      WHERE t.user_id = $1
    `;

    const values: any[] = [userId];
    let paramIndex = 2;

    if (symbol) {
      query += ` AND t.symbol = $${paramIndex++}`;
      values.push(symbol);
    }

    query += `
      ORDER BY t.created_at DESC
      LIMIT $${paramIndex}
    `;
    values.push(limit);

    try {
      const result = client
        ? await client.query<Trade>(query, values)
        : await this.pool.query<Trade>(query, values);
      
      return result.rows.map(row => this.mapTradeFromDb(row));
    } catch (error) {
      console.error('Error fetching trades by user ID:', error);
      throw new Error('Failed to fetch trades');
    }
  }

  async getTradesBySymbol(
    symbol: string, 
    limit = 100,
    client?: PoolClient
  ): Promise<Trade[]> {
    const query = `
      SELECT 
        t.id, t.order_id as "orderId", t.user_id as "userId", 
        t.symbol, t.price, t.quantity, t.commission, 
        t.commission_asset as "commissionAsset",
        t.is_buyer as "isBuyer", 
        t.is_maker as "isMaker",
        t.is_best_match as "isBestMatch",
        t.created_at as "createdAt"
      FROM trades t
      WHERE t.symbol = $1
      ORDER BY t.created_at DESC
      LIMIT $2
    `;

    try {
      const result = client
        ? await client.query<Trade>(query, [symbol, limit])
        : await this.pool.query<Trade>(query, [symbol, limit]);
      
      return result.rows.map(row => this.mapTradeFromDb(row));
    } catch (error) {
      console.error('Error fetching trades by symbol:', error);
      throw new Error('Failed to fetch trades');
    }
  }

  private mapTradeFromDb(row: any): Trade {
    return {
      ...row,
      createdAt: new Date(row.createdAt),
    };
  }
}

export const tradeModel = new TradeModel();
