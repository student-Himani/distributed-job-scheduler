import React, { useEffect, useState } from 'react';
import { ApiClient } from '../api/client';
import { useAuth } from '../context/AuthContext';
import { FileText, RefreshCw, RotateCcw, Trash2, AlertTriangle } from 'lucide-react';

interface DlqItem {
  id: string;
  jobId: string;
  reason: string;
  failedAtAttempts: number;
  lastError?: string;
  status: 'PENDING' | 'RETRIED' | 'DISCARDED';
  createdAt: string;
  job?: {
    name: string;
    type: string;
  };
}

export const DlqView: React.FC = () => {
  const { activeProject } = useAuth();
  const [dlqEntries, setDlqEntries] = useState<DlqItem[]>([]);
  const [loading, setLoading] = useState<boolean>(true);

  const fetchDlqEntries = async () => {
    if (!activeProject) return;
    const res = await ApiClient.getDlqEntries(activeProject.id);
    if (res.success && Array.isArray(res.data)) {
      setDlqEntries(res.data as DlqItem[]);
    }
    setLoading(false);
  };

  useEffect(() => {
    setLoading(true);
    fetchDlqEntries();
    const interval = setInterval(fetchDlqEntries, 3000);
    return () => clearInterval(interval);
  }, [activeProject]);

  const handleRetry = async (dlqId: string) => {
    await ApiClient.retryDlq(dlqId);
    fetchDlqEntries();
  };

  const handleDiscard = async (dlqId: string) => {
    if (confirm('Discard this DLQ entry?')) {
      await ApiClient.discardDlq(dlqId);
      fetchDlqEntries();
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
            <FileText className="w-6 h-6 text-rose-600" />
            <span>Dead-Letter Queue (DLQ)</span>
          </h1>
          <p className="text-slate-500 text-xs mt-1">
            Project <span className="font-bold text-slate-700">{activeProject.name}</span> • Exhausted Jobs Repository & Manual Re-enqueue
          </p>
        </div>

        <button
          onClick={fetchDlqEntries}
          className="p-2.5 rounded-2xl border border-slate-200 bg-white text-slate-600 hover:bg-slate-50 shadow-sm"
        >
          <RefreshCw className={`w-4 h-4 ${loading ? 'animate-spin text-blue-600' : ''}`} />
        </button>
      </div>

      {/* DLQ Table */}
      {loading ? (
        <div className="p-12 text-center text-slate-400 animate-pulse bg-white rounded-3xl border border-slate-200/80">
          Loading Dead-Letter Queue entries...
        </div>
      ) : dlqEntries.length === 0 ? (
        <div className="p-12 text-center bg-white rounded-3xl border border-slate-200/80 space-y-3">
          <AlertTriangle className="w-12 h-12 text-emerald-500 mx-auto" />
          <h3 className="text-base font-extrabold text-slate-900">Dead-Letter Queue is Empty</h3>
          <p className="text-slate-500 text-xs max-w-md mx-auto">
            No failed jobs have exhausted their maximum retry limit in this workspace. System is operating cleanly.
          </p>
        </div>
      ) : (
        <div className="bg-white rounded-3xl border border-slate-200/80 overflow-hidden shadow-xs">
          <table className="w-full text-left text-xs">
            <thead className="bg-slate-50 border-b border-slate-200 text-slate-500 font-extrabold uppercase text-[10px]">
              <tr>
                <th className="p-4">Job Name / ID</th>
                <th className="p-4">Failed Reason</th>
                <th className="p-4">Failed Attempts</th>
                <th className="p-4">Status</th>
                <th className="p-4">Failed At</th>
                <th className="p-4 text-right">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100 font-medium text-slate-700">
              {dlqEntries.map((e) => (
                <tr key={e.id} className="hover:bg-slate-50/80 transition-colors">
                  <td className="p-4">
                    <span className="font-bold text-slate-900 block">{e.job?.name || 'Failed Task'}</span>
                    <span className="text-[10px] text-slate-400 font-mono">{e.jobId}</span>
                  </td>
                  <td className="p-4 text-rose-600 font-bold max-w-xs truncate">{e.reason}</td>
                  <td className="p-4 text-slate-600 font-semibold">{e.failedAtAttempts} Attempts</td>
                  <td className="p-4">
                    <span className={`px-2.5 py-1 text-[11px] font-bold rounded-full border ${
                      e.status === 'RETRIED' ? 'bg-emerald-50 text-emerald-700 border-emerald-200' :
                      'bg-rose-50 text-rose-700 border-rose-200'
                    }`}>
                      {e.status}
                    </span>
                  </td>
                  <td className="p-4 text-slate-500">{new Date(e.createdAt).toLocaleString()}</td>
                  <td className="p-4 text-right space-x-2">
                    {e.status !== 'RETRIED' && (
                      <button
                        onClick={() => handleRetry(e.id)}
                        className="px-3.5 py-1.5 rounded-xl bg-blue-600 hover:bg-blue-700 text-white font-bold text-xs inline-flex items-center space-x-1 shadow-md shadow-blue-500/20"
                      >
                        <RotateCcw className="w-3.5 h-3.5" />
                        <span>Re-enqueue</span>
                      </button>
                    )}
                    <button
                      onClick={() => handleDiscard(e.id)}
                      className="p-1.5 text-slate-400 hover:text-rose-600 rounded-xl hover:bg-rose-50 inline-flex transition-colors"
                    >
                      <Trash2 className="w-4 h-4" />
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
};
