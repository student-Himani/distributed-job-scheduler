import React from 'react';

interface WorkerStatsProps {
  online: number;
  busy: number;
  dead: number;
  totalCapacity: number;
  activeConcurrency: number;
}

export const WorkerStats: React.FC<WorkerStatsProps> = ({
  online,
  busy,
  dead,
  totalCapacity,
  activeConcurrency,
}) => {
  const usagePercentage = totalCapacity > 0 ? Math.min(100, Math.round((activeConcurrency / totalCapacity) * 100)) : 0;

  return (
    <div className="p-6 rounded-2xl border border-slate-200 bg-white shadow-sm">
      <div className="flex items-center justify-between mb-4">
        <div>
          <h3 className="text-base font-bold text-slate-900">Worker Fleet & Concurrency Capacity</h3>
          <p className="text-xs text-slate-500">Live capacity metrics across all worker nodes</p>
        </div>
        <span className="px-3 py-1 text-xs font-semibold rounded-full bg-blue-50 text-blue-700 border border-blue-200">
          {online + busy} Nodes Active
        </span>
      </div>

      {/* Capacity Progress Bar */}
      <div className="mt-4">
        <div className="flex items-center justify-between text-xs font-semibold text-slate-600 mb-1.5">
          <span>Active Concurrency Usage</span>
          <span>{activeConcurrency} / {totalCapacity} Slots ({usagePercentage}%)</span>
        </div>
        <div className="w-full bg-slate-100 rounded-full h-3 overflow-hidden p-0.5 border border-slate-200">
          <div
            className="bg-gradient-to-r from-blue-500 to-indigo-600 h-full rounded-full transition-all duration-500"
            style={{ width: `${usagePercentage}%` }}
          />
        </div>
      </div>

      {/* Worker Status Pills */}
      <div className="grid grid-cols-3 gap-3 mt-5 pt-4 border-t border-slate-100 text-center">
        <div className="p-2.5 rounded-xl bg-emerald-50/50 border border-emerald-100">
          <span className="block text-xs font-medium text-emerald-600">Idle Online</span>
          <span className="text-lg font-bold text-emerald-900">{online}</span>
        </div>
        <div className="p-2.5 rounded-xl bg-blue-50/50 border border-blue-100">
          <span className="block text-xs font-medium text-blue-600">Busy Executing</span>
          <span className="text-lg font-bold text-blue-900">{busy}</span>
        </div>
        <div className="p-2.5 rounded-xl bg-rose-50/50 border border-rose-100">
          <span className="block text-xs font-medium text-rose-600">Dead / Offline</span>
          <span className="text-lg font-bold text-rose-900">{dead}</span>
        </div>
      </div>
    </div>
  );
};
