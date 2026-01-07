import React, { useState, useEffect, useCallback } from 'react';
import { Card, Row, Col, Tabs, Typography, Badge, message, Select } from 'antd';
import { WifiOutlined, WifiOffOutlined, LoadingOutlined } from '@ant-design/icons';
import { useTrading } from '../../contexts/TradingContext';
import OrderBook from './OrderBook';
import OrderForm from './OrderForm';
import Trades from './Trades';
import { formatNumber } from '../../utils/formatters';
import './TradingInterface.css';

const { Option } = Select;
const { Title, Text } = Typography;

const { TabPane } = Tabs;

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
  isBestMatch: boolean;
}

const TradingInterface: React.FC = () => {
  const {
    isConnected,
    orderBook,
    trades,
    openOrders,
    selectedSymbol,
    setSelectedSymbol,
    placeOrder,
    cancelOrder,
    loading
  } = useTrading();
  
  const [activeTab, setActiveTab] = useState<string>('orderbook');
  const [isPlacingOrder, setIsPlacingOrder] = useState<boolean>(false);
  
  // Available trading pairs
  const symbols = [
    'BTCUSDT',
    'ETHUSDT',
    'BNBUSDT',
    'SOLUSDT',
    'XRPUSDT',
    'ADAUSDT',
    'DOTUSDT',
    'DOGEUSDT',
    'AVAXUSDT',
    'MATICUSDT'
  ];
  
  // Handle order submission
  const handleOrderSubmit = useCallback(async (orderData: {
    side: 'BUY' | 'SELL';
    type: 'LIMIT' | 'MARKET';
    quantity: string;
    price?: string;
  }) => {
    try {
      setIsPlacingOrder(true);
      await placeOrder({
        symbol: selectedSymbol,
        ...orderData,
      });
      message.success('Order placed successfully');
    } catch (error) {
      console.error('Error placing order:', error);
      message.error('Failed to place order');
    } finally {
      setIsPlacingOrder(false);
    }
  }, [placeOrder, selectedSymbol]);
  
  // Handle symbol change
  const handleSymbolChange = (value: string) => {
    setSelectedSymbol(value);
  };

  return (
    <div className="trading-interface">
      <div className="trading-header">
        <div className="connection-status">
          <Badge status={isConnected ? 'success' : 'error'} />
          <span>{isConnected ? 'Connected' : 'Disconnected'}</span>
          {loading.orderBook || loading.trades ? (
            <span className="last-update">
              <LoadingOutlined spin style={{ marginRight: 8 }} />
              Updating...
            </span>
          ) : (
            <span className="last-update">
              Last update: {new Date().toLocaleTimeString()}
            </span>
          )}
        </div>
        
        <div className="symbol-selector">
          <Text strong style={{ marginRight: 8 }}>Trading Pair:</Text>
          <Select
            value={selectedSymbol}
            onChange={handleSymbolChange}
            style={{ width: 150 }}
            loading={loading.orderBook || loading.trades}
          >
            {symbols.map(sym => (
              <Option key={sym} value={sym}>
                {sym.replace('USDT', '/USDT')}
              </Option>
            ))}
          </Select>
        </div>
      </div>
      
      <div className="trading-layout">
        <div className="trading-chart">
          <Card 
            title={
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                <span>{selectedSymbol.replace('USDT', '/USDT')} Chart</span>
                <div>
                  <Text type="secondary" style={{ marginRight: 16 }}>
                    24h Change: <Text type="success">+2.34%</Text>
                  </Text>
                  <Text type="secondary">
                    24h Volume: {formatNumber(12345678)} USDT
                  </Text>
                </div>
              </div>
            }
            bodyStyle={{ padding: 0, height: '100%' }}
          >
            <div className="chart-placeholder">
              <div>Chart will be displayed here</div>
              <div>Using TradingView or similar library</div>
            </div>
          </Card>
        </div>
        
        <div className="trading-orders">
          <Tabs
            activeKey={activeTab}
            onChange={setActiveTab}
            className="trading-tabs"
            items={[
              {
                key: 'orderbook',
                label: `Order Book ${loading.orderBook ? <LoadingOutlined spin /> : ''}`,
                children: (
                  <OrderBook 
                    bids={orderBook.bids} 
                    asks={orderBook.asks} 
                  />
                ),
              },
              {
                key: 'trades',
                label: `Recent Trades ${loading.trades ? <LoadingOutlined spin /> : ''}`,
                children: <Trades trades={trades} />,
              },
              {
                key: 'open-orders',
                label: `Open Orders (${openOrders.length})`,
                children: (
                  <div className="open-orders">
                    {openOrders.length === 0 ? (
                      <div className="no-orders">No open orders</div>
                    ) : (
                      openOrders.map(order => (
                        <div key={order.id} className="order-item">
                          <div className="order-side" data-side={order.side.toLowerCase()}>
                            {order.side}
                          </div>
                          <div className="order-details">
                            <div className="order-price">{formatNumber(parseFloat(order.price), 2)}</div>
                            <div className="order-quantity">{formatNumber(parseFloat(order.quantity), 6)}</div>
                            <div className="order-total">
                              {formatNumber(parseFloat(order.price) * parseFloat(order.quantity), 2)} USDT
                            </div>
                          </div>
                          <div className="order-actions">
                            <button 
                              className="cancel-button"
                              onClick={() => cancelOrder(order.id)}
                              disabled={loading.orders}
                            >
                              {loading.orders ? <LoadingOutlined /> : 'Cancel'}
                            </button>
                          </div>
                        </div>
                      ))
                    )}
                  </div>
                ),
              },
            ]}
          />
        </div>
        
        <div className="trading-form">
          <OrderForm 
            symbol={selectedSymbol} 
            onOrderSubmit={handleOrderSubmit} 
            isConnected={isConnected}
            isSubmitting={isPlacingOrder}
          />
        </div>
      </div>
    </div>
  );
};

export default TradingInterface;
