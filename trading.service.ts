import { v4 as uuidv4 } from 'uuid';
import { PoolClient } from 'pg';
import { Kafka, Producer, Consumer, KafkaMessage } from 'kafkajs';
import { getWebSocketService } from './websocket.service';
import { pool } from '../config/database';
import { 
  OrderType, 
  OrderSide, 
  OrderStatus, 
  TimeInForce,
  Order,
  Trade,
  orderModel,
  tradeModel,
  accountModel,
  TransactionType,
  TransactionStatus
} from '../models';

class TradingService {
  private kafka: Kafka;
  private producer: Producer;
  private consumer: Consumer;
  private orderBooks: Map<string, { bids: Order[]; asks: Order[] }> = new Map();

  constructor() {
    // Initialize Kafka
    this.kafka = new Kafka({
      clientId: 'trading-service',
      brokers: [process.env.KAFKA_BROKER || 'localhost:9092'],
    });

    this.producer = this.kafka.producer();
    this.consumer = this.kafka.consumer({ groupId: 'trading-group' });

    // Initialize Kafka consumers
    this.initializeConsumers();
  }

  private async initializeConsumers() {
    await this.consumer.connect();
    
    // Subscribe to topics
    await this.consumer.subscribe({ topic: 'new-orders', fromBeginning: true });
    await this.consumer.subscribe({ topic: 'cancel-orders', fromBeginning: true });

    // Process messages
    await this.consumer.run({
      eachMessage: async ({ topic, message }) => {
        const client = await pool.connect();
        
        try {
          await client.query('BEGIN');
          
          if (topic === 'new-orders') {
            await this.handleNewOrder(message, client);
          } else if (topic === 'cancel-orders') {
            await this.handleCancelOrder(message, client);
          }
          
          await client.query('COMMIT');
        } catch (error) {
          await client.query('ROLLBACK');
          console.error(`Error processing ${topic} message:`, error);
          
          // Publish error to error topic
          await this.producer.send({
            topic: 'trading-errors',
            messages: [{
              key: topic,
              value: JSON.stringify({
                error: error instanceof Error ? error.message : 'Unknown error',
                message: message.value?.toString(),
                timestamp: new Date().toISOString()
              })
            }]
          });
        } finally {
          client.release();
        }
      },
    });
  }

  private async handleNewOrder(message: KafkaMessage, client: PoolClient) {
    const orderData = JSON.parse(message.value?.toString() || '{}');
    
    // Create the order in the database
    const order = await orderModel.createOrder({
      ...orderData,
      status: OrderStatus.OPEN,
      filledQuantity: 0,
    }, client);

    // Add to in-memory order book for matching
    await this.addToOrderBook(order, client);
    
    // Try to match orders
    await this.matchOrders(order.symbol, client);
    
    // Publish order update
    await this.publishOrderUpdate(order);
  }

  private async addToOrderBook(order: Order, client: PoolClient) {
    // Initialize order book for symbol if it doesn't exist
    if (!this.orderBooks.has(order.symbol)) {
      const openOrders = await orderModel.getOpenOrdersBySymbol(order.symbol, 1000, client);
      this.orderBooks.set(order.symbol, {
        bids: openOrders.filter(o => o.side === OrderSide.BUY),
        asks: openOrders.filter(o => o.side === OrderSide.SELL)
      });
    }
    
    const orderBook = this.orderBooks.get(order.symbol)!;
    
    // Add to the appropriate side of the order book
    if (order.side === OrderSide.BUY) {
      orderBook.bids.push(order);
      // Sort bids in descending order (highest price first)
      orderBook.bids.sort((a, b) => b.price - a.price);
    } else {
      orderBook.asks.push(order);
      // Sort asks in ascending order (lowest price first)
      orderBook.asks.sort((a, b) => a.price - b.price);
    }
  }

