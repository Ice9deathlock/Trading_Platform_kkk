import { Pool, PoolClient, QueryResult } from 'pg';
import { pool } from '../config/database';

export enum TransactionType {
  DEPOSIT = 'DEPOSIT',
  WITHDRAWAL = 'WITHDRAWAL',
}

export enum TransactionStatus {
  PENDING = 'PENDING',
  COMPLETED = 'COMPLETED',
  FAILED = 'FAILED',
  CANCELLED = 'CANCELLED',
}

export interface AccountBalance {
  id: string;
  userId: string;
  asset: string;
  freeBalance: number;
  lockedBalance: number;
  updatedAt: Date;
}

export interface AccountTransaction {
  id: string;
  userId: string;
  type: TransactionType;
  asset: string;
  amount: number;
  fee: number;
  address?: string;
  txHash?: string;
  status: TransactionStatus;
  createdAt: Date;
  updatedAt: Date;
}

export class AccountModel {
  private pool: Pool;

  constructor() {
    this.pool = pool;
  }

  // Account Balance Methods

  async getBalance(userId: string, asset: string, client?: PoolClient): Promise<AccountBalance | null> {
    const query = `
      SELECT 
        id, user_id as "userId", asset, 
        free_balance as "freeBalance", 
        locked_balance as "lockedBalance",
        updated_at as "updatedAt"
      FROM account_balances 
      WHERE user_id = $1 AND asset = $2
    `;

    try {
      const result = client
        ? await client.query<AccountBalance>(query, [userId, asset])
        : await this.pool.query<AccountBalance>(query, [userId, asset]);
      
      return result.rows.length > 0 ? this.mapBalanceFromDb(result.rows[0]) : null;
    } catch (error) {
      console.error('Error fetching account balance:', error);
      throw new Error('Failed to fetch account balance');
    }
  }

  async getBalances(userId: string, client?: PoolClient): Promise<AccountBalance[]> {
    const query = `
      SELECT 
        id, user_id as "userId", asset, 
        free_balance as "freeBalance", 
        locked_balance as "lockedBalance",
        updated_at as "updatedAt"
      FROM account_balances 
      WHERE user_id = $1
      ORDER BY asset
    `;

    try {
      const result = client
        ? await client.query<AccountBalance>(query, [userId])
        : await this.pool.query<AccountBalance>(query, [userId]);
      
      return result.rows.map(row => this.mapBalanceFromDb(row));
    } catch (error) {
      console.error('Error fetching account balances:', error);
      throw new Error('Failed to fetch account balances');
    }
  }

  async updateBalance(
    userId: string, 
    asset: string, 
    updates: { freeBalance?: number; lockedBalance?: number },
    client: PoolClient
  ): Promise<AccountBalance> {
    const { freeBalance, lockedBalance } = updates;
    const updatesSet: string[] = [];
    const values: any[] = [userId, asset];
    let paramIndex = 3;

    if (freeBalance !== undefined) {
      updatesSet.push(`free_balance = $${paramIndex++}`);
      values.push(freeBalance);
    }

    if (lockedBalance !== undefined) {
      updatesSet.push(`locked_balance = $${paramIndex++}`);
      values.push(lockedBalance);
    }

    if (updatesSet.length === 0) {
      throw new Error('No updates provided');
    }

    const query = `
      INSERT INTO account_balances (user_id, asset, free_balance, locked_balance)
      VALUES ($1, $2, $3, $4)
      ON CONFLICT (user_id, asset) 
      DO UPDATE SET 
        ${updatesSet.join(', ')}, 
        updated_at = NOW()
      RETURNING 
        id, user_id as "userId", asset, 
        free_balance as "freeBalance", 
        locked_balance as "lockedBalance",
        updated_at as "updatedAt"
    `;

    // Add default values for insert case
    values.push(freeBalance ?? 0);
    values.push(lockedBalance ?? 0);

    try {
      const result = await client.query<AccountBalance>(query, values);
      
      if (result.rows.length === 0) {
        throw new Error('Failed to update balance');
      }
      
      return this.mapBalanceFromDb(result.rows[0]);
    } catch (error) {
      console.error('Error updating account balance:', error);
      throw new Error('Failed to update account balance');
    }
  }

  // Transaction Methods

  async createTransaction(
    transactionData: Omit<AccountTransaction, 'id' | 'createdAt' | 'updatedAt' | 'status'>,
    client?: PoolClient
  ): Promise<AccountTransaction> {
    const query = `
      INSERT INTO account_transactions (
        id, user_id, type, asset, amount, fee, address, tx_hash, status
      ) 
      VALUES (uuid_generate_v4(), $1, $2, $3, $4, $5, $6, $7, $8)
      RETURNING 
        id, user_id as "userId", type::text, asset, amount, fee, 
        address, tx_hash as "txHash", status::text,
        created_at as "createdAt", updated_at as "updatedAt"
    `;

    const values = [
      transactionData.userId,
      transactionData.type,
      transactionData.asset,
      transactionData.amount,
      transactionData.fee || 0,
      transactionData.address || null,
      transactionData.txHash || null,
      TransactionStatus.PENDING
    ];

    try {
      const result = client 
        ? await client.query<AccountTransaction>(query, values)
        : await this.pool.query<AccountTransaction>(query, values);
      
      return this.mapTransactionFromDb(result.rows[0]);
    } catch (error) {
      console.error('Error creating transaction:', error);
      throw new Error('Failed to create transaction');
    }
  }

