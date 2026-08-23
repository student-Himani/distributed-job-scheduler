export type WebSocketAction = 'subscribe' | 'unsubscribe' | 'ping';

export interface WebSocketIncomingMessage {
  action: WebSocketAction;
  token?: string;
  projectId?: string;
  queueId?: string;
  jobId?: string;
}

export type WebSocketMessageType =
  | 'connection.established'
  | 'authenticated'
  | 'subscribed'
  | 'unsubscribed'
  | 'job.updated'
  | 'worker.updated'
  | 'queue.updated'
  | 'metrics.updated'
  | 'event.stream'
  | 'pong'
  | 'error';

export interface WebSocketOutgoingMessage<T = Record<string, unknown>> {
  type: WebSocketMessageType;
  timestamp: string;
  projectId?: string;
  queueId?: string;
  jobId?: string;
  eventType?: string;
  status?: string;
  data?: T;
  message?: string;
}
