import React, { useEffect, useState } from 'react';
import { ApiClient } from '../api/client';
import { WebSocketClient, ConnectionState } from '../api/websocket';
import { useAuth } from '../context/AuthContext';
import { Package, Plus, RefreshCw, X, GitCommit, ArrowRight, ShieldAlert, ShieldCheck, Zap, Activity, Radio } from 'lucide-react';

interface EventStats {
  pending: number;
  processing: number;
  processed: number;
  failed: number;
  total: number;
}

interface EventItem {
  id: string;
  eventType: string;
  jobId?: string;
  status: string;
  createdAt: string;
}

interface QueueItem {
  id: string;
  name: string;
}

interface JobItem {
  id: string;
  name: string;
  type: 'IMMEDIATE' | 'DELAYED' | 'SCHEDULED' | 'RECURRING';
  status: 'QUEUED' | 'SCHEDULED' | 'CLAIMED' | 'RUNNING' | 'COMPLETED' | 'FAILED' | 'CANCELLED' | 'DEAD_LETTER' | 'BLOCKED';
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

interface DagNode {
  id: string;
  name: string;
  status: string;
  type: string;
}

interface DagData {
  job: DagNode;
  parents: DagNode[];
  children: DagNode[];
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
  const [selectedParents, setSelectedParents] = useState<string[]>([]);
  const [payload, setPayload] = useState<string>('{"accountNumber": "ACC-9921", "amount": 149.99}');
  const [enqueueError, setEnqueueError] = useState<string>('');

  // Log Drawer State
  const [selectedJob, setSelectedJob] = useState<JobItem | null>(null);
  const [logs, setLogs] = useState<JobLog[]>([]);
  const [loadingLogs, setLoadingLogs] = useState<boolean>(false);

  // DAG Modal State
  const [showDagModal, setShowDagModal] = useState<boolean>(false);
  const [dagData, setDagData] = useState<DagData | null>(null);
  const [loadingDag, setLoadingDag] = useState<boolean>(false);

  // Event Execution State
  const [eventStats, setEventStats] = useState<EventStats>({ pending: 0, processing: 0, processed: 0, failed: 0, total: 0 });
  const [recentEvents, setRecentEvents] = useState<EventItem[]>([]);

