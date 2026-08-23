import { Server as HttpServer } from 'http';
import { WebSocketServer, WebSocket } from 'ws';
import jwt from 'jsonwebtoken';
import { Logger } from '@job-scheduler/shared';
import {
  WebSocketIncomingMessage,
  WebSocketOutgoingMessage,
} from './websocket.types';

const logger = new Logger('WebSocket:Service');
const JWT_SECRET = process.env.JWT_SECRET || 'super-secret-jwt-key';

interface AuthenticatedClient {
  ws: WebSocket;
  userId?: string;
  isAlive: boolean;
  subscriptions: Set<string>;
}

export class WebSocketService {
  private static wss: WebSocketServer | null = null;
  private static clients: Map<WebSocket, AuthenticatedClient> = new Map();
  private static topicSubscriptions: Map<string, Set<WebSocket>> = new Map();
  private static heartbeatInterval: NodeJS.Timeout | null = null;

  /**
   * Initializes WebSocket server attached to existing HTTP server.
   */
  public static initialize(server: HttpServer): WebSocketServer {
    if (this.wss) {
      return this.wss;
    }

    this.wss = new WebSocketServer({ server, path: '/ws' });
    logger.info('WebSocket Server initialized at path /ws');

    this.wss.on('connection', (ws: WebSocket, req) => {
      this.handleConnection(ws, req);
    });

    // Setup 30-second ping/pong heartbeat timer to detect stale clients
    this.heartbeatInterval = setInterval(() => {
      this.clients.forEach((client, ws) => {
        if (!client.isAlive) {
          logger.info('Terminating inactive WebSocket client');
          this.removeClient(ws);
          return ws.terminate();
        }
        client.isAlive = false;
        try {
          ws.ping();
        } catch {
          this.removeClient(ws);
        }
      });
    }, 30000);

    return this.wss;
  }

  private static handleConnection(ws: WebSocket, req: any): void {
    logger.info('New WebSocket connection initiated', { remoteAddress: req?.socket?.remoteAddress });

    const client: AuthenticatedClient = {
      ws,
      isAlive: true,
      subscriptions: new Set<string>(),
    };

    this.clients.set(ws, client);

    // Check optional token query param: ws://localhost:3001/ws?token=...
    const url = new URL(req.url || '', `http://${req.headers.host || 'localhost'}`);
    const token = url.searchParams.get('token');
    if (token) {
      this.authenticateClient(ws, token);
    }

    // Send connection established handshake message
    this.sendToClient(ws, {
      type: 'connection.established',
      timestamp: new Date().toISOString(),
      message: 'Connected to Distributed Job Scheduler WebSocket Gateway.',
    });

    ws.on('pong', () => {
      const c = this.clients.get(ws);
      if (c) c.isAlive = true;
    });

    ws.on('message', (rawMessage: string) => {
      this.handleIncomingMessage(ws, rawMessage);
    });

    ws.on('close', () => {
      logger.info('WebSocket connection closed');
      this.removeClient(ws);
    });

    ws.on('error', (err) => {
      logger.warn('WebSocket client error', { error: err.message });
      this.removeClient(ws);
    });
  }

  private static authenticateClient(ws: WebSocket, token: string): boolean {
    try {
      const decoded = jwt.verify(token, JWT_SECRET) as { userId: string };
      const client = this.clients.get(ws);
      if (client) {
        client.userId = decoded.userId;
        this.sendToClient(ws, {
          type: 'authenticated',
          timestamp: new Date().toISOString(),
          message: 'WebSocket authentication successful.',
        });
        return true;
      }
    } catch {
      this.sendToClient(ws, {
        type: 'error',
        timestamp: new Date().toISOString(),
        message: 'Invalid authentication token.',
      });
    }
    return false;
  }

  private static handleIncomingMessage(ws: WebSocket, rawMessage: string): void {
    try {
      const msg: WebSocketIncomingMessage = JSON.parse(rawMessage.toString());
      const client = this.clients.get(ws);
      if (!client) return;

      client.isAlive = true;

      if (msg.action === 'ping') {
        this.sendToClient(ws, { type: 'pong', timestamp: new Date().toISOString() });
        return;
      }

      if (msg.token && !client.userId) {
        this.authenticateClient(ws, msg.token);
      }

      if (msg.action === 'subscribe') {
        this.handleSubscribe(ws, msg);
      } else if (msg.action === 'unsubscribe') {
        this.handleUnsubscribe(ws, msg);
      }
    } catch (err) {
      logger.warn('Failed to parse WebSocket incoming payload', {
        error: err instanceof Error ? err.message : String(err),
      });
    }
  }

