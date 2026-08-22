import React, { useEffect, useState } from 'react';
import { ApiClient } from '../api/client';
import { useAuth } from '../context/AuthContext';
import { Calendar, Plus, Pause, Play, Trash2, RefreshCw, AlertCircle } from 'lucide-react';

interface QueueItem {
  id: string;
  name: string;
}

interface ScheduleItem {
  id: string;
  name: string;
  status: string;
  queue?: { name: string };
  scheduledJob?: {
    cronExpression: string;
    timezone: string;
    nextRunAt: string;
    totalRuns: number;
  };
  createdAt: string;
}

export const SchedulesView: React.FC = () => {
  const { activeProject } = useAuth();
  const [schedules, setSchedules] = useState<ScheduleItem[]>([]);
  const [queues, setQueues] = useState<QueueItem[]>([]);
  const [loading, setLoading] = useState<boolean>(true);

  const [showModal, setShowModal] = useState<boolean>(false);
  const [queueId, setQueueId] = useState<string>('');
  const [name, setName] = useState<string>('Daily Analytics Report');
  const [cronExpression, setCronExpression] = useState<string>('0 0 * * *');
  const [timezone, setTimezone] = useState<string>('UTC');
  const [actionError, setActionError] = useState<string>('');

  const fetchSchedulesAndQueues = async () => {
    if (!activeProject) return;
    setLoading(true);

    const [schedRes, queuesRes] = await Promise.all([
      ApiClient.getSchedules(activeProject.id),
      ApiClient.getQueues(activeProject.id),
    ]);

    if (schedRes.success && Array.isArray(schedRes.data)) {
      setSchedules(schedRes.data as ScheduleItem[]);
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
    fetchSchedulesAndQueues();
  }, [activeProject]);

  const handleCreateSchedule = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!activeProject || !queueId) return;
    setActionError('');

    const res = await ApiClient.createSchedule(activeProject.id, queueId, {
      name,
      cronExpression,
      timezone,
    });

    if (res.success) {
      setShowModal(false);
      fetchSchedulesAndQueues();
    } else {
      setActionError(res.error?.message || 'Failed to create recurring schedule.');
    }
  };

  const handlePauseSchedule = async (id: string) => {
    await ApiClient.pauseSchedule(id);
    fetchSchedulesAndQueues();
  };

  const handleResumeSchedule = async (id: string) => {
    await ApiClient.resumeSchedule(id);
    fetchSchedulesAndQueues();
  };

  const handleDeleteSchedule = async (id: string) => {
    if (confirm('Delete this recurring schedule?')) {
      await ApiClient.deleteSchedule(id);
      fetchSchedulesAndQueues();
    }
  };

  if (!activeProject) {
    return <div className="p-8 text-center text-slate-500 bg-white rounded-2xl border">Select a project first.</div>;
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 border-b border-slate-200 pb-4">
        <div>
          <h1 className="text-2xl font-extrabold text-slate-900 tracking-tight flex items-center space-x-2">
            <Calendar className="w-6 h-6 text-blue-600" />
            <span>Cron & Recurring Schedules</span>
          </h1>
          <p className="text-slate-500 text-xs mt-1">
            Project <span className="font-semibold text-slate-700">{activeProject.name}</span> • Automatic Timezone-Safe Cron Timers
          </p>
        </div>

        <div className="flex items-center space-x-3">
          <button
            onClick={fetchSchedulesAndQueues}
            className="p-2.5 rounded-xl border border-slate-200 bg-white text-slate-600 hover:bg-slate-50 shadow-sm"
          >
            <RefreshCw className="w-4 h-4" />
          </button>
          <button
            onClick={() => setShowModal(true)}
            className="px-4 py-2.5 rounded-xl bg-blue-600 hover:bg-blue-700 text-white font-bold text-xs shadow-md shadow-blue-500/20 flex items-center space-x-2"
          >
            <Plus className="w-4 h-4" />
            <span>Create Recurring Schedule</span>
          </button>
        </div>
      </div>

      {/* Schedules Table */}
      {loading ? (
        <div className="p-12 text-center text-slate-400 animate-pulse bg-white rounded-2xl border border-slate-200">
          Loading recurring schedules...
        </div>
      ) : schedules.length === 0 ? (
        <div className="p-12 text-center bg-white rounded-2xl border border-slate-200">
          <Calendar className="w-12 h-12 text-slate-300 mx-auto mb-3" />
          <h3 className="text-base font-bold text-slate-800">No Schedules Configured</h3>
          <p className="text-slate-500 text-xs mt-1">
            Create cron recurring tasks to automatically run nightly, hourly, or weekly jobs.
          </p>
          <button
            onClick={() => setShowModal(true)}
            className="mt-4 px-4 py-2 text-xs font-semibold rounded-xl bg-blue-50 text-blue-600 hover:bg-blue-100"
          >
            + Create Schedule
          </button>
        </div>
      ) : (
        <div className="bg-white rounded-2xl border border-slate-200 overflow-hidden shadow-sm">
          <table className="w-full text-left text-xs">
            <thead className="bg-slate-50 border-b border-slate-200 text-slate-500 font-bold uppercase tracking-wider">
              <tr>
                <th className="p-4">Schedule Name</th>
                <th className="p-4">Cron Expression</th>
                <th className="p-4">Timezone</th>
                <th className="p-4">Next Run At</th>
                <th className="p-4">Status</th>
                <th className="p-4 text-right">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100 font-medium">
              {schedules.map((s) => (
                <tr key={s.id} className="hover:bg-slate-50/80 transition-colors">
                  <td className="p-4 font-bold text-slate-900">{s.name}</td>
                  <td className="p-4 font-mono font-bold text-blue-600 bg-blue-50/50 rounded-lg px-2.5 py-1 w-fit">
                    {s.scheduledJob?.cronExpression || '*/5 * * * *'}
                  </td>
                  <td className="p-4 text-slate-600">{s.scheduledJob?.timezone || 'UTC'}</td>
                  <td className="p-4 text-slate-700">
                    {s.scheduledJob?.nextRunAt ? new Date(s.scheduledJob.nextRunAt).toLocaleString() : 'N/A'}
                  </td>
                  <td className="p-4">
                    <span className={`px-2.5 py-1 text-[11px] font-bold rounded-full border ${
                      s.status === 'SCHEDULED' ? 'bg-emerald-50 text-emerald-700 border-emerald-200' :
                      'bg-amber-50 text-amber-700 border-amber-200'
                    }`}>
                      {s.status}
                    </span>
                  </td>
                  <td className="p-4 text-right space-x-2">
                    {s.status === 'SCHEDULED' ? (
                      <button
                        onClick={() => handlePauseSchedule(s.id)}
                        className="px-3 py-1.5 rounded-lg bg-amber-50 text-amber-700 font-semibold"
                      >
                        Pause
                      </button>
                    ) : (
                      <button
                        onClick={() => handleResumeSchedule(s.id)}
                        className="px-3 py-1.5 rounded-lg bg-emerald-50 text-emerald-700 font-semibold"
                      >
                        Resume
                      </button>
                    )}
                    <button
                      onClick={() => handleDeleteSchedule(s.id)}
                      className="p-1.5 text-slate-400 hover:text-rose-600 rounded-lg hover:bg-rose-50"
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

      {/* Modal */}
      {showModal && (
        <div className="fixed inset-0 bg-slate-900/40 backdrop-blur-sm flex items-center justify-center p-4 z-50">
          <div className="bg-white rounded-3xl p-6 max-w-md w-full shadow-2xl border border-slate-200 space-y-4">
            <h3 className="text-lg font-bold text-slate-900">Create Recurring Schedule</h3>

            {actionError && (
              <div className="p-3 rounded-xl bg-rose-50 text-rose-700 text-xs flex items-center space-x-2">
                <AlertCircle className="w-4 h-4 text-rose-500" />
                <span>{actionError}</span>
              </div>
            )}

            <form onSubmit={handleCreateSchedule} className="space-y-4">
              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-1">Target Queue</label>
                <select
                  value={queueId}
                  onChange={(e) => setQueueId(e.target.value)}
                  className="w-full px-3 py-2 text-sm rounded-xl border border-slate-200 bg-white"
                >
                  {queues.map((q) => (
                    <option key={q.id} value={q.id}>{q.name}</option>
                  ))}
                </select>
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-1">Schedule Name</label>
                <input
                  type="text"
                  required
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  className="w-full px-3 py-2 text-sm rounded-xl border border-slate-200"
                />
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-semibold text-slate-700 mb-1">Cron Expression</label>
                  <input
                    type="text"
                    required
                    value={cronExpression}
                    onChange={(e) => setCronExpression(e.target.value)}
                    placeholder="0 0 * * *"
                    className="w-full px-3 py-2 text-sm font-mono rounded-xl border border-slate-200"
                  />
                </div>

                <div>
                  <label className="block text-xs font-semibold text-slate-700 mb-1">Timezone</label>
                  <input
                    type="text"
                    value={timezone}
                    onChange={(e) => setTimezone(e.target.value)}
                    className="w-full px-3 py-2 text-sm rounded-xl border border-slate-200"
                  />
                </div>
              </div>

              <div className="p-3 bg-slate-50 rounded-xl text-[11px] text-slate-500 space-y-1 border border-slate-100">
                <span className="font-bold text-slate-700 block">Cron Examples:</span>
                <div><code className="text-blue-600 font-bold">*/5 * * * *</code> - Every 5 minutes</div>
                <div><code className="text-blue-600 font-bold">0 0 * * *</code> - Daily at midnight</div>
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
                  Create Schedule
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
};
