import React, { useEffect, useState } from 'react';
import { ApiClient } from '../api/client';
import { useAuth } from '../context/AuthContext';
import { Folder, Plus, Trash2, CheckCircle2, RefreshCw } from 'lucide-react';

interface ProjectItem {
  id: string;
  name: string;
  slug: string;
  organizationId: string;
  description?: string;
  createdAt: string;
}

export const ProjectsView: React.FC = () => {
  const { activeProject, setActiveProject, refreshProjects } = useAuth();
  const [projects, setProjects] = useState<ProjectItem[]>([]);
  const [loading, setLoading] = useState<boolean>(true);

  const [showModal, setShowModal] = useState<boolean>(false);
  const [name, setName] = useState<string>('Payment Gateway Microservice');
  const [description, setDescription] = useState<string>('Stripe and PayPal webhook processing workspace');

  const fetchProjectsList = async () => {
    setLoading(true);
    const res = await ApiClient.getProjects();
    if (res.success && Array.isArray(res.data)) {
      setProjects(res.data as ProjectItem[]);
    }
    setLoading(false);
  };

  useEffect(() => {
    fetchProjectsList();
  }, []);

  const handleCreateProject = async (e: React.FormEvent) => {
    e.preventDefault();
    const res = await ApiClient.createProject({ name, description });
    if (res.success) {
      setShowModal(false);
      await fetchProjectsList();
      await refreshProjects();
    }
  };

  const handleDeleteProject = async (id: string) => {
    if (confirm('Delete this project and all associated queues & jobs?')) {
      await ApiClient.deleteProject(id);
      await fetchProjectsList();
      await refreshProjects();
    }
  };

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 border-b border-slate-200 pb-4">
        <div>
          <h1 className="text-2xl font-extrabold text-slate-900 tracking-tight flex items-center space-x-2">
            <Folder className="w-6 h-6 text-blue-600" />
            <span>Projects & Workspaces</span>
          </h1>
          <p className="text-slate-500 text-xs mt-1">
            Multi-Tenant Project Boundaries • Select Active Workspace
          </p>
        </div>

        <div className="flex items-center space-x-3">
          <button
            onClick={fetchProjectsList}
            className="p-2.5 rounded-xl border border-slate-200 bg-white text-slate-600 hover:bg-slate-50 shadow-sm"
          >
            <RefreshCw className="w-4 h-4" />
          </button>
          <button
            onClick={() => setShowModal(true)}
            className="px-4 py-2.5 rounded-xl bg-blue-600 hover:bg-blue-700 text-white font-bold text-xs shadow-md shadow-blue-500/20 flex items-center space-x-2"
          >
            <Plus className="w-4 h-4" />
            <span>Create New Project</span>
          </button>
        </div>
      </div>

      {/* Projects Grid */}
      {loading ? (
        <div className="p-12 text-center text-slate-400 animate-pulse bg-white rounded-2xl border border-slate-200">
          Loading projects...
        </div>
      ) : projects.length === 0 ? (
        <div className="p-12 text-center bg-white rounded-2xl border border-slate-200">
          <Folder className="w-12 h-12 text-slate-300 mx-auto mb-3" />
          <h3 className="text-base font-bold text-slate-800">No Projects Found</h3>
          <p className="text-slate-500 text-xs mt-1">Create a project workspace to begin managing queues and workers.</p>
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
          {projects.map((p) => {
            const isActive = activeProject?.id === p.id;
            return (
              <div
                key={p.id}
                className={`p-6 rounded-2xl border transition-all flex flex-col justify-between space-y-4 ${
                  isActive ? 'bg-blue-50/40 border-blue-300 ring-2 ring-blue-500/20 shadow-md' : 'bg-white border-slate-200 shadow-sm'
                }`}
              >
                <div>
                  <div className="flex items-center justify-between">
                    <span className="text-[10px] font-mono text-slate-400">{p.slug}</span>
                    {isActive && (
                      <span className="inline-flex items-center gap-1 text-[11px] font-bold text-blue-600 bg-blue-100/80 px-2.5 py-0.5 rounded-full border border-blue-200">
                        <CheckCircle2 className="w-3.5 h-3.5" /> ACTIVE WORKSPACE
                      </span>
                    )}
                  </div>

                  <h3 className="text-lg font-bold text-slate-900 mt-3">{p.name}</h3>
                  <p className="text-xs text-slate-500 mt-1 line-clamp-2">{p.description || 'No description provided.'}</p>
                </div>

                <div className="pt-4 border-t border-slate-100 flex items-center justify-between">
                  <button
                    onClick={() => setActiveProject(p)}
                    disabled={isActive}
                    className={`px-3 py-1.5 rounded-xl text-xs font-semibold ${
                      isActive ? 'bg-blue-600 text-white font-bold' : 'bg-slate-100 text-slate-700 hover:bg-slate-200'
                    }`}
                  >
                    {isActive ? 'Current Selection' : 'Select Project'}
                  </button>

                  <button
                    onClick={() => handleDeleteProject(p.id)}
                    className="p-2 text-slate-400 hover:text-rose-600 rounded-xl hover:bg-rose-50"
                  >
                    <Trash2 className="w-4 h-4" />
                  </button>
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* Modal */}
      {showModal && (
        <div className="fixed inset-0 bg-slate-900/40 backdrop-blur-sm flex items-center justify-center p-4 z-50">
          <div className="bg-white rounded-3xl p-6 max-w-md w-full shadow-2xl border border-slate-200 space-y-4">
            <h3 className="text-lg font-bold text-slate-900">Create Project</h3>

            <form onSubmit={handleCreateProject} className="space-y-4">
              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-1">Project Name</label>
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
                  Create Project
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
};
