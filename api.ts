import axios, { AxiosInstance, AxiosRequestConfig } from 'axios';
import { message } from 'antd';

const API_BASE_URL = process.env.REACT_APP_API_URL || 'http://localhost:3000/api';

// Create axios instance
const api: AxiosInstance = axios.create({
  baseURL: API_BASE_URL,
  timeout: 10000,
  headers: {
    'Content-Type': 'application/json',
  },
});

// Request interceptor for adding auth token
api.interceptors.request.use(
  (config) => {
    const token = localStorage.getItem('token');
    if (token) {
      config.headers.Authorization = `Bearer ${token}`;
    }
    return config;
  },
  (error) => {
    return Promise.reject(error);
  }
);

// Response interceptor for handling errors
api.interceptors.response.use(
  (response) => response,
  (error) => {
    if (error.response) {
      // Handle HTTP errors
      const { status, data } = error.response;
      
      if (status === 401) {
        // Handle unauthorized access
        message.error('Session expired. Please login again.');
        localStorage.removeItem('token');
        window.location.href = '/login';
      } else if (status >= 500) {
        message.error('Server error. Please try again later.');
      } else if (data && data.message) {
        message.error(data.message);
      } else {
        message.error('An error occurred. Please try again.');
      }
    } else if (error.request) {
      // The request was made but no response was received
      message.error('Network error. Please check your connection.');
    } else {
      // Something happened in setting up the request
      message.error('Request error. Please try again.');
    }
    
    return Promise.reject(error);
  }
);

// API methods
export const apiService = {
  // Auth
  login: (credentials: { email: string; password: string }) => 
    api.post('/auth/login', credentials),
    
  register: (userData: { email: string; password: string; name: string }) => 
    api.post('/auth/register', userData),
  
  // Orders
  createOrder: (orderData: {
    symbol: string;
    type: string;
    side: string;
    quantity: number;
    price?: number;
    timeInForce?: string;
  }) => api.post('/orders', orderData),
  
  getOrder: (orderId: string) => 
    api.get(`/orders/${orderId}`),
    
  cancelOrder: (orderId: string) => 
    api.delete(`/orders/${orderId}`),
    
  getOpenOrders: (symbol?: string) => 
    api.get('/orders/open', { params: { symbol } }),
    
  // Account
  getAccountInfo: () => 
    api.get('/account'),
    
  // Market Data
  getOrderBook: (symbol: string, limit: number = 100) => 
    api.get(`/depth?symbol=${symbol}&limit=${limit}`),
    
  getRecentTrades: (symbol: string, limit: number = 100) => 
    api.get(`/trades?symbol=${symbol}&limit=${limit}`),
    
  getKlines: (symbol: string, interval: string, limit: number = 500) =>
    api.get(`/klines?symbol=${symbol}&interval=${interval}&limit=${limit}`),
    
  // WebSocket
  getWebSocketToken: () => 
    api.post('/ws-token'),
};

export default api;
