import React, { createContext, useContext, useEffect, useState, useCallback } from 'react';
import { message } from 'antd';
import { webSocketService } from '../services/websocket';
import { apiService } from '../services/api';

interface OrderBookData {
  bids: [string, string][];
  asks: [string, string][];
  lastUpdateId: number;
}

interface TradeData {
  id: string;
  price: string;
  qty: string;
  quoteQty: string;
  time: number;
  isBuyerMaker: boolean;
}

interface OrderData {
  id: string;
  symbol: string;
  type: string;
  side: 'BUY' | 'SELL';
  price: string;
  quantity: string;
  status: string;
  time: number;
  filledQty?: string;
  remainingQty?: string;
}

interface TradingContextType {
  isConnected: boolean;
  orderBook: OrderBookData;
  trades: TradeData[];
  openOrders: OrderData[];
  selectedSymbol: string;
  setSelectedSymbol: (symbol: string) => void;
  placeOrder: (order: {
    symbol: string;
    type: string;
    side: 'BUY' | 'SELL';
    quantity: string;
    price?: string;
  }) => Promise<void>;
  cancelOrder: (orderId: string) => Promise<void>;
  loading: {
    orderBook: boolean;
    trades: boolean;
    orders: boolean;
  };
}

const TradingContext = createContext<TradingContextType | undefined>(undefined);

export const TradingProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [isConnected, setIsConnected] = useState(false);
  const [selectedSymbol, setSelectedSymbol] = useState('BTCUSDT');
  const [orderBook, setOrderBook] = useState<OrderBookData>({ bids: [], asks: [], lastUpdateId: 0 });
  const [trades, setTrades] = useState<TradeData[]>([]);
  const [openOrders, setOpenOrders] = useState<OrderData[]>([]);
  const [loading, setLoading] = useState({
    orderBook: false,
    trades: false,
    orders: false,
  });

  // Initialize WebSocket connection
  useEffect(() => {
    webSocketService.connect();

    webSocketService.on('connect', () => {
      setIsConnected(true);
      subscribeToChannels();
    });

    webSocketService.on('disconnect', () => {
      setIsConnected(false);
    });

    webSocketService.on('orderUpdate', handleOrderUpdate);
    webSocketService.on('trade', handleNewTrade);
    webSocketService.on('error', handleWebSocketError);

    return () => {
      webSocketService.off('connect', subscribeToChannels);
      webSocketService.off('disconnect', () => {});
      webSocketService.off('orderUpdate', handleOrderUpdate);
      webSocketService.off('trade', handleNewTrade);
      webSocketService.off('error', handleWebSocketError);
      webSocketService.disconnect();
    };
  }, []);

  // Subscribe to channels when symbol changes
  useEffect(() => {
    if (isConnected) {
      subscribeToChannels();
      fetchInitialData();
    }
    return () => {
      if (isConnected) {
        webSocketService.unsubscribe('orderbook', selectedSymbol);
        webSocketService.unsubscribe('trades', selectedSymbol);
      }
    };
  }, [selectedSymbol, isConnected]);

  const subscribeToChannels = useCallback(() => {
    if (!isConnected) return;
    
    // Unsubscribe from previous symbol
    webSocketService.unsubscribe('orderbook', selectedSymbol);
    webSocketService.unsubscribe('trades', selectedSymbol);
    
    // Subscribe to new symbol
    webSocketService.subscribe('orderbook', selectedSymbol);
    webSocketService.subscribe('trades', selectedSymbol);
    
    // Fetch fresh data when changing symbols
    fetchInitialData();
  }, [selectedSymbol, isConnected]);

  const fetchInitialData = async () => {
    try {
      setLoading(prev => ({ ...prev, orderBook: true, trades: true, orders: true }));
      
      // Fetch order book
      const orderBookData = await apiService.getOrderBook(selectedSymbol, 100);
      setOrderBook({
        bids: orderBookData.data.bids,
        asks: orderBookData.data.asks,
        lastUpdateId: orderBookData.data.lastUpdateId,
      });
      
      // Fetch recent trades
      const tradesData = await apiService.getRecentTrades(selectedSymbol, 50);
      setTrades(tradesData.data);
      
      // Fetch open orders
      const ordersData = await apiService.getOpenOrders(selectedSymbol);
      setOpenOrders(ordersData.data);
      
    } catch (error) {
      console.error('Error fetching initial data:', error);
      message.error('Failed to load market data');
    } finally {
      setLoading(prev => ({
        ...prev,
        orderBook: false,
        trades: false,
        orders: false,
      }));
    }
  };

  const handleOrderUpdate = (update: any) => {
    if (update.symbol !== selectedSymbol) return;
    
    setOpenOrders(prevOrders => {
      // Handle new order
      if (update.eventType === 'NEW') {
        return [update, ...prevOrders];
      }
      
      // Handle order update (FILLED, CANCELED, etc.)
      if (update.eventType === 'ORDER_STATUS_UPDATED') {
        return prevOrders.map(order => 
          order.id === update.id ? { ...order, ...update } : order
        ).filter(order => order.status !== 'FILLED' && order.status !== 'CANCELED');
      }
      
      return prevOrders;
    });
  };

  const handleNewTrade = (trade: any) => {
    if (trade.symbol !== selectedSymbol) return;
    
    setTrades(prevTrades => {
      const newTrades = [trade, ...prevTrades];
      // Keep only the last 50 trades
      return newTrades.slice(0, 50);
    });
  };

  const handleWebSocketError = (error: any) => {
    console.error('WebSocket error:', error);
    message.error('Connection error. Please refresh the page.');
  };

  const placeOrder = async (order: {
    symbol: string;
    type: string;
    side: 'BUY' | 'SELL';
    quantity: string;
    price?: string;
  }) => {
    try {
      setLoading(prev => ({ ...prev, orders: true }));
      await apiService.createOrder({
        symbol: order.symbol,
        type: order.type,
        side: order.side,
        quantity: parseFloat(order.quantity),
        price: order.price ? parseFloat(order.price) : undefined,
      });
      message.success('Order placed successfully');
      
      // The order will be added via WebSocket update
    } catch (error) {
      console.error('Error placing order:', error);
      message.error('Failed to place order');
      throw error;
    } finally {
      setLoading(prev => ({ ...prev, orders: false }));
    }
  };

  const cancelOrder = async (orderId: string) => {
    try {
      setLoading(prev => ({ ...prev, orders: true }));
      await apiService.cancelOrder(orderId);
      message.success('Order canceled');
      
      // The order status will be updated via WebSocket
    } catch (error) {
      console.error('Error canceling order:', error);
      message.error('Failed to cancel order');
      throw error;
    } finally {
      setLoading(prev => ({ ...prev, orders: false }));
    }
  };

  return (
    <TradingContext.Provider
      value={{
        isConnected,
        orderBook,
        trades,
        openOrders,
        selectedSymbol,
        setSelectedSymbol,
        placeOrder,
        cancelOrder,
        loading,
      }}
    >
      {children}
    </TradingContext.Provider>
  );
};

export const useTrading = (): TradingContextType => {
  const context = useContext(TradingContext);
  if (!context) {
    throw new Error('useTrading must be used within a TradingProvider');
  }
  return context;
};
