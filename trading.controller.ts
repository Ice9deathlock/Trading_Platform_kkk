import { Request, Response, NextFunction } from 'express';
import { validationResult } from 'express-validator';
import { v4 as uuidv4 } from 'uuid';
import { tradingService } from '../services/trading.service';
import { logger } from '../utils/logger';
import { OrderType, OrderSide, OrderStatus, TimeInForce } from '../models/order.model';

export const createOrder = async (req: Request, res: Response, next: NextFunction) => {
  try {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({ errors: errors.array() });
    }

    const userId = req.user?.id; // Make userId optional with '?'
    if (!userId) {
      return res.status(401).json({
        success: false,
        message: 'User not authenticated',
      });
    }

    const {
      symbol,
      type,
      side,
      price,
      quantity,
      clientOrderId,
      timeInForce,
      stopPrice,
      icebergQty
    } = req.body;

    // Prepare order data with all required fields
    const orderData = {
      userId,
      symbol,
      type: type as OrderType,
      side: side as OrderSide,
      price: parseFloat(price) || 0,
      quantity: parseFloat(quantity) || 0,
      timeInForce: (timeInForce as TimeInForce) || TimeInForce.GTC,
      clientOrderId: clientOrderId,
      stopPrice: stopPrice ? parseFloat(stopPrice) : undefined,
      icebergQuantity: icebergQty ? parseFloat(icebergQty) : undefined,
    };

    // Create the order using the service
    const order = await tradingService.createOrder(orderData);
    res.status(201).json({
      success: true,
      data: order,
      message: 'Order created successfully'
    });
  } catch (error: any) {
    next({
      status: error.status || 500,
      message: error.message || 'Failed to create order',
      details: process.env.NODE_ENV === 'development' ? error.stack : undefined
    });
  }
};

export const cancelOrder = async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { orderId } = req.params;
    const userId = req.user?.id;

    await tradingService.cancelOrder(orderId, userId);
    
    res.status(200).json({
      success: true,
      message: 'Order cancelled successfully',
      orderId
    });
  } catch (error: any) {
    next({
      status: error.status || 500,
      message: error.message || 'Failed to cancel order',
      details: process.env.NODE_ENV === 'development' ? error.stack : undefined
    });
  }
};

export const getOrder = async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { orderId } = req.params;
    const userId = req.user?.id;

    const order = await tradingService.getOrder(orderId, userId);
    
    if (!order) {
      return res.status(404).json({
        success: false,
        message: 'Order not found'
      });
    }

    res.status(200).json({
      success: true,
      data: order
    });
  } catch (error: any) {
    next({
      status: error.status || 500,
      message: error.message || 'Failed to fetch order',
      details: process.env.NODE_ENV === 'development' ? error.stack : undefined
    });
  }
};

export const getOrderBook = async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { symbol } = req.params;
    const limit = parseInt(req.query.limit as string) || 50;

    const orderBook = await tradingService.getOrderBook(symbol, limit);
    
    res.status(200).json({
      success: true,
      data: orderBook,
      timestamp: new Date().toISOString()
    });
  } catch (error: any) {
    next({
      status: error.status || 500,
      message: error.message || 'Failed to fetch order book',
      details: process.env.NODE_ENV === 'development' ? error.stack : undefined
    });
  }
};

export const getTrades = async (req: Request, res: Response, next: NextFunction) => {
  try {
    const userId = req.user?.id;
    const { symbol } = req.query;
    const limit = parseInt(req.query.limit as string) || 100;

    const trades = await tradingService.getTrades(
      userId,
      symbol as string | undefined, 
      limit
    );
    
    res.status(200).json({
      success: true,
      count: trades.length,
      data: trades
    });
  } catch (error: any) {
    next({
      status: error.status || 500,
      message: error.message || 'Failed to fetch trades',
      details: process.env.NODE_ENV === 'development' ? error.stack : undefined
    });
  }
};

export const getBalances = async (req: Request, res: Response, next: NextFunction) => {
  try {
    const userId = req.user?.id;
    const balances = await tradingService.getBalances(userId);
    
    res.status(200).json({
      success: true,
      data: balances
    });
  } catch (error: any) {
    next({
      status: error.status || 500,
      message: error.message || 'Failed to fetch balances',
      details: process.env.NODE_ENV === 'development' ? error.stack : undefined
    });
  }
};

