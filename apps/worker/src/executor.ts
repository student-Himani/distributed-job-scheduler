import { Logger } from '@job-scheduler/shared';

const logger = new Logger('Worker:Executor');

export interface JobExecutionTask {
  id: string;
  name: string;
  payload: Record<string, unknown>;
  maxRetries: number;
  timeoutMs?: number;
}

export class JobExecutor {
  private activeJobsCount = 0;
  private isDraining = false;

  get activeJobs(): number {
    return this.activeJobsCount;
  }

  get draining(): boolean {
    return this.isDraining;
  }

  setDraining(draining: boolean): void {
    this.isDraining = draining;
    logger.info(`Executor draining state set to ${draining}`);
  }

  async executeTask<T = Record<string, unknown>>(
    task: JobExecutionTask,
    handler?: (payload: Record<string, unknown>) => Promise<T>
  ): Promise<{ success: boolean; result?: T; error?: { message: string; code?: string; stack?: string }; durationMs: number }> {
    const startTime = Date.now();
    this.activeJobsCount++;

    const timeoutMs = task.timeoutMs || 30000;
    let timerId: NodeJS.Timeout | undefined;

    logger.info(`Starting execution of job [${task.name}] (ID: ${task.id})`, { taskId: task.id, timeoutMs });

    try {
      const result = await Promise.race<T>([
        handler ? handler(task.payload) : (this.defaultHandler(task) as unknown as Promise<T>),
        new Promise<never>((_, reject) => {
          timerId = setTimeout(() => {
            const timeoutError = new Error(`Job execution timed out after ${timeoutMs}ms`);
            (timeoutError as unknown as { code: string }).code = 'EXECUTION_TIMEOUT';
            reject(timeoutError);
          }, timeoutMs);
        }),
      ]);

      const durationMs = Date.now() - startTime;
      logger.info(`Job execution succeeded in ${durationMs}ms`, { taskId: task.id });

      return {
        success: true,
        result,
        durationMs,
      };
    } catch (err: unknown) {
      const durationMs = Date.now() - startTime;
      const errorMsg = err instanceof Error ? err.message : 'Unknown execution error';
      const errorCode = (err as { code?: string })?.code || 'EXECUTION_ERROR';
      const errorStack = err instanceof Error ? err.stack : undefined;

      logger.error(`Job execution failed: ${errorMsg}`, { taskId: task.id, durationMs, code: errorCode });

      return {
        success: false,
        error: {
          message: errorMsg,
          code: errorCode,
          stack: errorStack,
        },
        durationMs,
      };
    } finally {
      if (timerId) {
        clearTimeout(timerId);
      }
      this.activeJobsCount = Math.max(0, this.activeJobsCount - 1);
    }
  }

  private async defaultHandler(task: JobExecutionTask): Promise<Record<string, unknown>> {
    await new Promise((resolve) => setTimeout(resolve, 50));
    return {
      executedAt: new Date().toISOString(),
      processedJobName: task.name,
      status: 'PROCESSED_SUCCESSFULLY',
    };
  }
}
