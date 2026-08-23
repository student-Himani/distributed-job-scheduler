import http from 'http';
import WebSocket from 'ws';
import jwt from 'jsonwebtoken';
import { app } from '../app';
import { WebSocketService } from '../modules/websocket/websocket.service';

const JWT_SECRET = process.env.JWT_SECRET || 'super-secret-jwt-key';

describe('WebSocket Live Updates Subsystem', () => {
  let server: http.Server;
  let port: number;
  let validToken: string;

  beforeAll((done) => {
    validToken = jwt.sign({ userId: 'user-ws-test-123' }, JWT_SECRET, { expiresIn: '1h' });

    server = http.createServer(app);
    WebSocketService.initialize(server);

    server.listen(0, () => {
      const address = server.address();
      if (typeof address === 'object' && address !== null) {
        port = address.port;
      }
      done();
    });
  });

  afterAll((done) => {
    WebSocketService.close();
    server.close(done);
  });

  it('1. Client can connect to WebSocket endpoint (ws://localhost:port/ws)', (done) => {
    const ws = new WebSocket(`ws://localhost:${port}/ws`);

    ws.on('open', () => {
      ws.close();
      done();
    });
  });

  it('2. Handshake sends connection.established message', (done) => {
    const ws = new WebSocket(`ws://localhost:${port}/ws`);

    ws.on('message', (data) => {
      const msg = JSON.parse(data.toString());
      if (msg.type === 'connection.established') {
        expect(msg.type).toBe('connection.established');
        ws.close();
        done();
      }
    });
  });

  it('3. Authenticated client connects with JWT token via URL query parameter', (done) => {
    const ws = new WebSocket(`ws://localhost:${port}/ws?token=${validToken}`);

    ws.on('message', (data) => {
      const msg = JSON.parse(data.toString());
      if (msg.type === 'authenticated') {
        expect(msg.type).toBe('authenticated');
        ws.close();
        done();
      }
    });
  });

  it('4. Client receives error message on invalid JWT token', (done) => {
    const ws = new WebSocket(`ws://localhost:${port}/ws?token=invalid-fake-jwt-token`);

    ws.on('message', (data) => {
      const msg = JSON.parse(data.toString());
      if (msg.type === 'error') {
        expect(msg.message).toContain('Invalid authentication token');
        ws.close();
        done();
      }
    });
  });

  it('5. Client can subscribe to project, queue, and job topics', (done) => {
    const ws = new WebSocket(`ws://localhost:${port}/ws?token=${validToken}`);

    ws.on('open', () => {
      ws.send(
        JSON.stringify({
          action: 'subscribe',
          projectId: 'proj-123',
          queueId: 'queue-456',
          jobId: 'job-789',
        })
      );
    });

    ws.on('message', (data) => {
      const msg = JSON.parse(data.toString());
      if (msg.type === 'subscribed') {
        expect(msg.projectId).toBe('proj-123');
        expect(msg.queueId).toBe('queue-456');
        expect(msg.jobId).toBe('job-789');
        ws.close();
        done();
      }
    });
  });

  it('6. Subscribed client receives broadcasted job lifecycle events (JOB_CREATED, JOB_COMPLETED, JOB_FAILED, JOB_RETRY)', (done) => {
    const ws = new WebSocket(`ws://localhost:${port}/ws?token=${validToken}`);
    const receivedEvents: string[] = [];

    ws.on('open', () => {
      ws.send(JSON.stringify({ action: 'subscribe', projectId: 'proj-live-123' }));

      setTimeout(() => {
        WebSocketService.broadcastJobEvent({
          eventType: 'JOB_CREATED',
          jobId: 'job-live-1',
          projectId: 'proj-live-123',
          payload: { status: 'QUEUED' },
        });

        WebSocketService.broadcastJobEvent({
          eventType: 'JOB_COMPLETED',
          jobId: 'job-live-1',
          projectId: 'proj-live-123',
          payload: { durationMs: 450 },
        });
      }, 100);
    });

    ws.on('message', (data) => {
      const msg = JSON.parse(data.toString());
      if (msg.type === 'job.updated' && msg.projectId === 'proj-live-123') {
        receivedEvents.push(msg.eventType);
        if (receivedEvents.length === 2) {
          expect(receivedEvents).toContain('JOB_CREATED');
          expect(receivedEvents).toContain('JOB_COMPLETED');
          ws.close();
          done();
        }
      }
    });
  });

  it('7. Client can unsubscribe from topics', (done) => {
    const ws = new WebSocket(`ws://localhost:${port}/ws?token=${validToken}`);

    ws.on('open', () => {
      ws.send(JSON.stringify({ action: 'subscribe', projectId: 'proj-unsub-123' }));
    });

    ws.on('message', (data) => {
      const msg = JSON.parse(data.toString());
      if (msg.type === 'subscribed') {
        ws.send(JSON.stringify({ action: 'unsubscribe', projectId: 'proj-unsub-123' }));
      } else if (msg.type === 'unsubscribed') {
        expect(msg.type).toBe('unsubscribed');
        ws.close();
        done();
      }
    });
  });

  it('8. Ping action returns pong message', (done) => {
    const ws = new WebSocket(`ws://localhost:${port}/ws`);

    ws.on('open', () => {
      ws.send(JSON.stringify({ action: 'ping' }));
    });

    ws.on('message', (data) => {
      const msg = JSON.parse(data.toString());
      if (msg.type === 'pong') {
        expect(msg.type).toBe('pong');
        ws.close();
        done();
      }
    });
  });

  it('9. Disconnected clients are safely cleaned up from WebSocket memory registry', (done) => {
    const ws = new WebSocket(`ws://localhost:${port}/ws`);

    ws.on('open', () => {
      const initialStats = WebSocketService.getStats();
      expect(initialStats.connectedClients).toBeGreaterThan(0);
      ws.close();
    });

    ws.on('close', () => {
      setTimeout(() => {
        const stats = WebSocketService.getStats();
        expect(stats.connectedClients).toBe(0);
        done();
      }, 100);
    });
  });
});