export const depositFunds = async (req: Request, res: Response, next: NextFunction) => {
  try {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({ errors: errors.array() });
    }

    const userId = req.user?.id;
    const { asset, amount } = req.body;

    const transaction = await tradingService.depositFunds(userId, asset, amount);
    
    res.status(201).json({
      success: true,
      data: transaction,
      message: 'Deposit initiated successfully'
    });
  } catch (error: any) {
    next({
      status: error.status || 500,
      message: error.message || 'Failed to process deposit',
      details: process.env.NODE_ENV === 'development' ? error.stack : undefined
    });
  }
};

export const withdrawFunds = async (req: Request, res: Response, next: NextFunction) => {
  try {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({ errors: errors.array() });
    }

    const userId = req.user?.id;
    const { asset, amount, address } = req.body;

    const transaction = await tradingService.withdrawFunds(userId, asset, amount, address);
    
    res.status(201).json({
      success: true,
      data: transaction,
      message: 'Withdrawal request received and is being processed'
    });
  } catch (error: any) {
    next({
      status: error.status || 500,
      message: error.message || 'Failed to process withdrawal',
      details: process.env.NODE_ENV === 'development' ? error.stack : undefined
    });
  }
};

// WebSocket handler for real-time updates
export const handleWebSocketConnection = (ws: any, req: any) => {
  // Authentication
  const token = req.headers['sec-websocket-protocol'] || '';
  // Verify token and get user ID (implementation depends on your auth system)
  // const userId = verifyToken(token);
  
  // If authentication fails, close the connection
  // if (!userId) {
  //   return ws.close(4001, 'Authentication failed');
  // }

  const subscriptions = {
    orders: new Set<string>(), // orderIds
    orderBooks: new Set<string>(), // symbols
    trades: new Set<string>(), // symbols
  };

  // Send initial connection confirmation
  ws.send(JSON.stringify({
    type: 'connection_established',
    timestamp: new Date().toISOString()
  }));

  // Handle WebSocket messages
  ws.on('message', (message: string) => {
    try {
      const data = JSON.parse(message);
      
      switch (data.type) {
        case 'order':
          if (data.userId === req.user?.id) {
            // Handle order updates
            ws.send(JSON.stringify({
              type: 'order_update',
              data: data
            }));
          }
          break;
        case 'subscribe':
          // Handle subscription requests
          if (data.channel) {
            if (data.channel === 'orderBook' && data.symbol) {
              // Subscribe to order book updates for a specific symbol
              if (!subscriptions.orderBooks.has(data.symbol)) {
                subscriptions.orderBooks.add(data.symbol);
                ws.send(JSON.stringify({
                  type: 'subscribed',
                  channel: 'orderBook',
                  symbol: data.symbol
                }));
              }
            } else if (data.channel === 'trades' && data.symbol) {
              // Subscribe to trade updates for a specific symbol
              if (!subscriptions.trades.has(data.symbol)) {
                subscriptions.trades.add(data.symbol);
                ws.send(JSON.stringify({
                  type: 'subscribed',
                  channel: 'trades',
                  symbol: data.symbol
                }));
              }
            } else if (data.channel === 'orders') {
              // Subscribe to user's order updates
              if (req.user?.id) {
                subscriptions.orders.add(req.user.id);
                ws.send(JSON.stringify({
                  type: 'subscribed',
                  channel: 'orders'
                }));
              }
            }
          }
          break;
        case 'unsubscribe':
          // Handle unsubscription requests
          if (data.channel) {
            if (data.channel === 'orderBook' && data.symbol) {
              subscriptions.orderBooks.delete(data.symbol);
            } else if (data.channel === 'trades' && data.symbol) {
              subscriptions.trades.delete(data.symbol);
            } else if (data.channel === 'orders' && req.user?.id) {
              subscriptions.orders.delete(req.user.id);
            }
            
            ws.send(JSON.stringify({
              type: 'unsubscribed',
              channel: data.channel,
              symbol: data.symbol
            }));
          }
          break;
        default:
          ws.send(JSON.stringify({
            type: 'error',
            message: 'Unknown message type'
          }));
      }
    } catch (error) {
      logger.error('Error processing WebSocket message:', error);
      ws.send(JSON.stringify({
        type: 'error',
        message: 'Invalid message format'
      }));
    }
  });
  
  // Handle WebSocket close
  ws.on('close', () => {
    logger.info(`WebSocket connection closed`);
    // Clean up subscriptions
  });
};

// Export all controller functions
export default {
  createOrder,
  cancelOrder,
  getOrder,
  getOrderBook,
  getTrades,
  getBalances,
  depositFunds,
  withdrawFunds,
  handleWebSocketConnection
};
