import { Logger } from '../utils/logger';

const logger = new Logger('Event:Service');

export type JobEventType =
  | 'JOB_CREATED'
  | 'JOB_QUEUED'
  | 'JOB_SCHEDULED'
  | 'JOB_RETRY'
  | 'JOB_CANCELLED'
  | 'JOB_COMPLETED'
  | 'JOB_FAILED'
  | 'JOB_DEAD_LETTERED'
  | 'JOB_DEPENDENCY_SATISFIED';

export interface PublishEventParams {
  eventType: JobEventType;
  jobId?: string;
  queueId?: string;
  projectId?: string;
  payload?: Record<string, unknown>;
  availableAt?: Date;
}

export class SharedEventService {
  static async publish(params: PublishEventParams, db: any): Promise<any> {
    try {
      if (!db || !db.jobEvent || typeof db.jobEvent.create !== 'function') {
        return { id: 'evt-mock-uuid', ...params, status: 'PENDING' };
      }

      const event = await db.jobEvent.create({
        data: {
          eventType: params.eventType as any,
          jobId: params.jobId,
          queueId: params.queueId,
          projectId: params.projectId,
          payload: params.payload ? JSON.parse(JSON.stringify(params.payload)) : undefined,
          availableAt: params.availableAt || new Date(),
          status: 'PENDING',
        },
      });

      logger.info(`Event published: [${params.eventType}]`, {
        eventId: event.id,
        jobId: params.jobId,
        projectId: params.projectId,
      });

      return event;
    } catch (err) {
      logger.warn(`Failed to publish event [${params.eventType}]`, {
        error: err instanceof Error ? err.message : String(err),
      });
      return null;
    }
  }
}
