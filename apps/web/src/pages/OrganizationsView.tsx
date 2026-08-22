import React, { useEffect, useState } from 'react';
import { ApiClient } from '../api/client';
import { useAuth } from '../context/AuthContext';
import { useToast } from '../components/Toast';
import { Building, Plus, RefreshCw, ShieldCheck, X } from 'lucide-react';

interface OrgItem {
  id: string;
  name: string;
  slug: string;
  createdAt: string;
}

export const OrganizationsView: React.FC = () => {
  const { user } = useAuth();
  const { showToast } = useToast();
  const [organizations, setOrganizations] = useState<OrgItem[]>([]);
  const [loading, setLoading] = useState<boolean>(true);

  const [showModal, setShowModal] = useState<boolean>(false);
  const [name, setName] = useState<string>('Stark Enterprise');
  const [creating, setCreating] = useState<boolean>(false);

  const fetchOrgs = async () => {
    setLoading(true);
    const res = await ApiClient.getOrganizations();
    if (res.success && Array.isArray(res.data)) {
      setOrganizations(res.data as OrgItem[]);
    }
    setLoading(false);
  };

  useEffect(() => {
    fetchOrgs();
  }, []);

  const handleCreateOrg = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!name.trim()) return;
    setCreating(true);

    const res = await ApiClient.createOrganization({ name: name.trim() });
    if (res.success && res.data) {
      const createdOrg = res.data as OrgItem;
      showToast('success', 'Organization Created', `Organization "${createdOrg.name}" has been created.`);
      setShowModal(false);
      setName('');
      await fetchOrgs();
    } else {
      showToast('error', 'Creation Failed', res.error?.message || 'Could not create organization.');
    }
    setCreating(false);
  };

  return (
    <div className="space-y-6 font-sans">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 border-b border-slate-200/80 pb-4">
        <div>
          <h1 className="text-2xl font-black text-slate-900 tracking-tight flex items-center space-x-2">
            <Building className="w-6 h-6 text-blue-600" />
            <span>Organizations Management</span>
          </h1>
          <p className="text-slate-500 text-xs mt-1">
            Multi-Tenant Boundary Isolation • Current User: <span className="font-bold text-slate-700">{user?.email}</span>
          </p>
        </div>

        <div className="flex items-center space-x-3">
          <button
            onClick={fetchOrgs}
            className="p-2.5 rounded-2xl border border-slate-200 bg-white text-slate-600 hover:bg-slate-50 shadow-sm"
          >
            <RefreshCw className={`w-4 h-4 ${loading ? 'animate-spin text-blue-600' : ''}`} />
          </button>
          <button
            onClick={() => setShowModal(true)}
            className="px-4 py-2.5 rounded-2xl bg-blue-600 hover:bg-blue-700 text-white font-bold text-xs shadow-md shadow-blue-500/20 flex items-center space-x-2"
          >
            <Plus className="w-4 h-4" />
            <span>Create Organization</span>
          </button>
        </div>
      </div>

      {/* Grid */}
      {loading ? (
        <div className="p-12 text-center text-slate-400 animate-pulse bg-white rounded-3xl border border-slate-200/80">
          Loading organizations...
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
          {organizations.map((org) => {
            const isUserOrg = user?.organizationId === org.id;
            return (
              <div key={org.id} className="p-6 rounded-3xl border border-slate-200/80 bg-white shadow-sm flex flex-col justify-between space-y-4">
                <div>
                  <div className="flex items-center justify-between">
                    <span className="text-[10px] font-mono text-slate-400">{org.slug}</span>
                    {isUserOrg && (
                      <span className="inline-flex items-center gap-1 text-[11px] font-bold text-emerald-700 bg-emerald-50 px-2.5 py-0.5 rounded-full border border-emerald-200">
                        <ShieldCheck className="w-3.5 h-3.5 text-emerald-600" /> YOUR TENANT
                      </span>
                    )}
                  </div>
                  <h3 className="text-lg font-bold text-slate-900 mt-3">{org.name}</h3>
                </div>

                <div className="pt-3 border-t border-slate-100 text-xs text-slate-500">
                  Created At: {new Date(org.createdAt).toLocaleDateString()}
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
            <div className="flex items-center justify-between border-b border-slate-100 pb-3">
              <h3 className="text-base font-bold text-slate-900">Create Organization</h3>
              <button onClick={() => setShowModal(false)} className="text-slate-400 hover:text-slate-600 p-1">
                <X className="w-5 h-5" />
              </button>
            </div>

            <form onSubmit={handleCreateOrg} className="space-y-4">
              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-1">Organization Name</label>
                <input
                  type="text"
                  required
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  className="w-full px-3.5 py-2.5 text-sm rounded-2xl border border-slate-200 focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500"
                />
              </div>

              <div className="flex justify-end space-x-3 pt-3">
                <button
                  type="button"
                  onClick={() => setShowModal(false)}
                  className="px-4 py-2 rounded-2xl text-xs font-semibold text-slate-600 hover:bg-slate-100"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={creating}
                  className="px-4 py-2.5 rounded-2xl bg-blue-600 hover:bg-blue-700 text-white font-bold text-xs shadow-md shadow-blue-500/20 disabled:opacity-50"
                >
                  {creating ? 'Creating...' : 'Create Organization'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
};
