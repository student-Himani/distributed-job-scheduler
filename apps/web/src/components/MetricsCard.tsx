import React from 'react';

interface MetricsCardProps {
  title: string;
  value: number | string;
  subtitle?: string;
  icon: React.ReactNode;
  variant?: 'blue' | 'emerald' | 'amber' | 'rose' | 'indigo' | 'slate';
}

export const MetricsCard: React.FC<MetricsCardProps> = ({
  title,
  value,
  subtitle,
  icon,
  variant = 'blue',
}) => {
  const variantStyles = {
    blue: 'bg-blue-50/50 border-blue-200 text-blue-900 icon-bg:bg-blue-100 icon-text:text-blue-600',
    emerald: 'bg-emerald-50/50 border-emerald-200 text-emerald-900 icon-bg:bg-emerald-100 icon-text:text-emerald-600',
    amber: 'bg-amber-50/50 border-amber-200 text-amber-900 icon-bg:bg-amber-100 icon-text:text-amber-600',
    rose: 'bg-rose-50/50 border-rose-200 text-rose-900 icon-bg:bg-rose-100 icon-text:text-rose-600',
    indigo: 'bg-indigo-50/50 border-indigo-200 text-indigo-900 icon-bg:bg-indigo-100 icon-text:text-indigo-600',
    slate: 'bg-slate-50/50 border-slate-200 text-slate-900 icon-bg:bg-slate-100 icon-text:text-slate-600',
  };

  return (
    <div className={`p-5 rounded-2xl border ${variantStyles[variant]} backdrop-blur-sm transition-all duration-200 hover:shadow-md`}>
      <div className="flex items-center justify-between">
        <span className="text-xs font-semibold uppercase tracking-wider text-slate-500">{title}</span>
        <div className="p-2 rounded-xl bg-white/80 shadow-sm border border-slate-100">
          {icon}
        </div>
      </div>
      <div className="mt-3 flex items-baseline justify-between">
        <span className="text-3xl font-extrabold tracking-tight text-slate-900">{value}</span>
        {subtitle && <span className="text-xs font-medium text-slate-500">{subtitle}</span>}
      </div>
    </div>
  );
};