  async getTransactionById(transactionId: string, userId: string, client?: PoolClient): Promise<AccountTransaction | null> {
    const query = `
      SELECT 
        id, user_id as "userId", type::text, asset, amount, fee, 
        address, tx_hash as "txHash", status::text,
        created_at as "createdAt", updated_at as "updatedAt"
      FROM account_transactions 
      WHERE id = $1 AND user_id = $2
    `;

    try {
      const result = client
        ? await client.query<AccountTransaction>(query, [transactionId, userId])
        : await this.pool.query<AccountTransaction>(query, [transactionId, userId]);
      
      return result.rows.length > 0 ? this.mapTransactionFromDb(result.rows[0]) : null;
    } catch (error) {
      console.error('Error fetching transaction:', error);
      throw new Error('Failed to fetch transaction');
    }
  }

  async updateTransactionStatus(
    transactionId: string, 
    status: TransactionStatus,
    client?: PoolClient
  ): Promise<AccountTransaction | null> {
    const query = `
      UPDATE account_transactions 
      SET status = $1, updated_at = NOW()
      WHERE id = $2
      RETURNING 
        id, user_id as "userId", type::text, asset, amount, fee, 
        address, tx_hash as "txHash", status::text,
        created_at as "createdAt", updated_at as "updatedAt"
    `;

    try {
      const result = client
        ? await client.query<AccountTransaction>(query, [status, transactionId])
        : await this.pool.query<AccountTransaction>(query, [status, transactionId]);
      
      return result.rows.length > 0 ? this.mapTransactionFromDb(result.rows[0]) : null;
    } catch (error) {
      console.error('Error updating transaction status:', error);
      throw new Error('Failed to update transaction status');
    }
  }

  async getTransactionsByUserId(
    userId: string, 
    filters: {
      type?: TransactionType;
      asset?: string;
      status?: TransactionStatus;
      startDate?: Date;
      endDate?: Date;
      limit?: number;
      offset?: number;
    } = {},
    client?: PoolClient
  ): Promise<{ transactions: AccountTransaction[]; total: number }> {
    const { 
      type, 
      asset, 
      status, 
      startDate, 
      endDate, 
      limit = 50, 
      offset = 0 
    } = filters;

    const conditions: string[] = ['user_id = $1'];
    const values: any[] = [userId];
    let paramIndex = 2;

    if (type) {
      conditions.push(`type = $${paramIndex++}`);
      values.push(type);
    }

    if (asset) {
      conditions.push(`asset = $${paramIndex++}`);
      values.push(asset);
    }

    if (status) {
      conditions.push(`status = $${paramIndex++}`);
      values.push(status);
    }

    if (startDate) {
      conditions.push(`created_at >= $${paramIndex++}`);
      values.push(startDate);
    }

    if (endDate) {
      conditions.push(`created_at <= $${paramIndex++}`);
      values.push(endDate);
    }

    const whereClause = conditions.length > 0 ? `WHERE ${conditions.join(' AND ')}` : '';

    // Query for transactions
    const query = `
      SELECT 
        id, user_id as "userId", type::text, asset, amount, fee, 
        address, tx_hash as "txHash", status::text,
        created_at as "createdAt", updated_at as "updatedAt"
      FROM account_transactions 
      ${whereClause}
      ORDER BY created_at DESC
      LIMIT $${paramIndex} OFFSET $${paramIndex + 1}
    `;

    // Query for total count
    const countQuery = `
      SELECT COUNT(*) as total
      FROM account_transactions 
      ${whereClause}
    `;

    try {
      const [result, countResult] = await Promise.all([
        client
          ? client.query<AccountTransaction>(query, [...values, limit, offset])
          : this.pool.query<AccountTransaction>(query, [...values, limit, offset]),
        client
          ? client.query<{ total: string }>(countQuery, values)
          : this.pool.query<{ total: string }>(countQuery, values)
      ]);
      
      return {
        transactions: result.rows.map(row => this.mapTransactionFromDb(row)),
        total: parseInt(countResult.rows[0]?.total || '0', 10)
      };
    } catch (error) {
      console.error('Error fetching transactions:', error);
      throw new Error('Failed to fetch transactions');
    }
  }

  // Helper methods for mapping database rows to model instances

  private mapBalanceFromDb(row: any): AccountBalance {
    return {
      ...row,
      freeBalance: parseFloat(row.freeBalance),
      lockedBalance: parseFloat(row.lockedBalance),
      updatedAt: new Date(row.updatedAt),
    };
  }

  private mapTransactionFromDb(row: any): AccountTransaction {
    return {
      ...row,
      type: row.type as TransactionType,
      status: row.status as TransactionStatus,
      amount: parseFloat(row.amount),
      fee: parseFloat(row.fee),
      createdAt: new Date(row.createdAt),
      updatedAt: new Date(row.updatedAt),
    };
  }
}

export const accountModel = new AccountModel();
