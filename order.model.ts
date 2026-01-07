import { Pool, PoolClient, QueryResult } from 'pg';
import { v4 as uuidv4 } from 'uuid';
import { pool } from '../config/database';

export enum OrderType {
  MARKET = 'MARKET',
  LIMIT = 'LIMIT',
  STOP = 'STOP',
  STOP_LIMIT = 'STOP_LIMIT',
}

export enum OrderSide {
  BUY = 'BUY',
  SELL = 'SELL',
}

export enum OrderStatus {
  OPEN = 'OPEN',
  PARTIALLY_FILLED = 'PARTIALLY_FILLED',
  FILLED = 'FILLED',
  CANCELLED = 'CANCELLED',
  REJECTED = 'REJECTED',
  EXPIRED = 'EXPIRED',
}

export enum TimeInForce {
  GTC = 'GTC', // Good Till Cancelled
  IOC = 'IOC', // Immediate or Cancel
  FOK = 'FOK', // Fill or Kill
}

export interface Order {
  id: string;
  userId: string;
  clientOrderId?: string;
  symbol: string;
  type: OrderType;
  side: OrderSide;
  price: number;
  stopPrice?: number;
  quantity: number;
  filledQuantity: number;
  status: OrderStatus;
  timeInForce: TimeInForce;
  icebergQuantity?: number;
  createdAt: Date;
  updatedAt: Date;
  closedAt?: Date;
}

export class OrderModel {
  private pool: Pool;

  constructor() {
    this.pool = pool;
  }

  async createOrder(orderData: Omit<Order, 'id' | 'createdAt' | 'updatedAt' | 'status' | 'filledQuantity'>, client?: PoolClient): Promise<Order> {
    const query = `
      INSERT INTO orders (
        id, user_id, client_order_id, symbol, type, side, price, 
        stop_price, quantity, time_in_force, iceberg_quantity, status
      ) 
      VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12)
      RETURNING 
        id, user_id as "userId", client_order_id as "clientOrderId", 
        symbol, type::text, side::text, price, stop_price as "stopPrice", 
        quantity, filled_quantity as "filledQuantity", status::text, 
        time_in_force as "timeInForce", iceberg_quantity as "icebergQuantity",
        created_at as "createdAt", updated_at as "updatedAt", 
        closed_at as "closedAt"
    `;

    const values = [
      uuidv4(),
      orderData.userId,
      orderData.clientOrderId || null,
      orderData.symbol,
      orderData.type,
      orderData.side,
      orderData.price,
      orderData.stopPrice || null,
      orderData.quantity,
      orderData.timeInForce,
      orderData.icebergQuantity || null,
      OrderStatus.OPEN,
    ];

    try {
      const result = client 
        ? await client.query<Order>(query, values)
        : await this.pool.query<Order>(query, values);
      
      return this.mapOrderFromDb(result.rows[0]);
    } catch (error) {
      console.error('Error creating order:', error);
      throw new Error('Failed to create order');
    }
  }

  async getOrderById(orderId: string, userId: string, client?: PoolClient): Promise<Order | null> {
    const query = `
      SELECT 
        id, user_id as "userId", client_order_id as "clientOrderId", 
        symbol, type::text, side::text, price, stop_price as "stopPrice", 
        quantity, filled_quantity as "filledQuantity", status::text, 
        time_in_force as "timeInForce", iceberg_quantity as "icebergQuantity",
        created_at as "createdAt", updated_at as "updatedAt", 
        closed_at as "closedAt"
      FROM orders 
      WHERE id = $1 AND user_id = $2
    `;

    try {
      const result = client
        ? await client.query<Order>(query, [orderId, userId])
        : await this.pool.query<Order>(query, [orderId, userId]);
      
      return result.rows.length > 0 ? this.mapOrderFromDb(result.rows[0]) : null;
    } catch (error) {
      console.error('Error fetching order:', error);
      throw new Error('Failed to fetch order');
    }
  }

