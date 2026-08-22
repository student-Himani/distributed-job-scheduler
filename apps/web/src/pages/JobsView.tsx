import React, { useEffect, useState } from 'react';
import { ApiClient } from '../api/client';
import { useAuth } from '../context/AuthContext';
import { Package, Plus, RefreshCw, X } from 'lucide-react';

interface QueueItem {
  id: string;
  name: string;
}

interface JobItem {
  id: string;
  name: string;
  type: 'IMMEDIATE' | 'DELAYED' | 'SCHEDULED' | 'RECURRING';
  status: 'QUEUED' | 'SCHEDULED' | 'CLAIMED' | 'RUNNING' | 'COMPLETED' | 'FAILED' | 'CANCELLED' | 'DEAD_LETTER';
  priority: number;
  retryCount: number;
  maxRetries: number;
  queue?: { name: string };
  createdAt: string;
}

interface JobLog {
  id: string;
  level: string;
  message: string;
  timestamp: string;
  metadata?: Record<string, unknown>;
}

export const JobsView: React.FC = () => {
  const { activeProject } = useAuth();
  const [jobs, setJobs] = useState<JobItem[]>([]);
  const [queues, setQueues] = useState<QueueItem[]>([]);
  const [loading, setLoading] = useState<boolean>(true);
  const [statusFilter, setStatusFilter] = useState<string>('ALL');

  // Enqueue Modal State
  const [showEnqueueModal, setShowEnqueueModal] = useState<boolean>(false);
  const [queueId, setQueueId] = useState<string>('');
  const [jobName, setJobName] = useState<string>('Process Monthly Payment');
  const [jobType, setJobType] = useState<'IMMEDIATE' | 'DELAYED'>('IMMEDIATE');
  const [delayMs, setDelayMs] = useState<number>(5000);
  const [payload, setPayload] = useState<string>('{"accountNumber": "ACC-9921", "amount": 149.99}');

  // Log Drawer State
  const [selectedJob, setSelectedJob] = useState<JobItem | null>(null);
  const [logs, setLogs] = useState<JobLog[]>([]);
  const [loadingLogs, setLoadingLogs] = useState<boolean>(false);

  const fetchJobsAndQueues = async () => {
    if (!activeProject) return;

    const [jobsRes, queuesRes] = await Promise.all([
      ApiClient.getJobs(activeProject.id, statusFilter),
      ApiClient.getQueues(activeProject.id),
    ]);

    if (jobsRes.success && Array.isArray(jobsRes.data)) {
      setJobs(jobsRes.data as JobItem[]);
    }
    if (queuesRes.success && Array.isArray(queuesRes.data)) {
      const qList = queuesRes.data as QueueItem[];
      setQueues(qList);
      if (qList.length > 0 && !queueId) {
        setQueueId(qList[0].id);
      }
    }
    setLoading(false);
  };

  useEffect(() => {
    setLoading(true);
    fetchJobsAndQueues();
    const interval = setInterval(fetchJobsAndQueues, 3000);
    return () => clearInterval(interval);
  }, [activeProject, statusFilter]);

  const handleEnqueue = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!activeProject || !queueId) return;

    let parsedPayload = {};
    try {
      parsedPayload = JSON.parse(payload);
    } catch {
      parsedPayload = {};
    }

    const res = await ApiClient.enqueueJob(activeProject.id, queueId, {
      name: jobName,
      type: jobType,
      delayMs: jobType === 'DELAYED' ? delayMs : undefined,
      payload: parsedPayload,
    });

    if (res.success) {
      setShowEnqueueModal(false);
      fetchJobsAndQueues();
    } else {
      alert(res.error?.message || 'Failed to enqueue job');
    }
  };

  const handleViewLogs = async (job: JobItem) => {
    setSelectedJob(job);
    setLoadingLogs(true);
    const res = await ApiClient.getJobLogs(job.id);
    if (res.success && Array.isArray(res.data)) {
      setLogs(res.data as JobLog[]);
    } else {
      setLogs([]);
    }
    setLoadingLogs(false);
  };

  const handleCancelJob = async (jobId: string) => {
    if (confirm('Cancel this job?')) {
      await ApiClient.cancelJob(jobId);
      fetchJobsAndQueues();
    }
  };

  if (!activeProject) {
    return <div className="p-8 text-center text-slate-500 bg-white rounded-2xl border">Select a project first.</div>;
  }

  return (
    <div className="space-y-6 font-sans">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 border-b border-slate-200/80 pb-4">
        <div>
          <h1 className="text-2xl font-black text-slate-900 tracking-tight flex items-center space-x-2">
            <Package className="w-6 h-6 text-blue-600" />
            <span>Jobs & Task Lifecycle</span>
          </h1>
          <p className="text-slate-500 text-xs mt-1">
            Project <span className="font-bold text-slate-700">{activeProject.name}</span> • Enqueue, Monitor & Cancel Tasks
          </p>
        </div>

        <div className="flex items-center space-x-3">
          <button
            onClick={fetchJobsAndQueues}
            className="p-2.5 rounded-2xl border border-slate-200 bg-white text-slate-600 hover:bg-slate-50 shadow-sm"
          >
            <RefreshCw className={`w-4 h-4 ${loading ? 'animate-spin text-blue-600' : ''}`} />
          </button>
          <button
            onClick={() => setShowEnqueueModal(true)}
            className="px-4 py-2.5 rounded-2xl bg-blue-600 hover:bg-blue-700 text-white font-bold text-xs shadow-md shadow-blue-500/20 flex items-center space-x-2"
          >
            <Plus className="w-4 h-4" />
            <span>Enqueue New Job</span>
          </button>
        </div>
      </div>

      {/* Filter Pills */}
      <div className="flex items-center space-x-2 overflow-x-auto pb-2 text-xs font-semibold">
        {['ALL', 'QUEUED', 'RUNNING', 'COMPLETED', 'FAILED', 'SCHEDULED', 'DEAD_LETTER', 'CANCELLED'].map((st) => (
          <button
            key={st}
            onClick={() => setStatusFilter(st)}
            className={`px-3.5 py-2 rounded-2xl border transition-all ${
              statusFilter === st
                ? 'bg-blue-600 text-white border-blue-600 shadow-md shadow-blue-500/20'
                : 'bg-white text-slate-600 border-slate-200 hover:bg-slate-50'
            }`}
          >
            {st}
          </button>
        ))}
      </div>

      {/* Jobs Table */}
      {loading ? (
        <div className="p-12 text-center text-slate-400 animate-pulse bg-white rounded-3xl border border-slate-200/80">
          Loading jobs...
        </div>
      ) : jobs.length === 0 ? (
        <div className="p-12 text-center bg-white rounded-3xl border border-slate-200/80 space-y-3">
          <Package className="w-12 h-12 text-slate-300 mx-auto" />
          <h3 className="text-base font-bold text-slate-800">No Jobs Found</h3>
          <p className="text-slate-500 text-xs">No jobs match the selected filter criteria.</p>
        </div>
      ) : (
        <div className="bg-white rounded-3xl border border-slate-200/80 overflow-hidden shadow-xs">
          <table className="w-full text-left text-xs">
            <thead className="bg-slate-50 border-b border-slate-200 text-slate-500 font-extrabold uppercase text-[10px]">
              <tr>
                <th className="p-4">Job Name / ID</th>
                <th className="p-4">Type</th>
                <th className="p-4">Queue</th>
                <th className="p-4">Status</th>
                <th className="p-4">Retries</th>
                <th className="p-4 text-right">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100 font-medium text-slate-700">
              {jobs.map((j) => (
                <tr key={j.id} className="hover:bg-slate-50/80 transition-colors">
                  <td className="p-4">
                    <span className="font-bold text-slate-900 block">{j.name}</span>
                    <span className="text-[10px] text-slate-400 font-mono">{j.id}</span>
                  </td>
                  <td className="p-4">
                    <span className="px-2.5 py-1 rounded-full bg-slate-100 font-bold text-slate-700 text-[10px]">
                      {j.type}
                    </span>
                  </td>
                  <td className="p-4 text-slate-700">{j.queue?.name || 'Default Queue'}</td>
                  <td className="p-4">
                    <span className={`px-2.5 py-1 text-[11px] font-bold rounded-full border ${
                      j.status === 'COMPLETED' ? 'bg-emerald-50 text-emerald-700 border-emerald-200' :
                      j.status === 'RUNNING' ? 'bg-indigo-50 text-indigo-700 border-indigo-200' :
                      j.status === 'QUEUED' ? 'bg-blue-50 text-blue-700 border-blue-200' :
                      j.status === 'FAILED' ? 'bg-amber-50 text-amber-700 border-amber-200' :
                      j.status === 'DEAD_LETTER' ? 'bg-rose-50 text-rose-700 border-rose-200' :
                      'bg-slate-100 text-slate-600 border-slate-200'
                    }`}>
                      {j.status}
                    </span>
                  </td>
                  <td className="p-4 text-slate-600">{j.retryCount} / {j.maxRetries}</td>
                  <td className="p-4 text-right space-x-2">
                    <button
                      onClick={() => handleViewLogs(j)}
                      className="px-3 py-1.5 rounded-xl border border-slate-200 bg-white hover:bg-slate-50 text-slate-700 font-bold text-xs shadow-xs"
                    >
                      Logs
                    </button>
                    {(j.status === 'QUEUED' || j.status === 'SCHEDULED') && (
                      <button
                        onClick={() => handleCancelJob(j.id)}
                        className="px-3 py-1.5 rounded-xl bg-rose-50 hover:bg-rose-100 text-rose-700 font-bold text-xs"
                      >
                        Cancel
                      </button>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {/* Log Viewer Drawer */}
      {selectedJob && (
        <div className="fixed inset-0 bg-slate-900/40 backdrop-blur-sm flex justify-end z-50">
          <div className="w-full max-w-lg bg-white h-full shadow-2xl p-6 flex flex-col justify-between space-y-4">
            <div>
              <div className="flex items-center justify-between border-b border-slate-200 pb-4">
                <div>
                  <h3 className="text-base font-bold text-slate-900">{selectedJob.name}</h3>
                  <p className="text-xs text-slate-400 font-mono">{selectedJob.id}</p>
                </div>
                <button onClick={() => setSelectedJob(null)} className="p-1 text-slate-400 hover:text-slate-600">
                  <X className="w-5 h-5" />
                </button>
              </div>

              <div className="mt-4 space-y-3">
                <h4 className="text-xs font-bold text-slate-700 uppercase tracking-wider">Execution Logs</h4>
                {loadingLogs ? (
                  <p className="text-xs text-slate-400">Loading logs...</p>
                ) : logs.length === 0 ? (
                  <p className="text-xs text-slate-400 italic">No log entries found for this job execution.</p>
                ) : (
                  <div className="bg-slate-950 text-slate-200 p-4 rounded-2xl font-mono text-[11px] space-y-2 max-h-[500px] overflow-y-auto">
                    {logs.map((l) => (
                      <div key={l.id} className="border-b border-slate-800/80 pb-1.5">
                        <div className="flex items-center justify-between text-slate-400 text-[10px]">
                          <span className={l.level === 'WARN' ? 'text-amber-400 font-bold' : l.level === 'ERROR' ? 'text-rose-400 font-bold' : 'text-blue-400 font-bold'}>
                            [{l.level}]
                          </span>
                          <span>{new Date(l.timestamp).toLocaleTimeString()}</span>
                        </div>
                        <p className="mt-1 text-slate-200">{l.message}</p>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </div>

            <button
              onClick={() => setSelectedJob(null)}
              className="w-full py-2.5 rounded-2xl bg-slate-100 hover:bg-slate-200 font-bold text-xs text-slate-700"
            >
              Close Logs
            </button>
          </div>
        </div>
      )}

      {/* Enqueue Modal */}
      {showEnqueueModal && (
        <div className="fixed inset-0 bg-slate-900/40 backdrop-blur-sm flex items-center justify-center p-4 z-50">
          <div className="bg-white rounded-3xl p-6 max-w-md w-full shadow-2xl border border-slate-200 space-y-4">
            <h3 className="text-lg font-bold text-slate-900">Enqueue Job</h3>

            <form onSubmit={handleEnqueue} className="space-y-4">
              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-1">Target Queue</label>
                <select
                  value={queueId}
                  onChange={(e) => setQueueId(e.target.value)}
                  className="w-full px-3.5 py-2.5 text-sm rounded-2xl border border-slate-200 bg-white"
                >
                  {queues.map((q) => (
                    <option key={q.id} value={q.id}>{q.name}</option>
                  ))}
                </select>
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-1">Job Name</label>
                <input
                  type="text"
                  required
                  value={jobName}
                  onChange={(e) => setJobName(e.target.value)}
                  className="w-full px-3.5 py-2.5 text-sm rounded-2xl border border-slate-200"
                />
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-semibold text-slate-700 mb-1">Execution Type</label>
                  <select
                    value={jobType}
                    onChange={(e) => setJobType(e.target.value as 'IMMEDIATE' | 'DELAYED')}
                    className="w-full px-3.5 py-2.5 text-sm rounded-2xl border border-slate-200 bg-white"
                  >
                    <option value="IMMEDIATE">IMMEDIATE</option>
                    <option value="DELAYED">DELAYED</option>
                  </select>
                </div>

                {jobType === 'DELAYED' && (
                  <div>
                    <label className="block text-xs font-semibold text-slate-700 mb-1">Delay (ms)</label>
                    <input
                      type="number"
                      value={delayMs}
                      onChange={(e) => setDelayMs(parseInt(e.target.value, 10))}
                      className="w-full px-3.5 py-2.5 text-sm rounded-2xl border border-slate-200"
                    />
                  </div>
                )}
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-1">JSON Payload</label>
                <textarea
                  rows={3}
                  value={payload}
                  onChange={(e) => setPayload(e.target.value)}
                  className="w-full px-3.5 py-2.5 text-xs font-mono rounded-2xl border border-slate-200 bg-slate-50"
                />
              </div>

              <div className="flex justify-end space-x-3 pt-3">
                <button
                  type="button"
                  onClick={() => setShowEnqueueModal(false)}
                  className="px-4 py-2 rounded-2xl text-xs font-semibold text-slate-600 hover:bg-slate-100"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  className="px-4 py-2.5 rounded-2xl bg-blue-600 hover:bg-blue-700 text-white font-bold text-xs shadow-md shadow-blue-500/20"
                >
                  Enqueue Task
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
};
