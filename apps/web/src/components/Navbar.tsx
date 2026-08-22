import React from 'react';
import { useAuth } from '../context/AuthContext';
import { Bell, Settings, Folder } from 'lucide-react';

export const Navbar: React.FC = () => {
  const { user, activeProject } = useAuth();

  const initials = user?.firstName
    ? `${user.firstName[0]}${user.lastName ? user.lastName[0] : ''}`
    : 'JD';

  return (
    <header className="bg-white border-b border-slate-200/80 sticky top-0 z-20 px-8 py-3.5 flex items-center justify-between shadow-xs font-sans">
      {/* Active Workspace / Project Selector Indicator */}
      <div className="flex items-center space-x-2 text-xs font-bold text-slate-700">
        <Folder className="w-4 h-4 text-blue-600" />
        <span>{user?.organizationName || 'Acme Enterprise'}</span>
        <span className="text-slate-300">/</span>
        <span className="text-blue-600 font-extrabold">{activeProject ? activeProject.name : 'Payment Service'}</span>
      </div>

      {/* Header Actions: Notifications, Settings, Avatar Badge */}
      <div className="flex items-center space-x-4">
        <button className="p-2 rounded-xl text-slate-400 hover:text-slate-600 hover:bg-slate-50 transition-colors relative">
          <Bell className="w-4 h-4" />
          <span className="w-2 h-2 rounded-full bg-blue-600 absolute top-1.5 right-1.5 ring-2 ring-white" />
        </button>

        <button className="p-2 rounded-xl text-slate-400 hover:text-slate-600 hover:bg-slate-50 transition-colors">
          <Settings className="w-4 h-4" />
        </button>

        <div className="w-8 h-8 rounded-full bg-slate-900 text-white font-extrabold text-xs flex items-center justify-center shadow-xs">
          {initials}
        </div>
      </div>
    </header>
  );
};