  async cancelOrder(orderId: string, userId: string, client?: PoolClient): Promise<Order | null> {
    const query = `
      UPDATE orders 
      SET status = $1, closed_at = NOW()
      WHERE id = $2 AND user_id = $3
        AND status IN ($4, $5)
      RETURNING 
        id, user_id as "userId", client_order_id as "clientOrderId", 
        symbol, type::text, side::text, price, stop_price as "stopPrice", 
        quantity, filled_quantity as "filledQuantity", status::text, 
        time_in_force as "timeInForce", iceberg_quantity as "icebergQuantity",
        created_at as "createdAt", updated_at as "updatedAt", 
        closed_at as "closedAt"
    `;

    try {
      const result = client
        ? await client.query<Order>(query, [
            OrderStatus.CANCELLED, 
            orderId, 
            userId,
            OrderStatus.OPEN,
            OrderStatus.PARTIALLY_FILLED
          ])
        : await this.pool.query<Order>(query, [
            OrderStatus.CANCELLED, 
            orderId, 
            userId,
            OrderStatus.OPEN,
            OrderStatus.PARTIALLY_FILLED
          ]);
      
      return result.rows.length > 0 ? this.mapOrderFromDb(result.rows[0]) : null;
    } catch (error) {
      console.error('Error cancelling order:', error);
      throw new Error('Failed to cancel order');
    }
  }

  async updateOrderFilledQuantity(
    orderId: string, 
    filledQuantity: number, 
    client: PoolClient
  ): Promise<Order | null> {
    const query = `
      UPDATE orders 
      SET 
        filled_quantity = $1,
        status = CASE 
          WHEN $1 >= quantity THEN $2
          WHEN $1 > 0 THEN $3
          ELSE status
        END,
        closed_at = CASE 
          WHEN $1 >= quantity THEN NOW()
          ELSE closed_at
        END
      WHERE id = $4
      RETURNING 
        id, user_id as "userId", client_order_id as "clientOrderId", 
        symbol, type::text, side::text, price, stop_price as "stopPrice", 
        quantity, filled_quantity as "filledQuantity", status::text, 
        time_in_force as "timeInForce", iceberg_quantity as "icebergQuantity",
        created_at as "createdAt", updated_at as "updatedAt", 
        closed_at as "closedAt"
    `;

    try {
      const result = await client.query<Order>(query, [
        filledQuantity,
        OrderStatus.FILLED,
        OrderStatus.PARTIALLY_FILLED,
        orderId
      ]);
      
      return result.rows.length > 0 ? this.mapOrderFromDb(result.rows[0]) : null;
    } catch (error) {
      console.error('Error updating order filled quantity:', error);
      throw new Error('Failed to update order filled quantity');
    }
  }

  async getOpenOrdersBySymbol(symbol: string, limit = 100, client?: PoolClient): Promise<Order[]> {
    const query = `
      SELECT 
        id, user_id as "userId", client_order_id as "clientOrderId", 
        symbol, type::text, side::text, price, stop_price as "stopPrice", 
        quantity, filled_quantity as "filledQuantity", status::text, 
        time_in_force as "timeInForce", iceberg_quantity as "icebergQuantity",
        created_at as "createdAt", updated_at as "updatedAt", 
        closed_at as "closedAt"
      FROM orders 
      WHERE symbol = $1 
        AND status IN ($2, $3)
      ORDER BY 
        CASE WHEN side = 'BUY' THEN price END DESC,
        CASE WHEN side = 'SELL' THEN price END ASC,
        created_at ASC
      LIMIT $4
    `;

    try {
      const result = client
        ? await client.query<Order>(query, [
            symbol, 
            OrderStatus.OPEN, 
            OrderStatus.PARTIALLY_FILLED, 
            limit
          ])
        : await this.pool.query<Order>(query, [
            symbol, 
            OrderStatus.OPEN, 
            OrderStatus.PARTIALLY_FILLED, 
            limit
          ]);
      
      return result.rows.map(row => this.mapOrderFromDb(row));
    } catch (error) {
      console.error('Error fetching open orders by symbol:', error);
      throw new Error('Failed to fetch open orders');
    }
  }

  async getOrderBook(symbol: string, limit = 50, client?: PoolClient) {
    const query = `
      SELECT * FROM get_order_book($1, $2)
    `;

    try {
      const result = client
        ? await client.query(query, [symbol, limit])
        : await this.pool.query(query, [symbol, limit]);
      
      return {
        bids: result.rows.filter((row: any) => row.side === 'BUY'),
        asks: result.rows.filter((row: any) => row.side === 'SELL'),
        timestamp: new Date()
      };
    } catch (error) {
      console.error('Error fetching order book:', error);
      throw new Error('Failed to fetch order book');
    }
  }

  private mapOrderFromDb(row: any): Order {
    return {
      ...row,
      type: row.type as OrderType,
      side: row.side as OrderSide,
      status: row.status as OrderStatus,
      timeInForce: row.timeInForce as TimeInForce,
      createdAt: new Date(row.createdAt),
      updatedAt: new Date(row.updatedAt),
      closedAt: row.closedAt ? new Date(row.closedAt) : undefined,
    };
  }
}

export const orderModel = new OrderModel();
