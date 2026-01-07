import { pool } from '../config/database';
import bcrypt from 'bcryptjs';
import { v4 as uuidv4 } from 'uuid';
import { logger } from '../utils/logger';

export interface User {
  id?: string;
  email: string;
  password: string;
  first_name?: string;
  last_name?: string;
  role?: string;
  is_active?: boolean;
  is_email_verified?: boolean;
  email_verification_token?: string | null;
  email_verification_expires?: Date | null;
  password_reset_token?: string | null;
  password_reset_expires?: Date | null;
  created_at?: Date;
  updated_at?: Date;
}

const SALT_ROUNDS = 10;

class UserModel {
  // Create a new user
  static async create(user: Omit<User, 'id' | 'created_at' | 'updated_at'>): Promise<User> {
    try {
      const hashedPassword = await bcrypt.hash(user.password, SALT_ROUNDS);
      const emailVerificationToken = uuidv4();
      const emailVerificationExpires = new Date();
      emailVerificationExpires.setHours(emailVerificationExpires.getHours() + 24); // 24 hours expiration
      
      const query = `
        INSERT INTO users (
          email, 
          password, 
          first_name, 
          last_name, 
          is_active, 
          is_email_verified,
          email_verification_token,
          email_verification_expires
        )
        VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
        RETURNING 
          id, email, first_name, last_name, 
          is_active, is_email_verified, created_at, updated_at
      `;
      
      const values = [
        user.email.toLowerCase(),
        hashedPassword,
        user.first_name || null,
        user.last_name || null,
        false, // User is not active until email is verified
        false, // Email not verified yet
        emailVerificationToken,
        emailVerificationExpires
      ];
      
      const result = await pool.query(query, values);
      return result.rows[0];
    } catch (error) {
      logger.error('Error creating user:', error);
      throw error;
    }
  }

  // Find user by email
  static async findByEmail(email: string): Promise<User | null> {
    try {
      const query = 'SELECT * FROM users WHERE email = $1';
      const result = await pool.query(query, [email.toLowerCase()]);
      return result.rows[0] || null;
    } catch (error) {
      logger.error('Error finding user by email:', error);
      throw error;
    }
  }

  // Find user by verification token
  static async findByVerificationToken(token: string): Promise<User | null> {
    try {
      const query = 'SELECT * FROM users WHERE email_verification_token = $1';
      const result = await pool.query(query, [token]);
      return result.rows[0] || null;
    } catch (error) {
      logger.error('Error finding user by verification token:', error);
      throw error;
    }
  }

  // Find user by password reset token
  static async findByPasswordResetToken(token: string): Promise<User | null> {
    try {
      const query = 'SELECT * FROM users WHERE password_reset_token = $1 AND password_reset_expires > NOW()';
      const result = await pool.query(query, [token]);
      return result.rows[0] || null;
    } catch (error) {
      logger.error('Error finding user by password reset token:', error);
      throw error;
    }
  }

  // Verify user email
  static async verifyEmail(userId: string): Promise<void> {
    try {
      const query = `
        UPDATE users 
        SET is_email_verified = true, 
            is_active = true,
            email_verification_token = NULL,
            email_verification_expires = NULL,
            updated_at = NOW()
        WHERE id = $1
      `;
      await pool.query(query, [userId]);
    } catch (error) {
      logger.error('Error verifying user email:', error);
      throw error;
    }
  }

  // Create password reset token
  static async createPasswordResetToken(email: string): Promise<string | null> {
    try {
      const user = await this.findByEmail(email);
      if (!user) return null;

      const resetToken = uuidv4();
      const resetExpires = new Date();
      resetExpires.setHours(resetExpires.getHours() + 1); // 1 hour expiration

      const query = `
        UPDATE users 
        SET password_reset_token = $1,
            password_reset_expires = $2,
            updated_at = NOW()
        WHERE id = $3
        RETURNING password_reset_token
      `;

      const result = await pool.query(query, [resetToken, resetExpires, user.id]);
      return result.rows[0].password_reset_token;
    } catch (error) {
      logger.error('Error creating password reset token:', error);
      throw error;
    }
  }

  // Reset password
  static async resetPassword(token: string, newPassword: string): Promise<boolean> {
    try {
      const hashedPassword = await bcrypt.hash(newPassword, SALT_ROUNDS);
      
      const query = `
        UPDATE users 
        SET password = $1,
            password_reset_token = NULL,
            password_reset_expires = NULL,
            updated_at = NOW()
        WHERE password_reset_token = $2
        AND password_reset_expires > NOW()
        RETURNING id
      `;

      const result = await pool.query(query, [hashedPassword, token]);
      return (result.rowCount ?? 0) > 0;
    } catch (error) {
      logger.error('Error resetting password:', error);
      throw error;
    }
  }

  // Find user by ID
  static async findById(id: string): Promise<User | null> {
    try {
      const query = 'SELECT * FROM users WHERE id = $1';
      const result = await pool.query(query, [id]);
      return result.rows[0] || null;
    } catch (error) {
      logger.error('Error finding user by ID:', error);
      throw error;
    }
  }

  // Verify password
  static async verifyPassword(userPassword: string, hashedPassword: string): Promise<boolean> {
    try {
      return await bcrypt.compare(userPassword, hashedPassword);
    } catch (error) {
      logger.error('Error verifying password:', error);
      throw error;
    }
  }


  // Update user profile - wrapper around update with specific field restrictions
  static async updateProfile(
    userId: string, 
    updates: Partial<Pick<User, 'first_name' | 'last_name' | 'email'>>
  ): Promise<User | null> {
    return this.update(userId, updates);
  }

  // Generic update method for user
  static async update(
    id: string, 
    updates: Partial<Omit<User, 'id' | 'password' | 'created_at' | 'updated_at'>>
  ): Promise<User | null> {
    try {
      const updateFields: string[] = [];
      const values: any[] = [];
      let paramIndex = 1;

      // Build dynamic update query
      for (const [key, value] of Object.entries(updates)) {
        if (value !== undefined) {
          updateFields.push(`${key} = $${paramIndex}`);
          values.push(value);
          paramIndex++;
        }
      }

      if (updateFields.length === 0) {
        throw new Error('No valid fields to update');
      }

      values.push(id);
      const query = `
        UPDATE users
        SET ${updateFields.join(', ')}, updated_at = NOW()
        WHERE id = $${paramIndex}
        RETURNING *
      `;

      const { rows } = await pool.query(query, values);
      return rows[0] || null;
    } catch (error) {
      logger.error('Error updating user:', error);
      throw error;
    }
  }

  // Update user password
  static async updatePassword(userId: string, newPassword: string): Promise<void> {
    try {
      const hashedPassword = await bcrypt.hash(newPassword, SALT_ROUNDS);
      await pool.query(
        'UPDATE users SET password = $1, updated_at = NOW() WHERE id = $2',
        [hashedPassword, userId]
      );
    } catch (error) {
      logger.error('Error updating password:', error);
      throw error;
    }
  }

  // Compare passwords
  static async comparePasswords(candidatePassword: string, hashedPassword: string): Promise<boolean> {
    return bcrypt.compare(candidatePassword, hashedPassword);
  }

  // Get user by ID
  static async getUserById(id: string): Promise<User | null> {
    try {
      const query = 'SELECT * FROM users WHERE id = $1';
      const result = await pool.query(query, [id]);
      return result.rows[0] || null;
    } catch (error) {
      logger.error('Error finding user by ID:', error);
      throw error;
    }
  }
}

export default UserModel;
