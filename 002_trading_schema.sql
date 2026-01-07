-- Enable UUID extension if not already enabled
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- Create order status type
CREATE TYPE order_status AS ENUM (
  'OPEN',
  'PARTIALLY_FILLED',
  'FILLED',
  'CANCELLED',
  'REJECTED',
  'EXPIRED'
);

-- Create order type
CREATE TYPE order_type AS ENUM (
  'MARKET',
  'LIMIT',
  'STOP',
  'STOP_LIMIT'
);

-- Create order side type
CREATE TYPE order_side AS ENUM (
  'BUY',
  'SELL'
);

-- Create time in force type
CREATE TYPE time_in_force AS ENUM (
  'GTC',  -- Good Till Cancelled
  'IOC',  -- Immediate or Cancel
  'FOK'   -- Fill or Kill
);

-- Orders table
CREATE TABLE IF NOT EXISTS orders (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  client_order_id VARCHAR(255) UNIQUE,
  symbol VARCHAR(20) NOT NULL,
  type order_type NOT NULL,
  side order_side NOT NULL,
  price DECIMAL(30, 10) NOT NULL,
  stop_price DECIMAL(30, 10),
  quantity DECIMAL(30, 10) NOT NULL,
  filled_quantity DECIMAL(30, 10) DEFAULT 0,
  status order_status NOT NULL DEFAULT 'OPEN',
  time_in_force time_in_force NOT NULL DEFAULT 'GTC',
  iceberg_quantity DECIMAL(30, 10),
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT CURRENT_TIMESTAMP,
  closed_at TIMESTAMP WITH TIME ZONE,
  
  -- Add indexes for common queries
  CONSTRAINT valid_quantity CHECK (quantity > 0),
  CONSTRAINT valid_filled_quantity CHECK (filled_quantity >= 0 AND filled_quantity <= quantity)
);

-- Indexes for orders table
CREATE INDEX idx_orders_user_id ON orders(user_id);
CREATE INDEX idx_orders_symbol ON orders(symbol);
CREATE INDEX idx_orders_status ON orders(status);
CREATE INDEX idx_orders_created_at ON orders(created_at);

-- Trades table
CREATE TABLE IF NOT EXISTS trades (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  order_id UUID NOT NULL REFERENCES orders(id) ON DELETE CASCADE,
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  symbol VARCHAR(20) NOT NULL,
  price DECIMAL(30, 10) NOT NULL,
  quantity DECIMAL(30, 10) NOT NULL,
  commission DECIMAL(30, 10) NOT NULL,
  commission_asset VARCHAR(10) NOT NULL,
  is_buyer BOOLEAN NOT NULL,
  is_maker BOOLEAN NOT NULL,
  is_best_match BOOLEAN NOT NULL,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT CURRENT_TIMESTAMP,
  
  -- Add constraints
  CONSTRAINT valid_trade_quantity CHECK (quantity > 0),
  CONSTRAINT valid_commission CHECK (commission >= 0)
);

-- Indexes for trades table
CREATE INDEX idx_trades_order_id ON trades(order_id);
CREATE INDEX idx_trades_user_id ON trades(user_id);
CREATE INDEX idx_trades_symbol ON trades(symbol);
CREATE INDEX idx_trades_created_at ON trades(created_at);

-- Order book snapshots (for historical data)
CREATE TABLE IF NOT EXISTS order_book_snapshots (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  symbol VARCHAR(20) NOT NULL,
  snapshot_time TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT CURRENT_TIMESTAMP,
  data JSONB NOT NULL
);

-- Index for order book snapshots
CREATE INDEX idx_order_book_snapshots_symbol ON order_book_snapshots(symbol);
CREATE INDEX idx_order_book_snapshots_time ON order_book_snapshots(snapshot_time);

-- Account balances
CREATE TABLE IF NOT EXISTS account_balances (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  asset VARCHAR(10) NOT NULL,
  free_balance DECIMAL(30, 10) NOT NULL DEFAULT 0,
  locked_balance DECIMAL(30, 10) NOT NULL DEFAULT 0,
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT CURRENT_TIMESTAMP,
  
  -- Add constraints
  CONSTRAINT valid_balances CHECK (free_balance >= 0 AND locked_balance >= 0),
  UNIQUE(user_id, asset)
);

-- Indexes for account balances
CREATE INDEX idx_account_balances_user_id ON account_balances(user_id);

