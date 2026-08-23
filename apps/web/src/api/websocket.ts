export type ConnectionState = 'CONNECTED' | 'CONNECTING' | 'RECONNECTING' | 'DISCONNECTED';

export interface WebSocketEventMessage {
  type: string;
  timestamp: string;
  projectId?: string;
  queueId?: string;
  jobId?: string;
  eventType?: string;
  status?: string;
  data?: any;
  message?: string;
}

export type EventCallback = (message: WebSocketEventMessage) => void;
export type StatusCallback = (status: ConnectionState) => void;

export class WebSocketClient {
  private static instance: WebSocketClient | null = null;
  private ws: WebSocket | null = null;
  private url: string;
  private token: string | null = null;
  private connectionState: ConnectionState = 'DISCONNECTED';
  private reconnectAttempts: number = 0;
  private maxReconnectDelayMs: number = 10000;
  private reconnectTimer: any = null;
  private eventListeners: Set<EventCallback> = new Set();
  private statusListeners: Set<StatusCallback> = new Set();
  private activeSubscriptions: Set<string> = new Set();

  private constructor() {
    const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
    const host = window.location.hostname || 'localhost';
    this.url = `${protocol}//${host}:3001/ws`;
  }

  public static getInstance(): WebSocketClient {
    if (!WebSocketClient.instance) {
      WebSocketClient.instance = new WebSocketClient();
    }
    return WebSocketClient.instance;
  }

  public connect(token?: string): void {
    if (token) {
      this.token = token;
    }

    if (this.ws && (this.ws.readyState === WebSocket.OPEN || this.ws.readyState === WebSocket.CONNECTING)) {
      return;
    }

    this.setConnectionState(this.reconnectAttempts > 0 ? 'RECONNECTING' : 'CONNECTING');

    try {
      const wsUrl = this.token ? `${this.url}?token=${encodeURIComponent(this.token)}` : this.url;
      this.ws = new WebSocket(wsUrl);

      this.ws.onopen = () => {
        this.reconnectAttempts = 0;
        this.setConnectionState('CONNECTED');

        // Resubscribe active subscriptions on reconnect
        this.resubscribeAll();
      };

      this.ws.onmessage = (event) => {
        try {
          const message: WebSocketEventMessage = JSON.parse(event.data);
          this.notifyEventListeners(message);
        } catch {
          // Ignore invalid JSON payloads
        }
      };

      this.ws.onclose = () => {
        this.setConnectionState('DISCONNECTED');
        this.scheduleReconnect();
      };

      this.ws.onerror = () => {
        this.setConnectionState('DISCONNECTED');
      };
    } catch {
      this.setConnectionState('DISCONNECTED');
      this.scheduleReconnect();
    }
  }

  private scheduleReconnect(): void {
    if (this.reconnectTimer) return;

    this.reconnectAttempts++;
    const delay = Math.min(1000 * Math.pow(1.5, this.reconnectAttempts), this.maxReconnectDelayMs);

    this.reconnectTimer = setTimeout(() => {
      this.reconnectTimer = null;
      this.connect();
    }, delay);
  }

  public disconnect(): void {
    if (this.reconnectTimer) {
      clearTimeout(this.reconnectTimer);
      this.reconnectTimer = null;
    }

    if (this.ws) {
      this.ws.onclose = null; // Prevent auto-reconnect on explicit disconnect
      this.ws.close();
      this.ws = null;
    }

    this.setConnectionState('DISCONNECTED');
  }

  public subscribeToProject(projectId: string): void {
    const subKey = `project:${projectId}`;
    this.activeSubscriptions.add(subKey);
    this.send({ action: 'subscribe', projectId });
  }

  public subscribeToQueue(queueId: string): void {
    const subKey = `queue:${queueId}`;
    this.activeSubscriptions.add(subKey);
    this.send({ action: 'subscribe', queueId });
  }

  public subscribeToJob(jobId: string): void {
    const subKey = `job:${jobId}`;
    this.activeSubscriptions.add(subKey);
    this.send({ action: 'subscribe', jobId });
  }

  public unsubscribe(params: { projectId?: string; queueId?: string; jobId?: string }): void {
    if (params.projectId) this.activeSubscriptions.delete(`project:${params.projectId}`);
    if (params.queueId) this.activeSubscriptions.delete(`queue:${params.queueId}`);
    if (params.jobId) this.activeSubscriptions.delete(`job:${params.jobId}`);
    this.send({ action: 'unsubscribe', ...params });
  }

  private resubscribeAll(): void {
    this.activeSubscriptions.forEach((subKey) => {
      const [type, id] = subKey.split(':');
      if (type === 'project') this.send({ action: 'subscribe', projectId: id });
      if (type === 'queue') this.send({ action: 'subscribe', queueId: id });
      if (type === 'job') this.send({ action: 'subscribe', jobId: id });
    });
  }

  private send(payload: Record<string, unknown>): void {
    if (this.ws && this.ws.readyState === WebSocket.OPEN) {
      try {
        this.ws.send(JSON.stringify(payload));
      } catch {
        // Safe send
      }
    }
  }

  public onMessage(callback: EventCallback): () => void {
    this.eventListeners.add(callback);
    return () => this.eventListeners.delete(callback);
  }

  public onStatusChange(callback: StatusCallback): () => void {
    this.statusListeners.add(callback);
    callback(this.connectionState); // Immediate initial status emission
    return () => this.statusListeners.delete(callback);
  }

  private notifyEventListeners(message: WebSocketEventMessage): void {
    this.eventListeners.forEach((listener) => {
      try {
        listener(message);
      } catch {
        // Ignore listener error
      }
    });
  }

  private setConnectionState(state: ConnectionState): void {
    if (this.connectionState !== state) {
      this.connectionState = state;
      this.statusListeners.forEach((listener) => {
        try {
          listener(state);
        } catch {
          // Ignore listener error
        }
      });
    }
  }

  public getStatus(): ConnectionState {
    return this.connectionState;
  }
}
