export type ServiceName = 'api' | 'worker' | 'web';

export type ServiceStatus = 'healthy' | 'degraded' | 'unhealthy';

export interface ServiceHealth {
  name: ServiceName;
  status: ServiceStatus;
  version: string;
  uptime: number;
  timestamp: string;
  database?: {
    connected: boolean;
    error?: string;
  };
}

export interface ApiResponse<T = unknown> {
  success: boolean;
  data?: T;
  error?: {
    code: string;
    message: string;
    details?: unknown;
  };
  meta?: {
    timestamp: string;
    requestId?: string;
  };
}