-- Account transactions (deposits/withdrawals)
CREATE TYPE transaction_type AS ENUM ('DEPOSIT', 'WITHDRAWAL');
CREATE TYPE transaction_status AS ENUM ('PENDING', 'COMPLETED', 'FAILED', 'CANCELLED');

CREATE TABLE IF NOT EXISTS account_transactions (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  type transaction_type NOT NULL,
  asset VARCHAR(10) NOT NULL,
  amount DECIMAL(30, 10) NOT NULL,
  fee DECIMAL(30, 10) DEFAULT 0,
  address TEXT,
  tx_hash TEXT,
  status transaction_status NOT NULL DEFAULT 'PENDING',
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT CURRENT_TIMESTAMP,
  
  -- Add constraints
  CONSTRAINT valid_amount CHECK (amount > 0),
  CONSTRAINT valid_fee CHECK (fee >= 0)
);

-- Indexes for account transactions
CREATE INDEX idx_account_transactions_user_id ON account_transactions(user_id);
CREATE INDEX idx_account_transactions_status ON account_transactions(status);

-- Function to update the updated_at column
CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Triggers for updating timestamps
CREATE TRIGGER update_orders_updated_at
BEFORE UPDATE ON orders
FOR EACH ROW
EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_account_balances_updated_at
BEFORE UPDATE ON account_balances
FOR EACH ROW
EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_account_transactions_updated_at
BEFORE UPDATE ON account_transactions
FOR EACH ROW
EXECUTE FUNCTION update_updated_at_column();

-- Function to handle order fills and update balances
CREATE OR REPLACE FUNCTION process_order_fill()
RETURNS TRIGGER AS $$
DECLARE
  base_asset VARCHAR(10);
  quote_asset VARCHAR(10);
  trade_amount DECIMAL(30, 10);
  trade_value DECIMAL(30, 10);
  commission_amount DECIMAL(30, 10);
  base_balance_id UUID;
  quote_balance_id UUID;
  base_balance RECORD;
  quote_balance RECORD;
  user_id_val UUID;
  symbol_val VARCHAR(20);
  order_side_val order_side;
  price_val DECIMAL(30, 10);
  quantity_val DECIMAL(30, 10);
  commission_asset_val VARCHAR(10);
  commission_val DECIMAL(30, 10);
  is_maker_val BOOLEAN;
  is_buyer_val BOOLEAN;
  order_id_val UUID;
  trade_id_val UUID;
  trade_record RECORD;
