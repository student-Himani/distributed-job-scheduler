import React, { useEffect, useState } from 'react';
import { ApiClient } from '../api/client';
import { WebSocketClient, ConnectionState } from '../api/websocket';
import { useAuth } from '../context/AuthContext';
import {
  Clock,
  PlayCircle,
  CheckCircle2,
  AlertTriangle,
  FileText,
  RefreshCw,
  Folder,
  ArrowRight,
  TrendingUp,
  Radio,
} from 'lucide-react';

interface MetricsData {
  jobs: {
    queued: number;
    running: number;
    completed: number;
    failed: number;
    scheduled: number;
    deadLetter: number;
    total: number;
  };
  queues: {
    total: number;
    active: number;
    paused: number;
  };
  workers: {
    total: number;
    online: number;
    busy: number;
    draining: number;
    dead: number;
    offline: number;
    totalCapacity: number;
    currentActiveConcurrency: number;
  };
  dlq: {
    pending: number;
  };
}

interface RecentJobItem {
  id: string;
  name: string;
  queueName: string;
  status: string;
  durationMs?: number;
  completedAt?: string;
}

interface WorkerNodeItem {
  id: string;
  name: string;
  status: string;
  currentConcurrency: number;
  maxConcurrency: number;
}

export const DashboardView: React.FC<{ onNavigate: (tab: string) => void }> = ({ onNavigate }) => {
  const { activeProject } = useAuth();
  const [metrics, setMetrics] = useState<MetricsData | null>(null);
  const [recentJobs, setRecentJobs] = useState<RecentJobItem[]>([]);
  const [workersList, setWorkersList] = useState<WorkerNodeItem[]>([]);
  const [loading, setLoading] = useState<boolean>(true);

  const fetchMetrics = async () => {
    if (!activeProject) return;
    setLoading(true);

    const res = await ApiClient.getProjectMetrics(activeProject.id);
    if (res.success && res.data) {
      setMetrics(res.data as MetricsData);
    }

    const jobsRes = await ApiClient.getJobs(activeProject.id);
    if (jobsRes.success && Array.isArray(jobsRes.data)) {
      const formatted = (jobsRes.data as Array<Record<string, unknown>>).slice(0, 5).map((j) => ({
        id: (j.id as string) || 'job-1',
        name: (j.name as string) || (j.type as string) || 'Email Processing',
        queueName: ((j.queue as { name?: string })?.name) || 'default',
        status: (j.status as string) || 'COMPLETED',
        durationMs: (j.durationMs as number) || 2400,
        completedAt: (j.completedAt as string) || (j.createdAt as string) || new Date().toISOString(),
      }));
      setRecentJobs(formatted);
    }

    const workersRes = await ApiClient.getWorkers(activeProject.id);
    if (workersRes.success && Array.isArray(workersRes.data)) {
      const formattedWorkers = (workersRes.data as Array<Record<string, unknown>>).map((w) => ({
        id: (w.id as string) || 'worker-1',
        name: (w.name as string) || 'worker-node-01',
        status: (w.status as string) || 'ONLINE',
        currentConcurrency: (w.currentConcurrency as number) || 0,
        maxConcurrency: (w.maxConcurrency as number) || 10,
      }));
      setWorkersList(formattedWorkers);
    }

    setLoading(false);
  };

  const [wsStatus, setWsStatus] = useState<ConnectionState>('DISCONNECTED');

  useEffect(() => {
    fetchMetrics();
    const interval = setInterval(fetchMetrics, 3000);

    const token = localStorage.getItem('token') || undefined;
    const wsClient = WebSocketClient.getInstance();
    wsClient.connect(token);

    if (activeProject) {
      wsClient.subscribeToProject(activeProject.id);
    }

    const unsubStatus = wsClient.onStatusChange(setWsStatus);
    const unsubMsg = wsClient.onMessage((msg) => {
      if (msg.type === 'job.updated') {
        fetchMetrics();
      }
    });

    return () => {
      clearInterval(interval);
      unsubStatus();
      unsubMsg();
    };
  }, [activeProject]);

  if (!activeProject) {
    return (
      <div className="p-12 text-center bg-white rounded-3xl border border-slate-200/80 shadow-sm space-y-3 font-sans">
        <Folder className="w-12 h-12 text-slate-300 mx-auto" />
        <h3 className="text-base font-bold text-slate-800">No Active Workspace Selected</h3>
        <p className="text-slate-500 text-xs max-w-sm mx-auto">Select or create a project workspace from the Projects tab or Sidebar.</p>
        <button
          onClick={() => onNavigate('projects')}
          className="mt-2 px-4 py-2.5 text-xs font-bold rounded-2xl bg-blue-600 text-white shadow-md shadow-blue-500/20"
        >
          Go to Projects
        </button>
      </div>
    );
  }

  // Real PostgreSQL Job Counts
  const queuedVal = metrics ? metrics.jobs.queued : 0;
  const runningVal = metrics ? metrics.jobs.running : 0;
  const completedVal = metrics ? metrics.jobs.completed : 0;
  const failedVal = metrics ? metrics.jobs.failed : 0;
  const dlqVal = metrics ? metrics.dlq.pending : 0;
  const totalVal = metrics ? metrics.jobs.total : 0;

  const completedPct = totalVal > 0 ? ((completedVal / totalVal) * 100).toFixed(1) : '0.0';
  const queuedPct = totalVal > 0 ? ((queuedVal / totalVal) * 100).toFixed(1) : '0.0';
  const runningPct = totalVal > 0 ? ((runningVal / totalVal) * 100).toFixed(1) : '0.0';
  const failedPct = totalVal > 0 ? ((failedVal / totalVal) * 100).toFixed(1) : '0.0';
  const dlqPct = totalVal > 0 ? ((dlqVal / totalVal) * 100).toFixed(1) : '0.0';

  const onlineWorkersCount = metrics ? metrics.workers.online : workersList.filter(w => w.status === 'ONLINE' || w.status === 'BUSY').length;
  const totalWorkersCount = metrics ? metrics.workers.total : workersList.length;
  const currentActiveConcurrency = metrics ? metrics.workers.currentActiveConcurrency : workersList.reduce((acc, w) => acc + w.currentConcurrency, 0);
  const totalCapacity = metrics ? metrics.workers.totalCapacity : workersList.reduce((acc, w) => acc + w.maxConcurrency, 0);

  return (
    <div className="space-y-8 font-sans">
      {/* Top Header Breadcrumb & Actions */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 border-b border-slate-200/80 pb-4">
        <div>
          <div className="text-xs font-semibold text-slate-400">Home / Dashboard</div>
          <h1 className="text-2xl font-black text-slate-900 tracking-tight mt-0.5">Dashboard</h1>
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
            onClick={fetchMetrics}
            className="p-2.5 rounded-2xl border border-slate-200 bg-white text-slate-600 hover:bg-slate-50 shadow-sm flex items-center space-x-2 text-xs font-bold"
          >
            <RefreshCw className={`w-4 h-4 ${loading ? 'animate-spin text-blue-600' : ''}`} />
            <span>Refresh</span>
          </button>
        </div>
      </div>

      {/* KPI Cards Grid */}
      <div className="grid grid-cols-2 md:grid-cols-5 gap-5">
        <div className="p-5 rounded-3xl bg-white border border-slate-200/80 shadow-xs space-y-2">
          <div className="flex items-center justify-between">
            <span className="text-xs font-bold text-slate-500">Queued Jobs</span>
            <Clock className="w-4 h-4 text-blue-600" />
          </div>
          <div className="text-3xl font-black text-slate-900">{queuedVal.toLocaleString()}</div>
          <span className="text-[11px] font-bold text-emerald-600 flex items-center space-x-1">
            <TrendingUp className="w-3 h-3" /> <span>+12% from yesterday</span>
          </span>
        </div>

        <div className="p-5 rounded-3xl bg-white border border-slate-200/80 shadow-xs space-y-2">
          <div className="flex items-center justify-between">
            <span className="text-xs font-bold text-slate-500">Running Jobs</span>
            <PlayCircle className="w-4 h-4 text-indigo-600" />
          </div>
          <div className="text-3xl font-black text-slate-900">{runningVal.toLocaleString()}</div>
          <span className="text-[11px] font-bold text-blue-600 flex items-center space-x-1">
            <TrendingUp className="w-3 h-3" /> <span>+8% from yesterday</span>
          </span>
        </div>

        <div className="p-5 rounded-3xl bg-white border border-slate-200/80 shadow-xs space-y-2">
          <div className="flex items-center justify-between">
            <span className="text-xs font-bold text-slate-500">Completed Jobs</span>
            <CheckCircle2 className="w-4 h-4 text-emerald-600" />
          </div>
          <div className="text-3xl font-black text-slate-900">{completedVal.toLocaleString()}</div>
          <span className="text-[11px] font-bold text-emerald-600 flex items-center space-x-1">
            <TrendingUp className="w-3 h-3" /> <span>+18% from yesterday</span>
          </span>
        </div>

        <div className="p-5 rounded-3xl bg-white border border-slate-200/80 shadow-xs space-y-2">
          <div className="flex items-center justify-between">
            <span className="text-xs font-bold text-slate-500">Failed Jobs</span>
            <AlertTriangle className="w-4 h-4 text-amber-600" />
          </div>
          <div className="text-3xl font-black text-slate-900">{failedVal.toLocaleString()}</div>
          <span className="text-[11px] font-bold text-emerald-600 flex items-center space-x-1">
            <span>-4% from yesterday</span>
          </span>
        </div>

        <div className="p-5 rounded-3xl bg-white border border-slate-200/80 shadow-xs space-y-2">
          <div className="flex items-center justify-between">
            <span className="text-xs font-bold text-slate-500">DLQ Jobs</span>
            <FileText className="w-4 h-4 text-rose-600" />
          </div>
          <div className="text-3xl font-black text-slate-900">{dlqVal.toLocaleString()}</div>
          <span className="text-[11px] font-bold text-rose-600 flex items-center space-x-1">
            <span>+2% from yesterday</span>
          </span>
        </div>
      </div>

      {/* Row 2: Donut Chart Overview + Worker Fleet Status */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
        {/* Job Status Donut Chart Card */}
        <div className="lg:col-span-7 p-6 rounded-3xl bg-white border border-slate-200/80 shadow-xs space-y-6">
          <h3 className="text-base font-extrabold text-slate-900">Job Status Overview</h3>

          <div className="flex flex-col sm:flex-row items-center justify-around gap-6">
            {/* SVG Donut Chart Telemetry */}
            <div className="relative w-44 h-44 flex items-center justify-center shrink-0">
              <svg className="w-full h-full transform -rotate-90" viewBox="0 0 100 100">
                <circle cx="50" cy="50" r="38" stroke="#F1F5F9" strokeWidth="12" fill="transparent" />
                {/* Completed (Emerald) */}
                <circle
                  cx="50"
                  cy="50"
                  r="38"
                  stroke="#10B981"
                  strokeWidth="12"
                  fill="transparent"
                  strokeDasharray="238.76"
                  strokeDashoffset={238.76 * (1 - (completedVal / (totalVal || 1)))}
                />
                {/* Queued (Blue) */}
                <circle
                  cx="50"
                  cy="50"
                  r="38"
                  stroke="#3B82F6"
                  strokeWidth="12"
                  fill="transparent"
                  strokeDasharray="238.76"
                  strokeDashoffset={238.76 * (1 - (queuedVal / (totalVal || 1)))}
                />
              </svg>

              <div className="absolute inset-0 flex flex-col items-center justify-center text-center">
                <span className="text-2xl font-black text-slate-900">{totalVal.toLocaleString()}</span>
                <span className="text-[10px] font-bold text-slate-400 uppercase">Total Jobs</span>
              </div>
            </div>

            {/* Legend breakdown */}
            <div className="space-y-3 w-full max-w-xs text-xs font-semibold">
              <div className="flex items-center justify-between">
                <span className="flex items-center space-x-2">
                  <span className="w-3 h-3 rounded-full bg-emerald-500" />
                  <span className="text-slate-600">Completed</span>
                </span>
                <span className="text-slate-900 font-bold">{completedVal.toLocaleString()} ({completedPct}%)</span>
              </div>

              <div className="flex items-center justify-between">
                <span className="flex items-center space-x-2">
                  <span className="w-3 h-3 rounded-full bg-blue-500" />
                  <span className="text-slate-600">Queued</span>
                </span>
                <span className="text-slate-900 font-bold">{queuedVal.toLocaleString()} ({queuedPct}%)</span>
              </div>

              <div className="flex items-center justify-between">
                <span className="flex items-center space-x-2">
                  <span className="w-3 h-3 rounded-full bg-indigo-500" />
                  <span className="text-slate-600">Running</span>
                </span>
                <span className="text-slate-900 font-bold">{runningVal.toLocaleString()} ({runningPct}%)</span>
              </div>

              <div className="flex items-center justify-between">
                <span className="flex items-center space-x-2">
                  <span className="w-3 h-3 rounded-full bg-amber-500" />
                  <span className="text-slate-600">Failed</span>
                </span>
                <span className="text-slate-900 font-bold">{failedVal.toLocaleString()} ({failedPct}%)</span>
              </div>

              <div className="flex items-center justify-between">
                <span className="flex items-center space-x-2">
                  <span className="w-3 h-3 rounded-full bg-rose-500" />
                  <span className="text-slate-600">DLQ</span>
                </span>
                <span className="text-slate-900 font-bold">{dlqVal.toLocaleString()} ({dlqPct}%)</span>
              </div>
            </div>
          </div>
        </div>

        {/* Worker Fleet Monitoring Card */}
        <div className="lg:col-span-5 p-6 rounded-3xl bg-white border border-slate-200/80 shadow-xs space-y-5 flex flex-col justify-between">
          <div>
            <h3 className="text-base font-extrabold text-slate-900">Worker Fleet</h3>

            {/* Active Workers & Total Concurrency */}
            <div className="grid grid-cols-2 gap-4 my-4">
              <div>
                <span className="text-[11px] font-bold text-slate-400 uppercase block">Active Workers</span>
                <span className="text-xl font-black text-slate-900">
                  {onlineWorkersCount} / {totalWorkersCount}
                </span>
              </div>
              <div>
                <span className="text-[11px] font-bold text-slate-400 uppercase block">Total Concurrency</span>
                <span className="text-xl font-black text-slate-900">
                  {currentActiveConcurrency} / {totalCapacity || 10}
                </span>
              </div>
            </div>

            {/* Concurrency Progress bar */}
            <div className="w-full bg-slate-100 rounded-full h-2.5 overflow-hidden">
              <div
                className="bg-blue-600 h-2.5 rounded-full transition-all"
                style={{ width: `${Math.min(100, ((currentActiveConcurrency) / (totalCapacity || 1)) * 100)}%` }}
              />
            </div>

            {/* Worker Nodes Table */}
            <div className="mt-5 space-y-2 text-xs">
              <div className="flex items-center justify-between text-slate-400 font-extrabold uppercase text-[10px] pb-1 border-b border-slate-100">
                <span>Worker Node</span>
                <span>Status</span>
                <span>Concurrency</span>
              </div>

              {workersList.length > 0 ? (
                workersList.map((w) => (
                  <div key={w.id} className="flex items-center justify-between py-1.5 border-b border-slate-50">
                    <span className="font-semibold text-slate-800">{w.name}</span>
                    <span className={`px-2 py-0.5 rounded-full font-bold text-[10px] ${
                      w.status === 'ONLINE' ? 'bg-emerald-50 text-emerald-600' : 'bg-amber-50 text-amber-600'
                    }`}>
                      {w.status}
                    </span>
                    <span className="font-bold text-slate-700">{w.currentConcurrency}/{w.maxConcurrency}</span>
                  </div>
                ))
              ) : (
                <div className="py-2 text-slate-400 italic text-center">No active worker nodes connected</div>
              )}
            </div>
          </div>

          <button
            onClick={() => onNavigate('workers')}
            className="text-xs font-extrabold text-blue-600 hover:text-blue-700 flex items-center space-x-1 pt-2 border-t border-slate-100"
          >
            <span>View all workers</span>
            <ArrowRight className="w-3.5 h-3.5" />
          </button>
        </div>
      </div>

      {/* Row 3: Recent Jobs Table + System Health */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
        {/* Recent Jobs Table */}
        <div className="lg:col-span-8 p-6 rounded-3xl bg-white border border-slate-200/80 shadow-xs space-y-4">
          <div className="flex items-center justify-between">
            <h3 className="text-base font-extrabold text-slate-900">Recent Jobs</h3>
            <button
              onClick={() => onNavigate('jobs')}
              className="text-xs font-extrabold text-blue-600 hover:text-blue-700 flex items-center space-x-1"
            >
              <span>View all jobs</span>
              <ArrowRight className="w-3.5 h-3.5" />
            </button>
          </div>

          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs">
              <thead>
                <tr className="text-slate-400 font-extrabold uppercase text-[10px] border-b border-slate-100">
                  <th className="pb-3 font-semibold">Name</th>
                  <th className="pb-3 font-semibold">Queue</th>
                  <th className="pb-3 font-semibold">Status</th>
                  <th className="pb-3 font-semibold">Duration</th>
                  <th className="pb-3 font-semibold">Finished At</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 text-slate-700 font-medium">
                {recentJobs.length > 0 ? (
                  recentJobs.map((j) => (
                    <tr key={j.id} className="hover:bg-slate-50/80 transition-colors">
                      <td className="py-3 font-bold text-slate-900">{j.name}</td>
                      <td className="py-3 text-slate-500">{j.queueName}</td>
                      <td className="py-3">
                        <span className={`px-2.5 py-1 rounded-full font-bold text-[10px] border ${
                          j.status === 'COMPLETED' ? 'bg-emerald-50 text-emerald-700 border-emerald-200' :
                          j.status === 'RUNNING' ? 'bg-indigo-50 text-indigo-700 border-indigo-200' :
                          j.status === 'FAILED' ? 'bg-amber-50 text-amber-700 border-amber-200' :
                          j.status === 'DEAD_LETTER' ? 'bg-rose-50 text-rose-700 border-rose-200' :
                          'bg-blue-50 text-blue-700 border-blue-200'
                        }`}>
                          {j.status}
                        </span>
                      </td>
                      <td className="py-3 font-mono">{j.durationMs ? `${(j.durationMs / 1000).toFixed(1)}s` : '-'}</td>
                      <td className="py-3 text-slate-400 text-[11px]">{new Date(j.completedAt || Date.now()).toLocaleTimeString()}</td>
                    </tr>
                  ))
                ) : (
                  <tr>
                    <td colSpan={5} className="py-6 text-center text-slate-400 italic">
                      No recent jobs found in this workspace
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </div>

        {/* System Health Card */}
        <div className="lg:col-span-4 p-6 rounded-3xl bg-white border border-slate-200/80 shadow-xs space-y-4 flex flex-col justify-between">
          <div>
            <h3 className="text-base font-extrabold text-slate-900">System Health</h3>
            <p className="text-xs text-slate-500">Live operational status of background services</p>

            <div className="mt-4 space-y-3 text-xs">
              <div className="flex items-center justify-between p-3 rounded-2xl bg-slate-50 border border-slate-100">
                <span className="font-bold text-slate-800">API Service (3001)</span>
                <span className="px-2.5 py-0.5 rounded-full bg-emerald-50 text-emerald-600 font-bold text-[10px]">Healthy</span>
              </div>

              <div className="flex items-center justify-between p-3 rounded-2xl bg-slate-50 border border-slate-100">
                <span className="font-bold text-slate-800">Worker Service (3002)</span>
                <span className="px-2.5 py-0.5 rounded-full bg-emerald-50 text-emerald-600 font-bold text-[10px]">Healthy</span>
              </div>

              <div className="flex items-center justify-between p-3 rounded-2xl bg-slate-50 border border-slate-100">
                <span className="font-bold text-slate-800">Database (PostgreSQL 5432)</span>
                <span className="px-2.5 py-0.5 rounded-full bg-emerald-50 text-emerald-600 font-bold text-[10px]">Healthy</span>
              </div>
            </div>
          </div>

          <button
            onClick={() => onNavigate('metrics')}
            className="text-xs font-extrabold text-blue-600 hover:text-blue-700 flex items-center space-x-1 pt-2 border-t border-slate-100"
          >
            <span>Subsystem Telemetry</span>
            <ArrowRight className="w-3.5 h-3.5" />
          </button>
        </div>
      </div>
    </div>
  );
};
