import React from 'react';
import { Table } from 'antd';
import { formatNumber } from '../../utils/formatters';
import './OrderBook.css';

interface OrderBookProps {
  bids: [string, string][];
  asks: [string, string][];
}

const OrderBook: React.FC<OrderBookProps> = ({ bids, asks }) => {
  const columns = [
    {
      title: 'Price (USDT)',
      dataIndex: 'price',
      key: 'price',
      render: (text: string, record: any) => (
        <span className={record.side === 'buy' ? 'buy-price' : 'sell-price'}>
          {text}
        </span>
      ),
    },
    {
      title: 'Amount (BTC)',
      dataIndex: 'amount',
      key: 'amount',
    },
    {
      title: 'Total',
      dataIndex: 'total',
      key: 'total',
    },
  ];

  const processOrders = (orders: [string, string][], side: 'buy' | 'sell') => {
    let total = 0;
    return orders
      .slice(0, 10) // Show top 10 orders
      .map(([price, amount]) => {
        const priceNum = parseFloat(price);
        const amountNum = parseFloat(amount);
        total += amountNum * priceNum;
        
        return {
          key: `${side}-${price}`,
          price: formatNumber(priceNum, 2),
          amount: formatNumber(amountNum, 6),
          total: formatNumber(total, 2),
          side,
        };
      });
  };

  const buyOrders = processOrders(bids, 'buy').reverse(); // Show best bids at the top
  const sellOrders = processOrders(asks, 'sell');

  return (
    <div className="order-book">
      <div className="order-book-section">
        <h4>Sell Orders</h4>
        <Table
          columns={columns}
          dataSource={sellOrders}
          size="small"
          pagination={false}
          showHeader={false}
          rowClassName={() => 'order-book-row'}
        />
      </div>
      
      <div className="order-book-spread">
        Spread: {bids.length > 0 && asks.length > 0 
          ? `${(parseFloat(asks[0][0]) - parseFloat(bids[0][0])).toFixed(2)} USDT` 
          : 'N/A'}
      </div>
      
      <div className="order-book-section">
        <h4>Buy Orders</h4>
        <Table
          columns={columns}
          dataSource={buyOrders}
          size="small"
          pagination={false}
          showHeader={false}
          rowClassName={() => 'order-book-row'}
        />
      </div>
    </div>
  );
};

export default OrderBook;