BEGIN
  -- Only process if this is an update to the filled_quantity
  IF NEW.filled_quantity = OLD.filled_quantity THEN
    RETURN NEW;
  END IF;

  -- Get order details
  SELECT user_id, symbol, side, price, quantity, filled_quantity
  INTO user_id_val, symbol_val, order_side_val, price_val, quantity_val, quantity_val
  FROM orders
  WHERE id = NEW.id;

  -- Extract base and quote assets (assuming format like 'BTCUSDT')
  base_asset := RIGHT(symbol_val, LENGTH(symbol_val) - 3);
  quote_asset := LEFT(symbol_val, 3);
  
  -- Calculate trade amount and value
  trade_amount := NEW.filled_quantity - OLD.filled_quantity;
  trade_value := trade_amount * price_val;
  
  -- For simplicity, using a fixed commission rate of 0.1%
  commission_asset_val := quote_asset;
  commission_val := trade_value * 0.001; -- 0.1% commission
  
  -- Determine if this is a maker or taker trade (simplified)
  is_maker_val := (SELECT COUNT(*) > 0 FROM orders WHERE symbol = symbol_val AND 
                  ((side = 'BUY' AND price >= price_val) OR 
                   (side = 'SELL' AND price <= price_val)) 
                  AND id != NEW.id);
  
  is_buyer_val := (order_side_val = 'BUY');
  order_id_val := NEW.id;

  -- Create trade record
  INSERT INTO trades (
    order_id, user_id, symbol, price, quantity, commission, 
    commission_asset, is_buyer, is_maker, is_best_match
  ) VALUES (
    order_id_val, user_id_val, symbol_val, price_val, trade_amount, 
    commission_val, commission_asset_val, is_buyer_val, is_maker_val, true
  )
  RETURNING id INTO trade_id_val;

  -- Get current balances
  SELECT * INTO base_balance 
  FROM account_balances 
  WHERE user_id = user_id_val AND asset = base_asset
  FOR UPDATE;
  
  SELECT * INTO quote_balance 
  FROM account_balances 
  WHERE user_id = user_id_val AND asset = quote_asset
  FOR UPDATE;

  -- Update balances based on trade
  IF order_side_val = 'BUY' THEN
    -- For BUY orders, increase base asset, decrease quote asset
    IF base_balance IS NULL THEN
      INSERT INTO account_balances (user_id, asset, free_balance, locked_balance)
      VALUES (user_id_val, base_asset, trade_amount - commission_val, 0);
    ELSE
      UPDATE account_balances 
      SET free_balance = free_balance + trade_amount - commission_val
      WHERE user_id = user_id_val AND asset = base_asset;
    END IF;

    IF quote_balance IS NULL THEN
      RAISE EXCEPTION 'Insufficient quote balance';
    ELSE
      UPDATE account_balances 
      SET locked_balance = locked_balance - trade_value
      WHERE user_id = user_id_val AND asset = quote_asset
      AND locked_balance >= trade_value;
    END IF;
  ELSE
    -- For SELL orders, increase quote asset, decrease base asset
    IF quote_balance IS NULL THEN
      INSERT INTO account_balances (user_id, asset, free_balance, locked_balance)
      VALUES (user_id_val, quote_asset, trade_value - commission_val, 0);
    ELSE
      UPDATE account_balances 
      SET free_balance = free_balance + trade_value - commission_val
      WHERE user_id = user_id_val AND asset = quote_asset;
    END IF;

    IF base_balance IS NULL THEN
      RAISE EXCEPTION 'Insufficient base balance';
    ELSE
      UPDATE account_balances 
      SET locked_balance = locked_balance - trade_amount
      WHERE user_id = user_id_val AND asset = base_asset
      AND locked_balance >= trade_amount;
    END IF;
  END IF;

  -- Update order status if completely filled
  IF NEW.filled_quantity = NEW.quantity THEN
    NEW.status := 'FILLED';
    NEW.closed_at := NOW();
  ELSIF NEW.filled_quantity > 0 THEN
    NEW.status := 'PARTIALLY_FILLED';
  END IF;

  RETURN NEW;
EXCEPTION
  WHEN OTHERS THEN
    -- Log the error
    RAISE WARNING 'Error processing order fill: %', SQLERRM;
    -- Re-raise the exception
    RAISE;
END;
$$ LANGUAGE plpgsql;

-- Create trigger for order fills
CREATE TRIGGER process_order_fill_trigger
AFTER UPDATE OF filled_quantity ON orders
FOR EACH ROW
WHEN (NEW.filled_quantity > OLD.filled_quantity)
EXECUTE FUNCTION process_order_fill();

-- Function to lock funds when an order is created
CREATE OR REPLACE FUNCTION lock_order_funds()
RETURNS TRIGGER AS $$
DECLARE
  base_asset VARCHAR(10);
  quote_asset VARCHAR(10);
  amount_to_lock DECIMAL(30, 10);
  asset_to_lock VARCHAR(10);
  current_balance RECORD;
BEGIN
  -- Extract base and quote assets (assuming format like 'BTCUSDT')
  base_asset := RIGHT(NEW.symbol, LENGTH(NEW.symbol) - 3);
  quote_asset := LEFT(NEW.symbol, 3);
  
  -- Determine which asset to lock and how much
  IF NEW.side = 'BUY' THEN
    -- For BUY orders, lock quote currency (e.g., USDT)
    asset_to_lock := quote_asset;
    amount_to_lock := NEW.price * NEW.quantity;
  ELSE
    -- For SELL orders, lock base currency (e.g., BTC)
    asset_to_lock := base_asset;
    amount_to_lock := NEW.quantity;
  END IF;
  
  -- Get current balance with FOR UPDATE to lock the row
  SELECT * INTO current_balance 
  FROM account_balances 
  WHERE user_id = NEW.user_id AND asset = asset_to_lock
  FOR UPDATE;
  
  -- Check if user has sufficient balance
  IF current_balance IS NULL OR current_balance.free_balance < amount_to_lock THEN
    RAISE EXCEPTION 'Insufficient balance for order';
  END IF;
  
  -- Lock the funds
  UPDATE account_balances
  SET 
    free_balance = free_balance - amount_to_lock,
    locked_balance = COALESCE(locked_balance, 0) + amount_to_lock
  WHERE user_id = NEW.user_id AND asset = asset_to_lock;
  
  RETURN NEW;
