import { ApiResponse } from '@job-scheduler/shared';

const API_BASE_URL = 'http://localhost:3001/api/v1';

export class ApiClient {
  private static getToken(): string | null {
    return localStorage.getItem('token');
  }

  static async request<T = unknown>(
    endpoint: string,
    options: RequestInit = {}
  ): Promise<ApiResponse<T>> {
    const token = this.getToken();
    const headers: Record<string, string> = {
      'Content-Type': 'application/json',
      ...(options.headers as Record<string, string>),
    };

    if (token) {
      headers['Authorization'] = `Bearer ${token}`;
    }

    try {
      const response = await fetch(`${API_BASE_URL}${endpoint}`, {
        ...options,
        headers,
      });

      const json = await response.json();
      return json as ApiResponse<T>;
    } catch (err: unknown) {
      return {
        success: false,
        error: {
          code: 'NETWORK_ERROR',
          message: err instanceof Error ? err.message : 'Failed to connect to backend server.',
        },
      };
    }
  }

  // Auth
  static register(data: Record<string, unknown>) {
    return this.request('/auth/register', { method: 'POST', body: JSON.stringify(data) });
  }

  static login(data: Record<string, unknown>) {
    return this.request('/auth/login', { method: 'POST', body: JSON.stringify(data) });
  }

  static getMe() {
    return this.request('/auth/me');
  }

  // Organizations
  static getOrganizations() {
    return this.request('/organizations');
  }

  static createOrganization(data: Record<string, unknown>) {
    return this.request('/organizations', { method: 'POST', body: JSON.stringify(data) });
  }

  // Projects
  static getProjects() {
    return this.request('/projects');
  }

  static createProject(data: Record<string, unknown>) {
    return this.request('/projects', { method: 'POST', body: JSON.stringify(data) });
  }

  static deleteProject(id: string) {
    return this.request(`/projects/${id}`, { method: 'DELETE' });
  }

  // Queues
  static getQueues(projectId: string) {
    return this.request(`/projects/${projectId}/queues`);
  }

  static createQueue(projectId: string, data: Record<string, unknown>) {
    return this.request(`/projects/${projectId}/queues`, { method: 'POST', body: JSON.stringify(data) });
  }

  static pauseQueue(queueId: string) {
    return this.request(`/queues/${queueId}/pause`, { method: 'POST' });
  }

  static resumeQueue(queueId: string) {
    return this.request(`/queues/${queueId}/resume`, { method: 'POST' });
  }

  static deleteQueue(queueId: string) {
    return this.request(`/queues/${queueId}`, { method: 'DELETE' });
  }

  // Jobs
  static getJobs(projectId: string, status?: string) {
    const query = status && status !== 'ALL' ? `?status=${status}` : '';
    return this.request(`/projects/${projectId}/jobs${query}`);
  }

  static enqueueJob(projectId: string, queueId: string, data: Record<string, unknown>) {
    return this.request(`/projects/${projectId}/queues/${queueId}/jobs`, { method: 'POST', body: JSON.stringify(data) });
  }

  static getJobLogs(jobId: string) {
    return this.request(`/jobs/${jobId}/logs`);
  }

  static getJobDag(projectId: string, jobId: string) {
    return this.request(`/projects/${projectId}/jobs/${jobId}/dag`);
  }

  static getJobExecutions(projectId: string, jobId: string) {
    return this.request(`/projects/${projectId}/jobs/${jobId}/executions`);
  }

  static replayJob(projectId: string, jobId: string) {
    return this.request(`/projects/${projectId}/jobs/${jobId}/retry`, { method: 'POST' });
  }

  static cancelJob(jobId: string) {
    return this.request(`/jobs/${jobId}/cancel`, { method: 'POST' });
  }

  // Workers
  static getWorkers(projectId: string) {
    return this.request(`/projects/${projectId}/workers`);
  }

  static updateWorkerStatus(workerId: string, status: string) {
    return this.request(`/workers/${workerId}/status`, { method: 'PATCH', body: JSON.stringify({ status }) });
  }

  // Schedules
  static getSchedules(projectId: string) {
    return this.request(`/projects/${projectId}/schedules`);
  }

  static createSchedule(projectId: string, queueId: string, data: Record<string, unknown>) {
    return this.request(`/projects/${projectId}/queues/${queueId}/schedules`, { method: 'POST', body: JSON.stringify(data) });
  }

  static pauseSchedule(scheduleId: string) {
    return this.request(`/schedules/${scheduleId}/pause`, { method: 'POST' });
  }

  static resumeSchedule(scheduleId: string) {
    return this.request(`/schedules/${scheduleId}/resume`, { method: 'POST' });
  }

  static deleteSchedule(scheduleId: string) {
    return this.request(`/schedules/${scheduleId}`, { method: 'DELETE' });
  }

  // DLQ
  static getDlqEntries(projectId: string) {
    return this.request(`/projects/${projectId}/dlq`);
  }

  static retryDlq(dlqId: string) {
    return this.request(`/dlq/${dlqId}/retry`, { method: 'POST' });
  }

  static discardDlq(dlqId: string) {
    return this.request(`/dlq/${dlqId}`, { method: 'DELETE' });
  }

  // Metrics
  static getProjectMetrics(projectId: string) {
    return this.request(`/projects/${projectId}/metrics/overview`);
  }

  static getSystemHealth() {
    return this.request('/metrics/health');
  }
}
