import { Server as WebSocketServer, WebSocket } from 'ws';
import { Server as HttpServer } from 'http';
import { logger } from '../utils/logger';
import jwt from 'jsonwebtoken';
import { User } from '../models/user.model';

type WebSocketClient = WebSocket & { 
  isAlive: boolean;
  userId?: string;
  subscriptions: Set<string>;
};

export class WebSocketService {
  private wss: WebSocketServer;
  private clients: Set<WebSocketClient> = new Set();
  private pingInterval: NodeJS.Timeout;

  constructor(server: HttpServer) {
    this.wss = new WebSocketServer({ server, path: '/ws' });
    this.setupEventHandlers();
    this.startHeartbeat();
  }

  private setupEventHandlers() {
    this.wss.on('connection', (ws: WebSocketClient, req) => {
      // Authenticate the WebSocket connection
      this.authenticateConnection(ws, req)
        .then(userId => {
          if (!userId) {
            ws.close(4001, 'Authentication failed');
            return;
          }

          ws.userId = userId;
          ws.isAlive = true;
          ws.subscriptions = new Set();
          this.clients.add(ws);

          ws.on('pong', () => {
            ws.isAlive = true;
          });

          ws.on('message', (data: string) => {
            this.handleMessage(ws, data);
          });

          ws.on('close', () => {
            this.clients.delete(ws);
          });

          // Send connection confirmation
          this.sendToClient(ws, {
            type: 'connection_established',
            timestamp: new Date().toISOString()
          });
        })
        .catch(error => {
          logger.error('WebSocket authentication error:', error);
          ws.close(4002, 'Authentication error');
        });
    });
  }

  private async authenticateConnection(ws: WebSocketClient, req: any): Promise<string | null> {
    try {
      const token = req.headers['sec-websocket-protocol'] || '';
      if (!token || !process.env.JWT_SECRET) {
        return null;
      }

      const decoded = jwt.verify(token, process.env.JWT_SECRET) as { userId: string };
      // Verify user exists
      const user = await User.getUserById(decoded.userId);
      return user ? user.id : null;
    } catch (error) {
      logger.error('WebSocket authentication failed:', error);
      return null;
    }
  }

  private handleMessage(ws: WebSocketClient, data: string) {
    try {
      const message = JSON.parse(data);
      
      switch (message.type) {
        case 'subscribe':
          this.handleSubscribe(ws, message);
          break;
        case 'unsubscribe':
          this.handleUnsubscribe(ws, message);
          break;
        case 'ping':
          this.sendToClient(ws, { type: 'pong', timestamp: new Date().toISOString() });
          break;
        default:
          this.sendError(ws, 'Unknown message type');
      }
    } catch (error) {
      logger.error('Error processing WebSocket message:', error);
      this.sendError(ws, 'Invalid message format');
    }
  }

  private handleSubscribe(ws: WebSocketClient, message: any) {
    const { channel, symbol } = message;
    
    if (!channel || !symbol) {
      this.sendError(ws, 'Channel and symbol are required for subscription');
      return;
    }

    const subscriptionId = `${channel}:${symbol}`;
    ws.subscriptions.add(subscriptionId);
    
    this.sendToClient(ws, {
      type: 'subscription_success',
      channel,
      symbol,
      message: `Subscribed to ${channel} for ${symbol}`
    });
  }

  private handleUnsubscribe(ws: WebSocketClient, message: any) {
    const { channel, symbol } = message;
    
    if (!channel || !symbol) {
      this.sendError(ws, 'Channel and symbol are required for unsubscription');
      return;
    }

    const subscriptionId = `${channel}:${symbol}`;
    ws.subscriptions.delete(subscriptionId);
    
    this.sendToClient(ws, {
      type: 'unsubscribe_success',
      channel,
      symbol,
      message: `Unsubscribed from ${channel} for ${symbol}`
    });
  }

  private sendToClient(ws: WebSocketClient, data: any) {
    if (ws.readyState === WebSocket.OPEN) {
      ws.send(JSON.stringify(data));
    }
  }

  private sendError(ws: WebSocketClient, message: string) {
    this.sendToClient(ws, {
      type: 'error',
      message,
      timestamp: new Date().toISOString()
    });
  }

  // Broadcast to all clients subscribed to a specific channel and symbol
  public broadcast(channel: string, symbol: string, data: any) {
    const message = JSON.stringify({
      type: channel,
      symbol,
      data,
      timestamp: new Date().toISOString()
    });

    this.clients.forEach(client => {
      const subscriptionId = `${channel}:${symbol}`;
      if (client.readyState === WebSocket.OPEN && client.subscriptions.has(subscriptionId)) {
        client.send(message);
      }
    });
  }

  // Heartbeat to detect dead connections
  private startHeartbeat() {
    this.pingInterval = setInterval(() => {
      this.clients.forEach(ws => {
        if (ws.isAlive === false) {
          return ws.terminate();
        }

        ws.isAlive = false;
        ws.ping();
      });
    }, 30000); // 30 seconds
  }

  public close() {
    clearInterval(this.pingInterval);
    this.wss.close(() => {
      logger.info('WebSocket server closed');
    });
  }
}

let webSocketService: WebSocketService;

export const initWebSocket = (server: HttpServer) => {
  if (!webSocketService) {
    webSocketService = new WebSocketService(server);
    logger.info('WebSocket server initialized');
  }
  return webSocketService;
};

export const getWebSocketService = (): WebSocketService => {
  if (!webSocketService) {
    throw new Error('WebSocket service not initialized');
  }
  return webSocketService;
};
