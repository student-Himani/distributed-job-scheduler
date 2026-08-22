import React, { useState } from 'react';
import { useAuth } from '../context/AuthContext';
import { ApiClient } from '../api/client';
import { useToast } from './Toast';
import {
  ShieldCheck,
  LayoutDashboard,
  Building,
  Folder,
  Layers,
  Package,
  Cpu,
  Calendar,
  FileText,
  Activity,
  Plus,
  LogOut,
  X,
} from 'lucide-react';

interface SidebarProps {
  activeTab: string;
  onSelectTab: (tab: string) => void;
}

export const Sidebar: React.FC<SidebarProps> = ({ activeTab, onSelectTab }) => {
  const { user, logout, projects, activeProject, setActiveProject, refreshProjects } = useAuth();
  const { showToast } = useToast();

  const [showCreateModal, setShowCreateModal] = useState<boolean>(false);
  const [projectName, setProjectName] = useState<string>('');
  const [projectDesc, setProjectDesc] = useState<string>('');
  const [creating, setCreating] = useState<boolean>(false);

  const navItems = [
    { id: 'dashboard', label: 'Dashboard', icon: <LayoutDashboard className="w-4 h-4" /> },
    { id: 'organizations', label: 'Organizations', icon: <Building className="w-4 h-4" /> },
    { id: 'projects', label: 'Projects', icon: <Folder className="w-4 h-4" /> },
    { id: 'queues', label: 'Queues', icon: <Layers className="w-4 h-4" /> },
    { id: 'jobs', label: 'Jobs & Logs', icon: <Package className="w-4 h-4" /> },
    { id: 'workers', label: 'Worker Fleet', icon: <Cpu className="w-4 h-4" /> },
    { id: 'schedules', label: 'Cron Schedules', icon: <Calendar className="w-4 h-4" /> },
    { id: 'dlq', label: 'Dead Letter Queue', icon: <FileText className="w-4 h-4" /> },
    { id: 'metrics', label: 'Monitoring', icon: <Activity className="w-4 h-4" /> },
  ];

  const handleQuickCreateProject = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!projectName.trim()) return;
    setCreating(true);

    const res = await ApiClient.createProject({
      name: projectName.trim(),
      description: projectDesc.trim(),
    });

    if (res.success && res.data) {
      const newProj = res.data as { id: string; name: string; slug: string; organizationId: string };
      showToast('success', 'Project Created', `Project "${newProj.name}" created and set as active.`);
      await refreshProjects();
      setActiveProject(newProj);
      setShowCreateModal(false);
      setProjectName('');
      setProjectDesc('');
      onSelectTab('dashboard');
    } else {
      showToast('error', 'Project Creation Failed', res.error?.message || 'Could not create project.');
    }
    setCreating(false);
  };

  return (
    <>
      <aside className="w-64 bg-white border-r border-slate-200/80 flex flex-col justify-between p-4 sticky top-0 h-screen shrink-0 font-sans z-30">
        <div className="space-y-5">
          {/* Logo & Brand Header */}
          <div className="flex items-center space-x-3 px-2 pt-2">
            <div className="w-9 h-9 rounded-xl bg-blue-600 text-white flex items-center justify-center shadow-md shadow-blue-500/25">
              <ShieldCheck className="w-5 h-5" />
            </div>
            <span className="text-lg font-black text-slate-900 tracking-tight">JobScheduler Pro</span>
          </div>

          {/* Active Workspace Selector */}
          {projects.length > 0 && (
            <div className="px-1">
              <label className="block text-[10px] font-extrabold uppercase tracking-wider text-slate-400 mb-1 px-1">
                Workspace Project
              </label>
              <div className="flex items-center space-x-2 p-2 rounded-xl border border-slate-200 bg-slate-50 text-xs font-bold text-slate-800">
                <Folder className="w-4 h-4 text-blue-600 shrink-0" />
                <select
                  value={activeProject?.id || ''}
                  onChange={(e) => {
                    const selected = projects.find((p) => p.id === e.target.value);
                    if (selected) setActiveProject(selected);
                  }}
                  className="bg-transparent focus:outline-none cursor-pointer truncate w-full"
                >
                  {projects.map((p) => (
                    <option key={p.id} value={p.id}>
                      {p.name}
                    </option>
                  ))}
                </select>
              </div>
            </div>
          )}

          {/* Navigation Links */}
          <div className="space-y-1">
            {navItems.map((item) => {
              const isActive = activeTab === item.id;
              return (
                <button
                  key={item.id}
                  onClick={() => onSelectTab(item.id)}
                  className={`w-full flex items-center space-x-3 px-3.5 py-2.5 rounded-xl text-xs font-bold transition-all ${
                    isActive
                      ? 'bg-blue-600 text-white shadow-md shadow-blue-500/20'
                      : 'text-slate-600 hover:bg-slate-50 hover:text-slate-900'
                  }`}
                >
                  <span className={isActive ? 'text-white' : 'text-slate-400'}>{item.icon}</span>
                  <span>{item.label}</span>
                </button>
              );
            })}
          </div>
        </div>

        {/* Bottom Section */}
        <div className="pt-4 border-t border-slate-100 space-y-3">
          {/* Create Project Light Blue Pill Button */}
          <button
            onClick={() => setShowCreateModal(true)}
            className="w-full flex items-center justify-center space-x-2 px-3.5 py-2.5 rounded-xl text-xs font-bold bg-blue-50 text-blue-700 hover:bg-blue-100 border border-blue-200/80 transition-all shadow-xs"
          >
            <Plus className="w-4 h-4" />
            <span>Create Project</span>
          </button>

          {/* Logged-in User Profile & Logout */}
          <div className="p-2.5 rounded-2xl bg-slate-50 border border-slate-200/80 flex items-center justify-between">
            <div className="flex items-center space-x-2.5 min-w-0">
              <div className="w-8 h-8 rounded-full bg-slate-900 text-white font-black text-xs flex items-center justify-center shrink-0">
                {user?.firstName ? `${user.firstName[0]}${user.lastName ? user.lastName[0] : ''}` : 'JD'}
              </div>
              <div className="min-w-0">
                <span className="text-xs font-bold text-slate-900 truncate block">
                  {user?.firstName ? `${user.firstName} ${user.lastName || ''}` : user?.email?.split('@')[0] || 'John Doe'}
                </span>
                <span className="text-[10px] text-slate-400 truncate block">
                  {user?.email || 'john.doe@acme.com'}
                </span>
              </div>
            </div>

            <button
              onClick={logout}
              title="Logout"
              className="p-1.5 rounded-xl text-slate-400 hover:text-rose-600 hover:bg-rose-50 transition-colors shrink-0"
            >
              <LogOut className="w-4 h-4" />
            </button>
          </div>
        </div>
      </aside>

      {/* Quick Create Project Modal */}
      {showCreateModal && (
        <div className="fixed inset-0 bg-slate-900/40 backdrop-blur-sm flex items-center justify-center p-4 z-50">
          <div className="bg-white rounded-3xl p-6 max-w-md w-full shadow-2xl border border-slate-200 space-y-4">
            <div className="flex items-center justify-between border-b border-slate-100 pb-3">
              <h3 className="text-base font-bold text-slate-900">Create New Project</h3>
              <button onClick={() => setShowCreateModal(false)} className="text-slate-400 hover:text-slate-600 p-1">
                <X className="w-5 h-5" />
              </button>
            </div>

            <form onSubmit={handleQuickCreateProject} className="space-y-4">
              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-1">Project Name</label>
                <input
                  type="text"
                  required
                  placeholder="e.g. Payment Microservice"
                  value={projectName}
                  onChange={(e) => setProjectName(e.target.value)}
                  className="w-full px-3.5 py-2.5 text-sm rounded-2xl border border-slate-200 focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500"
                />
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-1">Description (Optional)</label>
                <input
                  type="text"
                  placeholder="e.g. Distributed background task workspace"
                  value={projectDesc}
                  onChange={(e) => setProjectDesc(e.target.value)}
                  className="w-full px-3.5 py-2.5 text-sm rounded-2xl border border-slate-200 focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500"
                />
              </div>

              <div className="flex justify-end space-x-3 pt-3">
                <button
                  type="button"
                  onClick={() => setShowCreateModal(false)}
                  className="px-4 py-2 rounded-2xl text-xs font-semibold text-slate-600 hover:bg-slate-100"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={creating}
                  className="px-4 py-2.5 rounded-2xl bg-blue-600 hover:bg-blue-700 text-white font-bold text-xs shadow-md shadow-blue-500/20 disabled:opacity-50"
                >
                  {creating ? 'Creating...' : 'Create & Select'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </>
  );
};
