import React from 'react';
import { Table } from 'antd';
import { formatNumber } from '../../utils/formatters';
import './Trades.css';

interface Trade {
  id: string;
  price: string;
  qty: string;
  quoteQty: string;
  time: number;
  isBuyerMaker: boolean;
}

interface TradesProps {
  trades: Trade[];
}

const Trades: React.FC<TradesProps> = ({ trades }) => {
  const columns = [
    {
      title: 'Price',
      dataIndex: 'price',
      key: 'price',
      render: (text: string, record: Trade) => (
        <span className={record.isBuyerMaker ? 'sell-price' : 'buy-price'}>
          {formatNumber(parseFloat(text), 2)}
        </span>
      ),
    },
    {
      title: 'Amount',
      dataIndex: 'qty',
      key: 'qty',
      render: (text: string) => formatNumber(parseFloat(text), 6),
    },
    {
      title: 'Total',
      dataIndex: 'quoteQty',
      key: 'total',
      render: (text: string) => formatNumber(parseFloat(text), 2),
    },
    {
      title: 'Time',
      dataIndex: 'time',
      key: 'time',
      render: (timestamp: number) => {
        const date = new Date(timestamp);
        return date.toLocaleTimeString();
      },
    },
  ];

  return (
    <div className="trades-container">
      <div className="trades-header">
        <h4>Recent Trades</h4>
        <div className="trades-header-right">
          <span className="price-label">Price (USDT)</span>
          <span className="amount-label">Amount (BTC)</span>
          <span className="time-label">Time</span>
        </div>
      </div>
      <Table
        dataSource={trades}
        columns={columns}
        rowKey="id"
        size="small"
        pagination={false}
        showHeader={false}
        rowClassName={(record) => record.isBuyerMaker ? 'sell-row' : 'buy-row'}
      />
    </div>
  );
};

export default Trades;