  private static handleSubscribe(ws: WebSocket, msg: WebSocketIncomingMessage): void {
    const client = this.clients.get(ws);
    if (!client) return;

    const topics: string[] = [];
    if (msg.projectId) topics.push(`project:${msg.projectId}`);
    if (msg.queueId) topics.push(`queue:${msg.queueId}`);
    if (msg.jobId) topics.push(`job:${msg.jobId}`);
    if (!msg.projectId && !msg.queueId && !msg.jobId) topics.push('global');

    topics.forEach((topic) => {
      client.subscriptions.add(topic);
      if (!this.topicSubscriptions.has(topic)) {
        this.topicSubscriptions.set(topic, new Set());
      }
      this.topicSubscriptions.get(topic)!.add(ws);
    });

    this.sendToClient(ws, {
      type: 'subscribed',
      timestamp: new Date().toISOString(),
      projectId: msg.projectId,
      queueId: msg.queueId,
      jobId: msg.jobId,
      message: `Subscribed to topics: ${topics.join(', ')}`,
    });
  }

  private static handleUnsubscribe(ws: WebSocket, msg: WebSocketIncomingMessage): void {
    const client = this.clients.get(ws);
    if (!client) return;

    const topics: string[] = [];
    if (msg.projectId) topics.push(`project:${msg.projectId}`);
    if (msg.queueId) topics.push(`queue:${msg.queueId}`);
    if (msg.jobId) topics.push(`job:${msg.jobId}`);

    topics.forEach((topic) => {
      client.subscriptions.delete(topic);
      const subscribers = this.topicSubscriptions.get(topic);
      if (subscribers) {
        subscribers.delete(ws);
      }
    });

    this.sendToClient(ws, {
      type: 'unsubscribed',
      timestamp: new Date().toISOString(),
      message: `Unsubscribed from topics: ${topics.join(', ')}`,
    });
  }

  private static removeClient(ws: WebSocket): void {
    const client = this.clients.get(ws);
    if (client) {
      client.subscriptions.forEach((topic) => {
        const subs = this.topicSubscriptions.get(topic);
        if (subs) {
          subs.delete(ws);
        }
      });
      this.clients.delete(ws);
    }
  }

  private static sendToClient(ws: WebSocket, payload: WebSocketOutgoingMessage): void {
    if (ws.readyState === WebSocket.OPEN) {
      try {
        ws.send(JSON.stringify(payload));
      } catch (err) {
        logger.warn('Failed to send WebSocket message to client', {
          error: err instanceof Error ? err.message : String(err),
        });
      }
    }
  }

  /**
   * Broadcasts a message to subscribed topic clients or all active clients.
   */
  public static broadcast(topic: string, payload: WebSocketOutgoingMessage): void {
    const messageStr = JSON.stringify(payload);

    // Target topic subscribers
    const subscribers = this.topicSubscriptions.get(topic);
    if (subscribers && subscribers.size > 0) {
      subscribers.forEach((ws) => {
        if (ws.readyState === WebSocket.OPEN) {
          try {
            ws.send(messageStr);
          } catch {
            this.removeClient(ws);
          }
        }
      });
    }

    // Also broadcast to global dashboard subscribers if topic is not 'global'
    if (topic !== 'global') {
      const globalSubs = this.topicSubscriptions.get('global');
      if (globalSubs && globalSubs.size > 0) {
        globalSubs.forEach((ws) => {
          if (ws.readyState === WebSocket.OPEN) {
            try {
              ws.send(messageStr);
            } catch {
              this.removeClient(ws);
            }
          }
        });
      }
    }
  }

  /**
   * Broadcasts a job event update to project, queue, and job subscribers.
   */
  public static broadcastJobEvent(event: {
    eventType: string;
    jobId?: string;
    queueId?: string;
    projectId?: string;
    payload?: any;
  }): void {
    const message: WebSocketOutgoingMessage = {
      type: 'job.updated',
      timestamp: new Date().toISOString(),
      projectId: event.projectId,
      queueId: event.queueId,
      jobId: event.jobId,
      eventType: event.eventType,
      status: event.eventType.replace('JOB_', ''),
      data: event.payload || {},
    };

    if (event.projectId) {
      this.broadcast(`project:${event.projectId}`, message);
    }
    if (event.queueId) {
      this.broadcast(`queue:${event.queueId}`, message);
    }
    if (event.jobId) {
      this.broadcast(`job:${event.jobId}`, message);
    }
    this.broadcast('global', message);
  }

  /**
   * Returns active connection count and subscription stats.
   */
  public static getStats() {
    return {
      connectedClients: this.clients.size,
      activeTopics: this.topicSubscriptions.size,
    };
  }

  public static close(): void {
    if (this.heartbeatInterval) {
      clearInterval(this.heartbeatInterval);
      this.heartbeatInterval = null;
    }
    if (this.wss) {
      this.wss.close();
      this.wss = null;
    }
    this.clients.clear();
    this.topicSubscriptions.clear();
  }
}
