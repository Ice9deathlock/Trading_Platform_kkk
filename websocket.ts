import { message } from 'antd';
import { apiService } from './api';

type WebSocketEvent = 'connect' | 'disconnect' | 'orderUpdate' | 'trade' | 'error';
type EventHandler = (data: any) => void;

class WebSocketService {
  private socket: WebSocket | null = null;
  private eventHandlers: Record<string, EventHandler[]> = {};
  private reconnectAttempts = 0;
  private maxReconnectAttempts = 5;
  private reconnectInterval = 5000; // 5 seconds
  private isConnected = false;
  private wsUrl: string;
  private token: string | null = null;

  constructor() {
    const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
    const host = process.env.REACT_APP_WS_URL || window.location.host;
    this.wsUrl = `${protocol}//${host}/ws`;
    this.loadToken();
  }

  private async loadToken() {
    try {
      const response = await apiService.getWebSocketToken();
      this.token = response.data.token;
    } catch (error) {
      console.error('Failed to get WebSocket token:', error);
      message.error('Failed to establish WebSocket connection');
    }
  }

  public connect(): void {
    if (this.isConnected || !this.token) {
      return;
    }

    const wsUrl = `${this.wsUrl}?token=${this.token}`;
    this.socket = new WebSocket(wsUrl);

    this.socket.onopen = () => {
      this.isConnected = true;
      this.reconnectAttempts = 0;
      this.emit('connect');
      console.log('WebSocket connected');
    };

    this.socket.onmessage = (event) => {
      try {
        const data = JSON.parse(event.data);
        this.handleIncomingMessage(data);
      } catch (error) {
        console.error('Error parsing WebSocket message:', error);
        this.emit('error', { error: 'Invalid message format' });
      }
    };

    this.socket.onclose = () => {
      this.isConnected = false;
      this.emit('disconnect');
      console.log('WebSocket disconnected');
      this.attemptReconnect();
    };

    this.socket.onerror = (error) => {
      console.error('WebSocket error:', error);
      this.emit('error', { error: 'WebSocket connection error' });
    };
  }

  public disconnect(): void {
    if (this.socket) {
      this.socket.close();
      this.socket = null;
      this.isConnected = false;
    }
  }

  public subscribe(channel: string, symbol: string): void {
    if (!this.isConnected || !this.socket) {
      console.warn('WebSocket not connected. Cannot subscribe.');
      return;
    }

    const message = {
      event: 'subscribe',
      channel,
      symbol,
    };

    this.socket.send(JSON.stringify(message));
  }

  public unsubscribe(channel: string, symbol: string): void {
    if (!this.isConnected || !this.socket) {
      return;
    }

    const message = {
      event: 'unsubscribe',
      channel,
      symbol,
    };

    this.socket.send(JSON.stringify(message));
  }

  public on(event: WebSocketEvent, handler: EventHandler): void {
    if (!this.eventHandlers[event]) {
      this.eventHandlers[event] = [];
    }
    this.eventHandlers[event].push(handler);
  }

  public off(event: WebSocketEvent, handler: EventHandler): void {
    if (!this.eventHandlers[event]) {
      return;
    }
    this.eventHandlers[event] = this.eventHandlers[event].filter(h => h !== handler);
  }

  private emit(event: WebSocketEvent, data?: any): void {
    if (!this.eventHandlers[event]) {
      return;
    }
    this.eventHandlers[event].forEach(handler => handler(data));
  }

  private handleIncomingMessage(data: any): void {
    if (!data || !data.event) {
      console.warn('Received message with no event type:', data);
      return;
    }

    switch (data.event) {
      case 'orderUpdate':
        this.emit('orderUpdate', data.data);
        break;
      case 'trade':
        this.emit('trade', data.data);
        break;
      case 'error':
        console.error('WebSocket server error:', data.message);
        this.emit('error', { error: data.message });
        break;
      default:
        console.warn('Unhandled WebSocket event:', data.event);
    }
  }

  private attemptReconnect(): void {
    if (this.reconnectAttempts >= this.maxReconnectAttempts) {
      console.error('Max reconnection attempts reached');
      return;
    }

    this.reconnectAttempts++;
    console.log(`Attempting to reconnect (${this.reconnectAttempts}/${this.maxReconnectAttempts})...`);
    
    setTimeout(() => {
      if (!this.isConnected) {
        this.connect();
      }
    }, this.reconnectInterval);
  }

  public getConnectionStatus(): boolean {
    return this.isConnected;
  }
}

export const webSocketService = new WebSocketService();
