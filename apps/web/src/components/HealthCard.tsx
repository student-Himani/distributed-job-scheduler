import React from 'react';
import { CheckCircle2, AlertTriangle, XCircle, RefreshCw, Clock } from 'lucide-react';

interface HealthCardProps {
  title: string;
  subtitle: string;
  port: number | string;
  status: 'healthy' | 'degraded' | 'unhealthy' | 'loading';
  uptime?: number;
  lastCheck?: string;
  details?: Record<string, unknown>;
  icon: React.ReactNode;
  accentColor?: 'indigo' | 'violet' | 'emerald' | 'amber';
  onRefresh?: () => void;
}

export const HealthCard: React.FC<HealthCardProps> = ({
  title,
  subtitle,
  port,
  status,
  uptime,
  lastCheck,
  details,
  icon,
  accentColor = 'indigo',
  onRefresh,
}) => {
  const getStatusBadge = () => {
    switch (status) {
      case 'healthy':
        return (
          <span className="inline-flex items-center gap-1.5 rounded-full bg-emerald-50 px-3 py-1 text-xs font-bold text-emerald-700 border border-emerald-200 shadow-sm">
            <CheckCircle2 className="h-3.5 w-3.5 text-emerald-600" /> HEALTHY
          </span>
        );
      case 'degraded':
        return (
          <span className="inline-flex items-center gap-1.5 rounded-full bg-amber-50 px-3 py-1 text-xs font-bold text-amber-700 border border-amber-200 shadow-sm">
            <AlertTriangle className="h-3.5 w-3.5 text-amber-600" /> DEGRADED
          </span>
        );
      case 'unhealthy':
        return (
          <span className="inline-flex items-center gap-1.5 rounded-full bg-rose-50 px-3 py-1 text-xs font-bold text-rose-700 border border-rose-200 shadow-sm">
            <XCircle className="h-3.5 w-3.5 text-rose-600" /> UNHEALTHY
          </span>
        );
      default:
        return (
          <span className="inline-flex items-center gap-1.5 rounded-full bg-slate-100 px-3 py-1 text-xs font-bold text-slate-600 border border-slate-200">
            <RefreshCw className="h-3.5 w-3.5 animate-spin text-slate-500" /> CHECKING
          </span>
        );
    }
  };

  const getIconContainerStyle = () => {
    switch (accentColor) {
      case 'violet':
        return 'bg-violet-50 text-violet-600 border-violet-200/80';
      case 'emerald':
        return 'bg-emerald-50 text-emerald-600 border-emerald-200/80';
      case 'amber':
        return 'bg-amber-50 text-amber-600 border-amber-200/80';
      default:
        return 'bg-indigo-50 text-indigo-600 border-indigo-200/80';
    }
  };

  return (
    <div className="glass-card-light rounded-2xl p-6 transition-all duration-300 hover:shadow-soft-lg hover:-translate-y-0.5 border border-slate-200">
      <div className="flex items-start justify-between">
        <div className="flex items-center space-x-3.5">
          <div className={`flex h-12 w-12 items-center justify-center rounded-2xl border shadow-sm ${getIconContainerStyle()}`}>
            {icon}
          </div>
          <div>
            <h3 className="text-base font-extrabold text-slate-900 flex items-center gap-2">
              {title}
              <span className="text-xs font-mono font-semibold text-slate-500 bg-slate-100 px-2 py-0.5 rounded-md">
                :{port}
              </span>
            </h3>
            <p className="text-xs font-medium text-slate-500">{subtitle}</p>
          </div>
        </div>
        {getStatusBadge()}
      </div>

      <div className="mt-5 grid grid-cols-2 gap-3 rounded-xl bg-slate-50/80 p-3 text-xs border border-slate-200/70">
        <div>
          <span className="text-slate-500 font-medium block">Uptime</span>
          <span className="font-mono font-bold text-slate-800 flex items-center gap-1 mt-0.5">
            <Clock className="h-3.5 w-3.5 text-slate-400" />
            {uptime !== undefined ? `${uptime}s` : 'N/A'}
          </span>
        </div>
        <div>
          <span className="text-slate-500 font-medium block">Last Timestamp</span>
          <span className="font-mono font-semibold text-slate-700 mt-0.5 block truncate">
            {lastCheck ? new Date(lastCheck).toLocaleTimeString() : 'N/A'}
          </span>
        </div>
      </div>

      {details && Object.keys(details).length > 0 && (
        <div className="mt-4 pt-3 border-t border-slate-100">
          <div className="text-[11px] font-mono space-y-1.5">
            {Object.entries(details).map(([key, val]) => (
              <div key={key} className="flex justify-between items-center">
                <span className="text-slate-500 capitalize">{key}:</span>
                <span className="text-slate-800 font-semibold bg-slate-100 px-2 py-0.5 rounded">
                  {String(val)}
                </span>
              </div>
            ))}
          </div>
        </div>
      )}

      {onRefresh && (
        <div className="mt-4 flex justify-end">
          <button
            onClick={onRefresh}
            className="flex items-center gap-1.5 text-xs font-bold text-slate-600 hover:text-indigo-600 transition-colors"
          >
            <RefreshCw className="h-3.5 w-3.5" /> Re-check Status
          </button>
        </div>
      )}
    </div>
  );
};