  private async matchOrders(symbol: string, client: PoolClient) {
    const orderBook = this.orderBooks.get(symbol);
    if (!orderBook) return;
    
    while (orderBook.bids.length > 0 && orderBook.asks.length > 0) {
      const bestBid = orderBook.bids[0];
      const bestAsk = orderBook.asks[0];
      
      // Check if there's a match (bid price >= ask price)
      if (bestBid.price >= bestAsk.price) {
        // Calculate the trade quantity (minimum of the two quantities)
        const quantity = Math.min(
          bestBid.quantity - bestBid.filledQuantity,
          bestAsk.quantity - bestAsk.filledQuantity
        );
        
        // Calculate the trade price (for now, use the ask price)
        const price = bestAsk.price;
        
        // Create a trade
        const trade: Omit<Trade, 'id' | 'createdAt'> = {
          orderId: bestBid.id,
          userId: bestBid.userId,
          symbol,
          price,
          quantity,
          commission: quantity * price * 0.001, // 0.1% commission
          commissionAsset: symbol.slice(-3), // Assuming the last 3 chars are the quote currency
          isBuyer: true,
          isMaker: false, // Simplified for this example
          isBestMatch: true,
        };
        
        // Save trade to database
        const createdTrade = await tradeModel.createTrade(trade, client);
        
        // Update the orders
        await orderModel.updateOrderFilledQuantity(
          bestBid.id, 
          bestBid.filledQuantity + quantity, 
          client
        );
        
        await orderModel.updateOrderFilledQuantity(
          bestAsk.id, 
          bestAsk.filledQuantity + quantity, 
          client
        );
        
        // Update account balances
        await this.updateBalancesForTrade(createdTrade, client);
        
        // Remove filled orders from order book
        if (bestBid.filledQuantity >= bestBid.quantity) {
          orderBook.bids.shift();
        }
        
        if (bestAsk.filledQuantity >= bestAsk.quantity) {
          orderBook.asks.shift();
        }
        
        // Publish trade and order updates
        await this.publishTrade(createdTrade);
        
        const updatedBid = await orderModel.getOrderById(bestBid.id, bestBid.userId, client);
        const updatedAsk = await orderModel.getOrderById(bestAsk.id, bestAsk.userId, client);
        
        if (updatedBid) await this.publishOrderUpdate(updatedBid);
        if (updatedAsk) await this.publishOrderUpdate(updatedAsk);
      } else {
        // No more matches
        break;
      }
    }
  }

  private async updateBalancesForTrade(trade: Trade, client: PoolClient) {
    const baseAsset = trade.symbol.slice(0, -3); // Assuming format like 'BTCUSDT'
    const quoteAsset = trade.symbol.slice(-3);
    
    // For the buyer (assuming trade.isBuyer is true for this example)
    await accountModel.updateBalance(
      trade.userId,
      baseAsset,
      { freeBalance: trade.quantity },
      client
    );
    
    // For the seller (simplified - in reality, you'd get this from the ask order)
    await accountModel.updateBalance(
      trade.userId,
      quoteAsset,
      { freeBalance: trade.price * trade.quantity },
      client
    );
  }

  private async handleCancelOrder(message: KafkaMessage, client: PoolClient) {
    const { orderId, userId } = JSON.parse(message.value?.toString() || '{}');
    
    // Cancel the order in the database
    const cancelledOrder = await orderModel.cancelOrder(orderId, userId, client);
    
    if (!cancelledOrder) {
      throw new Error('Order not found or already cancelled');
    }
    
    // Remove from in-memory order book
    const orderBook = this.orderBooks.get(cancelledOrder.symbol);
    if (orderBook) {
      if (cancelledOrder.side === OrderSide.BUY) {
        orderBook.bids = orderBook.bids.filter(o => o.id !== orderId);
      } else {
        orderBook.asks = orderBook.asks.filter(o => o.id !== orderId);
      }
    }
    
    // Publish order update
    await this.publishOrderUpdate(cancelledOrder);
    
    return true;
  }

  private async publishOrderUpdate(order: Order) {
    try {
      const webSocketService = getWebSocketService();
      webSocketService.broadcast('order', order.symbol, {
        type: 'order_update',
        data: order
      });
      
      if (this.producer) {
        await this.producer.send({
          topic: 'order-updates',
          messages: [{ value: JSON.stringify(order) }],
        });
      }
    } catch (error) {
      console.error('Error publishing order update:', error);
    }
  }
  