EXCEPTION
  WHEN OTHERS THEN
    -- Log the error
    RAISE WARNING 'Error locking funds for order: %', SQLERRM;
    -- Re-raise the exception
    RAISE;
END;
$$ LANGUAGE plpgsql;

-- Create trigger for locking funds
CREATE TRIGGER lock_order_funds_trigger
BEFORE INSERT ON orders
FOR EACH ROW
EXECUTE FUNCTION lock_order_funds();

-- Function to unlock funds when an order is cancelled
CREATE OR REPLACE FUNCTION unlock_order_funds()
RETURNS TRIGGER AS $$
DECLARE
  base_asset VARCHAR(10);
  quote_asset VARCHAR(10);
  amount_to_unlock DECIMAL(30, 10);
  asset_to_unlock VARCHAR(10);
  filled_value DECIMAL(30, 10);
  remaining_quantity DECIMAL(30, 10);
BEGIN
  -- Only process if order is being cancelled
  IF NEW.status != 'CANCELLED' OR OLD.status = 'CANCELLED' THEN
    RETURN NEW;
  END IF;
  
  -- Extract base and quote assets (assuming format like 'BTCUSDT')
  base_asset := RIGHT(NEW.symbol, LENGTH(NEW.symbol) - 3);
  quote_asset := LEFT(NEW.symbol, 3);
  
  -- Calculate remaining quantity to unlock
  remaining_quantity := NEW.quantity - NEW.filled_quantity;
  
  IF remaining_quantity <= 0 THEN
    RETURN NEW; -- No funds to unlock
  END IF;
  
  -- Determine which asset to unlock and how much
  IF NEW.side = 'BUY' THEN
    -- For BUY orders, unlock remaining quote currency (e.g., USDT)
    asset_to_unlock := quote_asset;
    amount_to_unlock := NEW.price * remaining_quantity;
  ELSE
    -- For SELL orders, unlock remaining base currency (e.g., BTC)
    asset_to_unlock := base_asset;
    amount_to_unlock := remaining_quantity;
  END IF;
  
  -- Unlock the funds
  UPDATE account_balances
  SET 
    locked_balance = locked_balance - amount_to_unlock,
    free_balance = free_balance + amount_to_unlock
  WHERE user_id = NEW.user_id AND asset = asset_to_unlock;
  
  RETURN NEW;
EXCEPTION
  WHEN OTHERS THEN
    -- Log the error but don't fail the operation
    RAISE WARNING 'Error unlocking funds for cancelled order: %', SQLERRM;
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Create trigger for unlocking funds
CREATE TRIGGER unlock_order_funds_trigger
BEFORE UPDATE ON orders
FOR EACH ROW
WHEN (NEW.status = 'CANCELLED' AND OLD.status != 'CANCELLED')
EXECUTE FUNCTION unlock_order_funds();

-- Create a function to get the current order book
CREATE OR REPLACE FUNCTION get_order_book(
  p_symbol VARCHAR(20),
  p_limit INTEGER DEFAULT 100
) 
RETURNS TABLE(
  price DECIMAL(30, 10),
  quantity DECIMAL(30, 10),
  side order_side,
  order_count BIGINT
) AS $$
BEGIN
  -- Return bids (BUY orders)
  RETURN QUERY
  SELECT 
    price,
    SUM(quantity - filled_quantity) AS quantity,
    'BUY'::order_side AS side,
    COUNT(*) AS order_count
  FROM orders
  WHERE 
    symbol = p_symbol 
    AND side = 'BUY' 
    AND status IN ('OPEN', 'PARTIALLY_FILLED')
  GROUP BY price
  ORDER BY price DESC
  LIMIT p_limit
  
  UNION ALL
  
  -- Return asks (SELL orders)
  SELECT 
    price,
    SUM(quantity - filled_quantity) AS quantity,
    'SELL'::order_side AS side,
    COUNT(*) AS order_count
  FROM orders
  WHERE 
    symbol = p_symbol 
    AND side = 'SELL' 
    AND status IN ('OPEN', 'PARTIALLY_FILLED')
  GROUP BY price
  ORDER BY price ASC
  LIMIT p_limit;
END;
$$ LANGUAGE plpgsql;