  const fetchJobsAndQueues = async () => {
    if (!activeProject) return;

    const [jobsRes, queuesRes, statsRes, eventsRes] = await Promise.all([
      ApiClient.getJobs(activeProject.id, statusFilter),
      ApiClient.getQueues(activeProject.id),
      ApiClient.getEventStats(activeProject.id),
      ApiClient.getEvents(activeProject.id, { limit: 5 }),
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
    if (statsRes.success && statsRes.data) {
      setEventStats(statsRes.data as EventStats);
    }
    if (eventsRes.success && eventsRes.data && Array.isArray((eventsRes.data as any).events)) {
      setRecentEvents((eventsRes.data as any).events as EventItem[]);
    }
    setLoading(false);
  };

  const [wsStatus, setWsStatus] = useState<ConnectionState>('DISCONNECTED');

  useEffect(() => {
    setLoading(true);
    fetchJobsAndQueues();
    const interval = setInterval(fetchJobsAndQueues, 3000);

    const token = localStorage.getItem('token') || undefined;
    const wsClient = WebSocketClient.getInstance();
    wsClient.connect(token);

    if (activeProject) {
      wsClient.subscribeToProject(activeProject.id);
    }

    const unsubStatus = wsClient.onStatusChange((status) => {
      setWsStatus(status);
    });

    const unsubMsg = wsClient.onMessage((message) => {
      if (message.type === 'job.updated' && message.jobId) {
        setJobs((prevJobs) => {
          const exists = prevJobs.some((j) => j.id === message.jobId);
          if (exists) {
            return prevJobs.map((j) =>
              j.id === message.jobId ? { ...j, status: (message.status as any) || j.status } : j
            );
          }
          fetchJobsAndQueues();
          return prevJobs;
        });

        if (message.eventType) {
          setRecentEvents((prev) => [
            {
              id: `ws-evt-${Date.now()}`,
              eventType: message.eventType!,
              jobId: message.jobId,
              status: message.status || 'PROCESSED',
              createdAt: new Date().toISOString(),
            },
            ...prev.slice(0, 4),
          ]);
        }
      }
    });

    return () => {
      clearInterval(interval);
      unsubStatus();
      unsubMsg();
    };
  }, [activeProject, statusFilter]);

  const handleEnqueue = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!activeProject || !queueId) return;
    setEnqueueError('');

    let parsedPayload = {};
    try {
      parsedPayload = JSON.parse(payload);
    } catch {
      parsedPayload = {};
    }

    const res = await ApiClient.enqueueJob(activeProject.id, queueId, {
      name: jobName,
      type: jobType,
      delaySeconds: jobType === 'DELAYED' ? Math.ceil(delayMs / 1000) : undefined,
      payload: parsedPayload,
      dependsOnJobIds: selectedParents.length > 0 ? selectedParents : undefined,
    });

    if (res.success) {
      setShowEnqueueModal(false);
      setSelectedParents([]);
      fetchJobsAndQueues();
    } else {
      setEnqueueError(res.error?.message || 'Failed to enqueue job');
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

  const handleViewDag = async (job: JobItem) => {
    if (!activeProject) return;
    setShowDagModal(true);
    setLoadingDag(true);
    const res = await ApiClient.getJobDag(activeProject.id, job.id);
    if (res.success && res.data) {
      setDagData(res.data as DagData);
    } else {
      setDagData(null);
    }
    setLoadingDag(false);
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

  const renderStatusBadge = (status: string) => {
    const colorClasses =
      status === 'COMPLETED' ? 'bg-emerald-50 text-emerald-700 border-emerald-200' :
      status === 'RUNNING' ? 'bg-indigo-50 text-indigo-700 border-indigo-200' :
      status === 'QUEUED' ? 'bg-blue-50 text-blue-700 border-blue-200' :
      status === 'BLOCKED' ? 'bg-amber-50 text-amber-800 border-amber-300 font-black' :
      status === 'FAILED' ? 'bg-rose-50 text-rose-700 border-rose-200' :
      status === 'DEAD_LETTER' ? 'bg-rose-100 text-rose-800 border-rose-300' :
      'bg-slate-100 text-slate-600 border-slate-200';

    return (
      <span className={`px-2.5 py-1 text-[11px] font-bold rounded-full border ${colorClasses}`}>
        {status}
      </span>
    );
  };

  return (
    <div className="space-y-6 font-sans">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 border-b border-slate-200/80 pb-4">
        <div>
          <h1 className="text-2xl font-black text-slate-900 tracking-tight flex items-center space-x-2">
            <Package className="w-6 h-6 text-blue-600" />
            <span>Jobs & DAG Workflow Lifecycle</span>
          </h1>
          <p className="text-slate-500 text-xs mt-1">
            Project <span className="font-bold text-slate-700">{activeProject.name}</span> • Enqueue, Monitor, DAG Workflows & Rate Limits
          </p>
        </div>

        <div className="flex items-center space-x-3">
          <span className={`inline-flex items-center px-3 py-1.5 rounded-2xl text-xs font-bold border transition-all ${
            wsStatus === 'CONNECTED' ? 'bg-emerald-50 text-emerald-700 border-emerald-200' :
            wsStatus === 'RECONNECTING' || wsStatus === 'CONNECTING' ? 'bg-amber-50 text-amber-700 border-amber-200' :
            'bg-slate-100 text-slate-600 border-slate-200'
          }`}>
            <span className={`w-2 h-2 rounded-full mr-2 ${
              wsStatus === 'CONNECTED' ? 'bg-emerald-500 animate-ping' :
              wsStatus === 'RECONNECTING' || wsStatus === 'CONNECTING' ? 'bg-amber-500 animate-pulse' :
              'bg-slate-400'
            }`} />
            <Radio className="w-3.5 h-3.5 mr-1" />
            <span>Live Updates: {wsStatus}</span>
          </span>

          <button
            onClick={fetchJobsAndQueues}
            className="p-2.5 rounded-2xl border border-slate-200 bg-white text-slate-600 hover:bg-slate-50 shadow-sm"
          >
            <RefreshCw className={`w-4 h-4 ${loading ? 'animate-spin text-blue-600' : ''}`} />
          </button>
          <button
            onClick={() => { setEnqueueError(''); setShowEnqueueModal(true); }}
            className="px-4 py-2.5 rounded-2xl bg-blue-600 hover:bg-blue-700 text-white font-bold text-xs shadow-md shadow-blue-500/20 flex items-center space-x-2"
          >
            <Plus className="w-4 h-4" />
            <span>Enqueue New Job</span>
          </button>
        </div>
      </div>

      {/* Event-Driven Execution Telemetry Card */}
      <div className="bg-slate-900 text-white rounded-3xl p-5 shadow-lg border border-slate-800 space-y-4">
        <div className="flex items-center justify-between">
          <div className="flex items-center space-x-2.5">
            <div className="p-2 rounded-2xl bg-amber-500/20 text-amber-400 border border-amber-500/30">
              <Zap className="w-5 h-5 animate-pulse" />
            </div>
            <div>
              <h3 className="text-sm font-black tracking-tight text-white flex items-center space-x-2">
                <span>Event-Driven Execution Subsystem</span>
                <span className="inline-flex items-center px-2 py-0.5 rounded-full text-[10px] font-bold bg-emerald-500/20 text-emerald-400 border border-emerald-500/30">
                  <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 mr-1 animate-ping" />
                  Active
                </span>
              </h3>
              <p className="text-slate-400 text-[11px]">Real-time PostgreSQL lifecycle event dispatching with polling fallback</p>
            </div>
          </div>
          <div className="text-right">
            <span className="text-xs text-slate-400 font-medium">Total Events</span>
            <div className="text-lg font-black text-white">{eventStats.total}</div>
          </div>
        </div>

        {/* Counter Grid */}
        <div className="grid grid-cols-4 gap-3 text-center">
          <div className="bg-slate-800/80 rounded-2xl p-2.5 border border-slate-700/60">
            <span className="text-[10px] uppercase font-bold text-amber-400 tracking-wider">Pending</span>
            <p className="text-base font-black text-amber-300 mt-0.5">{eventStats.pending}</p>
          </div>
          <div className="bg-slate-800/80 rounded-2xl p-2.5 border border-slate-700/60">
            <span className="text-[10px] uppercase font-bold text-blue-400 tracking-wider">Processing</span>
            <p className="text-base font-black text-blue-300 mt-0.5">{eventStats.processing}</p>
          </div>
          <div className="bg-slate-800/80 rounded-2xl p-2.5 border border-slate-700/60">
            <span className="text-[10px] uppercase font-bold text-emerald-400 tracking-wider">Processed</span>
            <p className="text-base font-black text-emerald-300 mt-0.5">{eventStats.processed}</p>
          </div>
          <div className="bg-slate-800/80 rounded-2xl p-2.5 border border-slate-700/60">
            <span className="text-[10px] uppercase font-bold text-rose-400 tracking-wider">Failed</span>
            <p className="text-base font-black text-rose-300 mt-0.5">{eventStats.failed}</p>
          </div>
        </div>

        {/* Recent Events Stream */}
        {recentEvents.length > 0 && (
          <div className="pt-2 border-t border-slate-800/80">
            <span className="text-[10px] uppercase font-bold text-slate-400 tracking-wider block mb-2">Recent Event Stream</span>
            <div className="flex items-center space-x-2 overflow-x-auto text-[11px] pb-1">
              {recentEvents.map((evt) => (
                <div key={evt.id} className="px-3 py-1.5 rounded-xl bg-slate-800 border border-slate-700/70 flex items-center space-x-2 shrink-0">
                  <span className="font-mono font-bold text-amber-400 text-[10px]">{evt.eventType}</span>
                  <span className={`px-1.5 py-0.5 text-[9px] font-bold rounded ${evt.status === 'PROCESSED' ? 'bg-emerald-950 text-emerald-400 border border-emerald-800' : 'bg-slate-700 text-slate-300'}`}>
                    {evt.status}
                  </span>
                </div>
              ))}
            </div>
          </div>
        )}
      </div>

      {/* Filter Pills */}
      <div className="flex items-center space-x-2 overflow-x-auto pb-2 text-xs font-semibold">
        {['ALL', 'QUEUED', 'RUNNING', 'COMPLETED', 'BLOCKED', 'FAILED', 'SCHEDULED', 'DEAD_LETTER', 'CANCELLED'].map((st) => (
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
                <th className="p-4">Distributed Lock</th>
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
                    {renderStatusBadge(j.status)}
                  </td>
                  <td className="p-4">
                    {j.status === 'CLAIMED' || j.status === 'RUNNING' ? (
                      <span className="px-2 py-0.5 rounded-full bg-emerald-50 text-emerald-700 border border-emerald-200 font-bold text-[10px] inline-flex items-center space-x-1">
                        <ShieldCheck className="w-3 h-3 text-emerald-600" />
                        <span>Locked (Owner)</span>
                      </span>
                    ) : (
                      <span className="text-slate-400 text-[10px]">Released</span>
                    )}
                  </td>
                  <td className="p-4 text-slate-600">{j.retryCount} / {j.maxRetries}</td>
                  <td className="p-4 text-right space-x-2">
                    <button
                      onClick={() => handleViewDag(j)}
                      className="px-3 py-1.5 rounded-xl border border-blue-200 bg-blue-50/60 hover:bg-blue-100 text-blue-700 font-bold text-xs shadow-xs inline-flex items-center space-x-1"
                    >
                      <GitCommit className="w-3.5 h-3.5" />
                      <span>DAG</span>
                    </button>
                    <button
                      onClick={() => handleViewLogs(j)}
                      className="px-3 py-1.5 rounded-xl border border-slate-200 bg-white hover:bg-slate-50 text-slate-700 font-bold text-xs shadow-xs"
                    >
                      Logs
                    </button>
                    {(j.status === 'QUEUED' || j.status === 'SCHEDULED' || j.status === 'BLOCKED') && (
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

      {/* DAG Visualization Modal */}
      {showDagModal && (
        <div className="fixed inset-0 bg-slate-900/40 backdrop-blur-sm flex items-center justify-center p-4 z-50">
          <div className="bg-white rounded-3xl p-6 max-w-3xl w-full shadow-2xl border border-slate-200 space-y-6">
            <div className="flex items-center justify-between border-b border-slate-200 pb-4">
              <div>
                <h3 className="text-lg font-bold text-slate-900 flex items-center space-x-2">
                  <GitCommit className="w-5 h-5 text-blue-600" />
                  <span>Workflow Dependency Graph (DAG)</span>
                </h3>
                <p className="text-xs text-slate-500 mt-1">Prerequisite completion chain & downstream dependents</p>
              </div>
              <button onClick={() => setShowDagModal(false)} className="p-1 text-slate-400 hover:text-slate-600">
                <X className="w-5 h-5" />
              </button>
            </div>

            {loadingDag ? (
              <div className="p-8 text-center text-slate-400 animate-pulse">Loading DAG structure...</div>
            ) : !dagData ? (
              <div className="p-8 text-center text-slate-400">Failed to load job dependencies.</div>
            ) : (
              <div className="space-y-6">
                {/* Visual Chain Diagram matching assignment prompt */}
                <div className="bg-slate-50 border border-slate-200 rounded-2xl p-6 overflow-x-auto">
                  <span className="text-[10px] font-bold text-slate-400 uppercase tracking-widest block mb-4">
                    Workflow Pipeline Flow
                  </span>
                  
                  <div className="flex items-center space-x-4 min-w-max">
                    {/* Parents Column */}
                    {dagData.parents.length === 0 ? (
                      <div className="p-3 bg-white rounded-xl border border-slate-200 text-slate-400 text-xs italic">
                        No Parent Prerequisites (Root Task)
                      </div>
                    ) : (
                      <div className="flex flex-col space-y-2">
                        {dagData.parents.map((p) => (
                          <div key={p.id} className="p-3 bg-white rounded-xl border border-slate-200 shadow-xs min-w-[140px]">
                            <span className="font-bold text-slate-900 text-xs block">{p.name}</span>
                            <div className="mt-1">{renderStatusBadge(p.status)}</div>
                          </div>
                        ))}
                      </div>
                    )}

                    {/* Arrow */}
                    <ArrowRight className="w-5 h-5 text-slate-400 shrink-0" />

                    {/* Current Selected Job Card */}
                    <div className="p-4 bg-blue-50/80 rounded-2xl border-2 border-blue-500 shadow-md min-w-[160px] text-center">
                      <span className="text-[9px] font-extrabold text-blue-600 uppercase block tracking-wider">TARGET TASK</span>
                      <span className="font-bold text-slate-900 text-sm block mt-1">{dagData.job.name}</span>
                      <div className="mt-2">{renderStatusBadge(dagData.job.status)}</div>
                    </div>

                    {/* Arrow */}
                    <ArrowRight className="w-5 h-5 text-slate-400 shrink-0" />

                    {/* Children Column */}
                    {dagData.children.length === 0 ? (
                      <div className="p-3 bg-white rounded-xl border border-slate-200 text-slate-400 text-xs italic">
                        No Child Dependents (Leaf Task)
                      </div>
                    ) : (
                      <div className="flex flex-col space-y-2">
                        {dagData.children.map((c) => (
                          <div key={c.id} className="p-3 bg-white rounded-xl border border-slate-200 shadow-xs min-w-[140px]">
                            <span className="font-bold text-slate-900 text-xs block">{c.name}</span>
                            <div className="mt-1">{renderStatusBadge(c.status)}</div>
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                </div>

                <div className="grid grid-cols-2 gap-4 text-xs">
                  <div className="p-3 bg-slate-50 rounded-xl border">
                    <span className="font-bold text-slate-700 block">Prerequisites (Parents):</span>
                    <span className="text-slate-500">{dagData.parents.length} Job(s) required to complete</span>
                  </div>
                  <div className="p-3 bg-slate-50 rounded-xl border">
                    <span className="font-bold text-slate-700 block">Dependents (Children):</span>
                    <span className="text-slate-500">{dagData.children.length} Job(s) waiting on this task</span>
                  </div>
                </div>
              </div>
            )}

            <div className="flex justify-end pt-2">
              <button
                onClick={() => setShowDagModal(false)}
                className="px-4 py-2.5 rounded-xl bg-slate-100 hover:bg-slate-200 font-bold text-xs text-slate-700"
              >
                Close Visualizer
              </button>
            </div>
          </div>
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

      {/* Enqueue Modal with DAG Dependencies & Rate Limit Warning */}
      {showEnqueueModal && (
        <div className="fixed inset-0 bg-slate-900/40 backdrop-blur-sm flex items-center justify-center p-4 z-50">
          <div className="bg-white rounded-3xl p-6 max-w-md w-full shadow-2xl border border-slate-200 space-y-4">
            <h3 className="text-lg font-bold text-slate-900">Enqueue Job</h3>

            {enqueueError && (
              <div className="p-3.5 rounded-2xl bg-rose-50 border border-rose-200 text-rose-700 text-xs flex items-start space-x-2">
                <ShieldAlert className="w-4 h-4 text-rose-500 shrink-0 mt-0.5" />
                <span className="font-semibold">{enqueueError}</span>
              </div>
            )}

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

              {/* DAG Parent Dependencies Selection */}
              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-1">
                  Prerequisite Dependencies (DAG)
                </label>
                <select
                  multiple
                  value={selectedParents}
                  onChange={(e) => {
                    const opts = Array.from(e.target.selectedOptions, (o) => o.value);
                    setSelectedParents(opts);
                  }}
                  className="w-full px-3.5 py-2 text-xs rounded-2xl border border-slate-200 bg-slate-50/50 max-h-24 overflow-y-auto"
                >
                  {jobs.map((j) => (
                    <option key={j.id} value={j.id}>
                      {j.name} ({j.status})
                    </option>
                  ))}
                </select>
                <p className="text-[10px] text-slate-400 mt-1">Hold Ctrl/Cmd to select multiple parent jobs. Job will be BLOCKED until parents complete.</p>
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
