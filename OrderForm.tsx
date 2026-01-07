import React, { useState, useEffect } from 'react';
import { Form, Input, Button, Select, Card, Divider, message } from 'antd';
import { ArrowUpOutlined, ArrowDownOutlined } from '@ant-design/icons';
import { formatNumber } from '../../utils/formatters';
import './OrderForm.css';

const { Option } = Select;

interface OrderFormProps {
  symbol: string;
  onOrderSubmit: (orderData: {
    side: 'BUY' | 'SELL';
    type: 'LIMIT' | 'MARKET';
    quantity: string;
    price?: string;
  }) => void;
  isConnected: boolean;
}

const OrderForm: React.FC<OrderFormProps> = ({ symbol, onOrderSubmit, isConnected }) => {
  const [form] = Form.useForm();
  const [orderType, setOrderType] = useState<'LIMIT' | 'MARKET'>('LIMIT');
  const [orderSide, setOrderSide] = useState<'BUY' | 'SELL'>('BUY');
  const [availableBalance, setAvailableBalance] = useState<number>(10000); // Mock data
  
  // Calculate estimated total
  const calculateTotal = (price: string, quantity: string) => {
    const priceNum = parseFloat(price) || 0;
    const qtyNum = parseFloat(quantity) || 0;
    return (priceNum * qtyNum).toFixed(2);
  };

  const handleSubmit = (values: any) => {
    if (!isConnected) {
      message.error('Not connected to the exchange');
      return;
    }
    
    onOrderSubmit({
      side: orderSide,
      type: orderType,
      quantity: values.quantity,
      price: values.price,
    });
    
    form.resetFields(['quantity', 'price']);
  };

  const handleSideToggle = (side: 'BUY' | 'SELL') => {
    setOrderSide(side);
  };

  return (
    <Card 
      title={
        <div className="order-form-header">
          <Button
            type={orderSide === 'BUY' ? 'primary' : 'default'}
            danger={orderSide === 'SELL'}
            icon={<ArrowUpOutlined />}
            onClick={() => handleSideToggle('BUY')}
            className="side-toggle"
          >
            Buy
          </Button>
          <Button
            type={orderSide === 'SELL' ? 'primary' : 'default'}
            danger={orderSide === 'SELL'}
            icon={<ArrowDownOutlined />}
            onClick={() => handleSideToggle('SELL')}
            className="side-toggle"
          >
            Sell
          </Button>
          <Select
            value={orderType}
            onChange={(value: 'LIMIT' | 'MARKET') => setOrderType(value)}
            className="order-type-select"
          >
            <Option value="LIMIT">Limit</Option>
            <Option value="MARKET">Market</Option>
          </Select>
        </div>
      }
      className="order-form-card"
    >
      <Form
        form={form}
        layout="vertical"
        onFinish={handleSubmit}
        initialValues={{ type: 'LIMIT' }}
      >
        <div className="balance-info">
          <span>Available: {formatNumber(availableBalance, 2)} USDT</span>
          <Button type="link" size="small">Max</Button>
        </div>
        
        <Form.Item
          name="price"
          label={orderType === 'LIMIT' ? 'Price (USDT)' : 'Market Price'}
          rules={[
            {
              required: orderType === 'LIMIT',
              message: 'Please input price',
            },
            {
              pattern: /^\d+(\.\d{1,8})?$/,
              message: 'Invalid price format',
            },
          ]}
        >
          <Input 
            placeholder={orderType === 'MARKET' ? 'Market Price' : '0.00'}
            disabled={orderType === 'MARKET'}
            suffix="USDT"
          />
        </Form.Item>
        
        <Form.Item
          name="quantity"
          label={`Amount (${symbol.replace('USDT', '')})`}
          rules={[
            { required: true, message: 'Please input amount' },
            {
              pattern: /^\d+(\.\d{1,8})?$/,
              message: 'Invalid amount format',
            },
          ]}
        >
          <Input 
            placeholder="0.00"
            onChange={(e) => {
              const price = form.getFieldValue('price') || '0';
              const total = calculateTotal(price, e.target.value);
              form.setFieldsValue({ total });
            }}
          />
        </Form.Item>
        
        <Form.Item name="total" label="Total (USDT)">
          <Input 
            placeholder="0.00"
            disabled
            value={calculateTotal(
              form.getFieldValue('price') || '0',
              form.getFieldValue('quantity') || '0'
            )}
          />
        </Form.Item>
        
        <Button 
          type="primary" 
          htmlType="submit" 
          block
          className={orderSide === 'BUY' ? 'buy-button' : 'sell-button'}
          disabled={!isConnected}
        >
          {orderSide} {symbol.replace('USDT', '')}
        </Button>
        
        <div className="order-summary">
          <div className="summary-row">
            <span>Fee (0.1%)</span>
            <span>0.00 USDT</span>
          </div>
          <div className="summary-row">
            <span>Total Cost</span>
            <span>{calculateTotal(
              form.getFieldValue('price') || '0',
              form.getFieldValue('quantity') || '0'
            )} USDT</span>
          </div>
        </div>
      </Form>
    </Card>
  );
};

export default OrderForm;