  private async publishTrade(trade: Trade) {
    try {
      const webSocketService = getWebSocketService();
      webSocketService.broadcast('trade', trade.symbol, {
        type: 'new_trade',
        data: trade
      });
      
      if (this.producer) {
        await this.producer.send({
          topic: 'trades',
          messages: [{ value: JSON.stringify(trade) }],
        });
      }
    } catch (error) {
      console.error('Error publishing trade:', error);
    }
  }

  public async createOrder(orderData: Omit<Order, 'id' | 'createdAt' | 'updatedAt' | 'status' | 'filledQuantity'>): Promise<Order> {
    if (!this.producer) {
      await this.producer.connect();
    }
    
    // Publish to Kafka for async processing
    await this.producer.send({
      topic: 'new-orders',
      messages: [{ value: JSON.stringify(orderData) }],
    });
    
    // Return a pending order response
    return {
      ...orderData,
      id: uuidv4(),
      status: OrderStatus.OPEN,
      filledQuantity: 0,
      createdAt: new Date(),
      updatedAt: new Date(),
    };
  }

  public async cancelOrder(orderId: string, userId: string): Promise<boolean> {
    if (!this.producer) {
      await this.producer.connect();
    }
    
    // Publish to Kafka for async processing
    await this.producer.send({
      topic: 'cancel-orders',
      messages: [{ value: JSON.stringify({ orderId, userId }) }],
    });
    
    return true;
  }

  public async getOrderBook(symbol: string, limit = 10) {
    const client = await pool.connect();
    
    try {
      // Get the order book from the database
      const orderBook = await orderModel.getOrderBook(symbol, limit, client);
      
      return {
        bids: orderBook.bids,
        asks: orderBook.asks,
        lastUpdateId: Date.now(),
      };
    } finally {
      client.release();
    }
  }

  public async getOrder(orderId: string, userId: string): Promise<Order | null> {
    const client = await pool.connect();
    
    try {
      return await orderModel.getOrderById(orderId, userId, client);
    } finally {
      client.release();
    }
  }
  
  public async getTrades(userId: string, symbol?: string, limit = 100): Promise<Trade[]> {
    const client = await pool.connect();
    
    try {
      return await tradeModel.getTradesByUserId(userId, symbol, limit, client);
    } finally {
      client.release();
    }
  }
  
  public async getBalances(userId: string) {
    const client = await pool.connect();
    
    try {
      return await accountModel.getBalances(userId, client);
    } finally {
      client.release();
    }
  }
  
  public async depositFunds(userId: string, asset: string, amount: number) {
    const client = await pool.connect();
    
    try {
      await client.query('BEGIN');
      
      // Create a deposit transaction
      const transaction = await accountModel.createTransaction({
        userId,
        type: TransactionType.DEPOSIT,
        asset,
        amount,
        fee: 0,
        status: TransactionStatus.COMPLETED,
      }, client);
      
      // Update the balance
      await accountModel.updateBalance(
        userId,
        asset,
        { freeBalance: amount },
        client
      );
      
      await client.query('COMMIT');
      
      return transaction;
    } catch (error) {
      await client.query('ROLLBACK');
      throw error;
    } finally {
      client.release();
    }
  }
  
  public async withdrawFunds(userId: string, asset: string, amount: number, address: string) {
    const client = await pool.connect();
    
    try {
      await client.query('BEGIN');
      
      // Check available balance
      const balance = await accountModel.getBalance(userId, asset, client);
      
      if (!balance || balance.freeBalance < amount) {
        throw new Error('Insufficient balance');
      }
      
      // Create a withdrawal transaction
      const transaction = await accountModel.createTransaction({
        userId,
        type: TransactionType.WITHDRAWAL,
        asset,
        amount,
        fee: 0, // Add fee calculation if needed
        address,
        status: TransactionStatus.PENDING,
      }, client);
      
      // Lock the funds
      await accountModel.updateBalance(
        userId,
        asset,
        { 
          freeBalance: -amount,
          lockedBalance: amount
        },
        client
      );
      
      // In a real application, you would initiate the withdrawal process here
      // and update the transaction status when completed
      
      await client.query('COMMIT');
      
      return transaction;
    } catch (error) {
      await client.query('ROLLBACK');
      throw error;
    } finally {
      client.release();
    }
  }
}

export const tradingService = new TradingService();
