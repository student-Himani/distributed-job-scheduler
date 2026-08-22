import React, { useEffect, useState } from 'react';
import { ApiClient } from '../api/client';
import { useAuth } from '../context/AuthContext';
import { Layers, Plus, Pause, Play, Trash2, Shield, RefreshCw, AlertCircle } from 'lucide-react';

interface QueueItem {
  id: string;
  name: string;
  description?: string;
  priority: 'CRITICAL' | 'HIGH' | 'DEFAULT' | 'LOW';
  concurrencyLimit: number;
  isPaused: boolean;
  createdAt: string;
}

export const QueuesView: React.FC = () => {
  const { activeProject } = useAuth();
  const [queues, setQueues] = useState<QueueItem[]>([]);
  const [loading, setLoading] = useState<boolean>(true);

  const [showModal, setShowModal] = useState<boolean>(false);
  const [name, setName] = useState<string>('high-priority-webhooks');
  const [description, setDescription] = useState<string>('Webhook delivery processing queue');
  const [priority, setPriority] = useState<string>('HIGH');
  const [concurrencyLimit, setConcurrencyLimit] = useState<number>(10);
  const [actionError, setActionError] = useState<string>('');

  const fetchQueues = async () => {
    if (!activeProject) return;
    setLoading(true);
    const res = await ApiClient.getQueues(activeProject.id);
    if (res.success && Array.isArray(res.data)) {
      setQueues(res.data as QueueItem[]);
    }
    setLoading(false);
  };

  useEffect(() => {
    fetchQueues();
  }, [activeProject]);

  const handleCreateQueue = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!activeProject) return;
    setActionError('');

    const res = await ApiClient.createQueue(activeProject.id, {
      name,
      description,
      priority,
      concurrencyLimit,
    });

    if (res.success) {
      setShowModal(false);
      fetchQueues();
    } else {
      setActionError(res.error?.message || 'Failed to create queue.');
    }
  };

  const handlePauseQueue = async (queueId: string) => {
    await ApiClient.pauseQueue(queueId);
    fetchQueues();
  };

  const handleResumeQueue = async (queueId: string) => {
    await ApiClient.resumeQueue(queueId);
    fetchQueues();
  };

  const handleDeleteQueue = async (queueId: string) => {
    if (confirm('Are you sure you want to delete this queue?')) {
      await ApiClient.deleteQueue(queueId);
      fetchQueues();
    }
  };

  if (!activeProject) {
    return (
      <div className="p-8 text-center text-slate-500 bg-white rounded-2xl border border-slate-200">
        Please select or create a project first.
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 border-b border-slate-200 pb-4">
        <div>
          <h1 className="text-2xl font-extrabold text-slate-900 tracking-tight flex items-center space-x-2">
            <Layers className="w-6 h-6 text-blue-600" />
            <span>Queues Management</span>
          </h1>
          <p className="text-slate-500 text-xs mt-1">
            Project <span className="font-semibold text-slate-700">{activeProject.name}</span> • Priority Ranking & Concurrency Limits
          </p>
        </div>

        <div className="flex items-center space-x-3">
          <button
            onClick={fetchQueues}
            className="p-2.5 rounded-xl border border-slate-200 bg-white text-slate-600 hover:bg-slate-50 shadow-sm"
          >
            <RefreshCw className="w-4 h-4" />
          </button>
          <button
            onClick={() => setShowModal(true)}
            className="px-4 py-2.5 rounded-xl bg-blue-600 hover:bg-blue-700 text-white font-bold text-xs shadow-md shadow-blue-500/20 flex items-center space-x-2"
          >
            <Plus className="w-4 h-4" />
            <span>Create New Queue</span>
          </button>
        </div>
      </div>

      {/* Queues List */}
      {loading ? (
        <div className="p-12 text-center text-slate-400 animate-pulse bg-white rounded-2xl border border-slate-200">
          Loading project queues...
        </div>
      ) : queues.length === 0 ? (
        <div className="p-12 text-center bg-white rounded-2xl border border-slate-200">
          <Layers className="w-12 h-12 text-slate-300 mx-auto mb-3" />
          <h3 className="text-base font-bold text-slate-800">No Queues Found</h3>
          <p className="text-slate-500 text-xs mt-1 max-w-sm mx-auto">
            Create your first queue to start enqueueing immediate, delayed, and scheduled jobs.
          </p>
          <button
            onClick={() => setShowModal(true)}
            className="mt-4 px-4 py-2 text-xs font-semibold rounded-xl bg-blue-50 text-blue-600 hover:bg-blue-100"
          >
            + Create Queue
          </button>
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
          {queues.map((q) => (
            <div key={q.id} className="p-6 rounded-2xl border border-slate-200 bg-white shadow-sm flex flex-col justify-between space-y-4">
              <div>
                <div className="flex items-center justify-between">
                  <span className={`px-2.5 py-1 text-[11px] font-bold rounded-full border ${
                    q.priority === 'CRITICAL' ? 'bg-rose-50 text-rose-700 border-rose-200' :
                    q.priority === 'HIGH' ? 'bg-amber-50 text-amber-700 border-amber-200' :
                    q.priority === 'DEFAULT' ? 'bg-blue-50 text-blue-700 border-blue-200' :
                    'bg-slate-100 text-slate-600 border-slate-200'
                  }`}>
                    {q.priority} PRIORITY
                  </span>

                  <span className={`px-2 py-0.5 text-[10px] font-semibold rounded-md ${
                    q.isPaused ? 'bg-amber-100 text-amber-800' : 'bg-emerald-100 text-emerald-800'
                  }`}>
                    {q.isPaused ? 'PAUSED' : 'ACTIVE'}
                  </span>
                </div>

                <h3 className="text-lg font-bold text-slate-900 mt-3">{q.name}</h3>
                <p className="text-xs text-slate-500 mt-1 line-clamp-2">{q.description || 'No description provided.'}</p>
              </div>

              <div className="pt-4 border-t border-slate-100 space-y-3">
                <div className="flex items-center justify-between text-xs text-slate-600">
                  <span>Concurrency Limit:</span>
                  <span className="font-bold text-slate-900">{q.concurrencyLimit} Slots</span>
                </div>

                <div className="flex items-center space-x-2 pt-2">
                  {q.isPaused ? (
                    <button
                      onClick={() => handleResumeQueue(q.id)}
                      className="flex-1 py-2 text-xs font-semibold rounded-xl bg-emerald-50 text-emerald-700 hover:bg-emerald-100 flex items-center justify-center space-x-1"
                    >
                      <Play className="w-3.5 h-3.5" />
                      <span>Resume</span>
                    </button>
                  ) : (
                    <button
                      onClick={() => handlePauseQueue(q.id)}
                      className="flex-1 py-2 text-xs font-semibold rounded-xl bg-amber-50 text-amber-700 hover:bg-amber-100 flex items-center justify-center space-x-1"
                    >
                      <Pause className="w-3.5 h-3.5" />
                      <span>Pause</span>
                    </button>
                  )}

                  <button
                    onClick={() => handleDeleteQueue(q.id)}
                    className="p-2 rounded-xl text-slate-400 hover:text-rose-600 hover:bg-rose-50"
                  >
                    <Trash2 className="w-4 h-4" />
                  </button>
                </div>
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Modal */}
      {showModal && (
        <div className="fixed inset-0 bg-slate-900/40 backdrop-blur-sm flex items-center justify-center p-4 z-50">
          <div className="bg-white rounded-3xl p-6 max-w-md w-full shadow-2xl border border-slate-200 space-y-4">
            <h3 className="text-lg font-bold text-slate-900">Create Queue</h3>

            {actionError && (
              <div className="p-3 rounded-xl bg-rose-50 text-rose-700 text-xs flex items-center space-x-2">
                <AlertCircle className="w-4 h-4 text-rose-500" />
                <span>{actionError}</span>
              </div>
            )}

            <form onSubmit={handleCreateQueue} className="space-y-4">
              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-1">Queue Name</label>
                <input
                  type="text"
                  required
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  className="w-full px-3 py-2 text-sm rounded-xl border border-slate-200"
                />
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-1">Description</label>
                <input
                  type="text"
                  value={description}
                  onChange={(e) => setDescription(e.target.value)}
                  className="w-full px-3 py-2 text-sm rounded-xl border border-slate-200"
                />
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-semibold text-slate-700 mb-1">Priority</label>
                  <select
                    value={priority}
                    onChange={(e) => setPriority(e.target.value)}
                    className="w-full px-3 py-2 text-sm rounded-xl border border-slate-200 bg-white"
                  >
                    <option value="CRITICAL">CRITICAL</option>
                    <option value="HIGH">HIGH</option>
                    <option value="DEFAULT">DEFAULT</option>
                    <option value="LOW">LOW</option>
                  </select>
                </div>

                <div>
                  <label className="block text-xs font-semibold text-slate-700 mb-1">Concurrency Limit</label>
                  <input
                    type="number"
                    min="1"
                    max="100"
                    value={concurrencyLimit}
                    onChange={(e) => setConcurrencyLimit(parseInt(e.target.value, 10))}
                    className="w-full px-3 py-2 text-sm rounded-xl border border-slate-200"
                  />
                </div>
              </div>

              <div className="flex justify-end space-x-3 pt-3">
                <button
                  type="button"
                  onClick={() => setShowModal(false)}
                  className="px-4 py-2 rounded-xl text-xs font-semibold text-slate-600 hover:bg-slate-100"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  className="px-4 py-2 rounded-xl bg-blue-600 hover:bg-blue-700 text-white font-bold text-xs"
                >
                  Create Queue
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
};
