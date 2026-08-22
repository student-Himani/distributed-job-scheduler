import React, { useState } from 'react';
import { useAuth } from './context/AuthContext';
import { Navbar } from './components/Navbar';
import { Sidebar } from './components/Sidebar';
import { LandingPage } from './pages/LandingPage';
import { AuthView } from './pages/AuthView';
import { DashboardView } from './pages/DashboardView';
import { OrganizationsView } from './pages/OrganizationsView';
import { ProjectsView } from './pages/ProjectsView';
import { QueuesView } from './pages/QueuesView';
import { JobsView } from './pages/JobsView';
import { WorkersView } from './pages/WorkersView';
import { SchedulesView } from './pages/SchedulesView';
import { DlqView } from './pages/DlqView';
import { MetricsView } from './pages/MetricsView';

export const App: React.FC = () => {
  const { token, loading } = useAuth();
  const [activeTab, setActiveTab] = useState<string>('dashboard');
  const [showAuthScreen, setShowAuthScreen] = useState<boolean>(false);
  const [authIsRegister, setAuthIsRegister] = useState<boolean>(false);

  if (loading) {
    return (
      <div className="min-h-screen bg-slate-100 flex items-center justify-center text-slate-500 font-sans font-bold animate-pulse text-sm">
        Initializing JobScheduler Pro Dashboard...
      </div>
    );
  }

  // If user is not authenticated:
  if (!token) {
    if (showAuthScreen) {
      return (
        <AuthView
          initialRegister={authIsRegister}
          onBackToLanding={() => setShowAuthScreen(false)}
        />
      );
    }
    return (
      <LandingPage
        onNavigateAuth={(isRegister = false) => {
          setAuthIsRegister(isRegister);
          setShowAuthScreen(true);
        }}
      />
    );
  }

  // If user is authenticated: render Dashboard with fixed sidebar & top header
  return (
    <div className="min-h-screen bg-slate-50 text-slate-800 font-sans selection:bg-blue-100 selection:text-blue-900 flex flex-col">
      <div className="flex flex-1">
        <Sidebar activeTab={activeTab} onSelectTab={setActiveTab} />

        <div className="flex-1 flex flex-col min-w-0">
          <Navbar />

          <main className="flex-1 p-8 max-w-7xl w-full mx-auto">
            {activeTab === 'dashboard' && <DashboardView onNavigate={setActiveTab} />}
            {activeTab === 'organizations' && <OrganizationsView />}
            {activeTab === 'projects' && <ProjectsView />}
            {activeTab === 'queues' && <QueuesView />}
            {activeTab === 'jobs' && <JobsView />}
            {activeTab === 'workers' && <WorkersView />}
            {activeTab === 'schedules' && <SchedulesView />}
            {activeTab === 'dlq' && <DlqView />}
            {activeTab === 'metrics' && <MetricsView />}
          </main>
        </div>
      </div>
    </div>
  );
};
