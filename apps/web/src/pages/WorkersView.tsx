import React, { useEffect, useState } from 'react';
import { ApiClient } from '../api/client';
import { useAuth } from '../context/AuthContext';
import { Cpu, RefreshCw, Activity, ShieldCheck, Power } from 'lucide-react';
import { WorkerStats } from '../components/WorkerStats';

interface WorkerItem {
  id: string;
  name: string;
  status: 'ONLINE' | 'BUSY' | 'DRAINING' | 'DEAD' | 'OFFLINE';
  maxConcurrency: number;
  currentConcurrency: number;
  lastHeartbeatAt: string;
  cpuUsage?: number;
  memoryUsage?: number;
}

export const WorkersView: React.FC = () => {
  const { activeProject } = useAuth();
  const [workers, setWorkers] = useState<WorkerItem[]>([]);
  const [loading, setLoading] = useState<boolean>(true);

  const fetchWorkers = async () => {
    if (!activeProject) return;
    setLoading(true);
    const res = await ApiClient.getWorkers(activeProject.id);
    if (res.success && Array.isArray(res.data)) {
      setWorkers(res.data as WorkerItem[]);
    }
    setLoading(false);
  };

  useEffect(() => {
    fetchWorkers();
    const interval = setInterval(fetchWorkers, 5000);
    return () => clearInterval(interval);
  }, [activeProject]);

  const handleStatusUpdate = async (workerId: string, newStatus: string) => {
    await ApiClient.updateWorkerStatus(workerId, newStatus);
    fetchWorkers();
  };

  if (!activeProject) {
    return <div className="p-8 text-center text-slate-500 bg-white rounded-2xl border">Select a project first.</div>;
  }

  const onlineCount = workers.filter((w) => w.status === 'ONLINE').length;
  const busyCount = workers.filter((w) => w.status === 'BUSY').length;
  const deadCount = workers.filter((w) => w.status === 'DEAD' || w.status === 'OFFLINE').length;
  const totalCapacity = workers.reduce((acc, w) => acc + w.maxConcurrency, 0);
  const activeConcurrency = workers.reduce((acc, w) => acc + w.currentConcurrency, 0);

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 border-b border-slate-200 pb-4">
        <div>
          <h1 className="text-2xl font-extrabold text-slate-900 tracking-tight flex items-center space-x-2">
            <Cpu className="w-6 h-6 text-blue-600" />
            <span>Worker Node Fleet</span>
          </h1>
          <p className="text-slate-500 text-xs mt-1">
            Project <span className="font-semibold text-slate-700">{activeProject.name}</span> • Telemetry & Capacity Management
          </p>
        </div>

        <button
          onClick={fetchWorkers}
          className="p-2.5 rounded-xl border border-slate-200 bg-white text-slate-600 hover:bg-slate-50 shadow-sm"
        >
          <RefreshCw className="w-4 h-4" />
        </button>
      </div>

      {/* Capacity Overview Gauge */}
      <WorkerStats
        online={onlineCount}
        busy={busyCount}
        dead={deadCount}
        totalCapacity={totalCapacity}
        activeConcurrency={activeConcurrency}
      />

      {/* Worker Cards */}
      {loading ? (
        <div className="p-12 text-center text-slate-400 animate-pulse bg-white rounded-2xl border border-slate-200">
          Loading worker nodes...
        </div>
      ) : workers.length === 0 ? (
        <div className="p-12 text-center bg-white rounded-2xl border border-slate-200">
          <Cpu className="w-12 h-12 text-slate-300 mx-auto mb-3" />
          <h3 className="text-base font-bold text-slate-800">No Workers Registered</h3>
          <p className="text-slate-500 text-xs mt-1">
            Start an instance of <code className="bg-slate-100 px-2 py-0.5 rounded text-blue-600">apps/worker</code> daemon to begin processing jobs.
          </p>
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
          {workers.map((w) => (
            <div key={w.id} className="p-6 rounded-2xl border border-slate-200 bg-white shadow-sm flex flex-col justify-between space-y-4">
              <div>
                <div className="flex items-center justify-between">
                  <span className={`px-2.5 py-1 text-[11px] font-bold rounded-full border ${
                    w.status === 'ONLINE' ? 'bg-emerald-50 text-emerald-700 border-emerald-200' :
                    w.status === 'BUSY' ? 'bg-blue-50 text-blue-700 border-blue-200' :
                    w.status === 'DRAINING' ? 'bg-amber-50 text-amber-700 border-amber-200' :
                    'bg-rose-50 text-rose-700 border-rose-200'
                  }`}>
                    ● {w.status}
                  </span>
                  <span className="text-[10px] text-slate-400 font-mono">{w.id.substring(0, 8)}...</span>
                </div>

                <h3 className="text-base font-bold text-slate-900 mt-3">{w.name}</h3>
                <p className="text-xs text-slate-400 mt-1">
                  Last Heartbeat: {new Date(w.lastHeartbeatAt).toLocaleTimeString()}
                </p>
              </div>

              <div className="pt-4 border-t border-slate-100 space-y-3">
                <div className="flex items-center justify-between text-xs text-slate-600">
                  <span>Concurrency Load</span>
                  <span className="font-bold text-slate-900">{w.currentConcurrency} / {w.maxConcurrency} Slots</span>
                </div>

                <div className="pt-2 flex items-center space-x-2">
                  {w.status !== 'DRAINING' ? (
                    <button
                      onClick={() => handleStatusUpdate(w.id, 'DRAINING')}
                      className="w-full py-2 text-xs font-semibold rounded-xl bg-amber-50 text-amber-700 hover:bg-amber-100 flex items-center justify-center space-x-1"
                    >
                      <Power className="w-3.5 h-3.5" />
                      <span>Drain Node</span>
                    </button>
                  ) : (
                    <button
                      onClick={() => handleStatusUpdate(w.id, 'ONLINE')}
                      className="w-full py-2 text-xs font-semibold rounded-xl bg-emerald-50 text-emerald-700 hover:bg-emerald-100 flex items-center justify-center space-x-1"
                    >
                      <ShieldCheck className="w-3.5 h-3.5" />
                      <span>Activate Node</span>
                    </button>
                  )}
                </div>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
};
