import React from 'react';
import { ThreeCanvas } from '../components/ThreeCanvas';
import {
  ShieldCheck,
  Zap,
  Layers,
  Clock,
  RotateCcw,
  FileText,
  Cpu,
  Building,
  ArrowRight,
  CheckCircle2,
  Server,
  Activity,
} from 'lucide-react';

interface LandingPageProps {
  onNavigateAuth: (isRegister?: boolean) => void;
}

export const LandingPage: React.FC<LandingPageProps> = ({ onNavigateAuth }) => {
  return (
    <div className="min-h-screen bg-slate-50 text-slate-800 font-sans selection:bg-sky-100 selection:text-sky-900 relative overflow-hidden flex flex-col justify-between">
      {/* Background Interactive Ambient Particle Canvas */}
      <ThreeCanvas />

      {/* Header */}
      <header className="w-full bg-white/80 backdrop-blur-md border-b border-slate-200/80 sticky top-0 z-40 px-6 lg:px-12 py-4 flex items-center justify-between shadow-xs">
        <div className="flex items-center space-x-3">
          <div className="w-10 h-10 rounded-2xl bg-blue-600 text-white flex items-center justify-center shadow-lg shadow-blue-500/25">
            <ShieldCheck className="w-6 h-6" />
          </div>
          <span className="text-xl font-black text-slate-900 tracking-tight">JobScheduler Pro</span>
        </div>

        <nav className="hidden md:flex items-center space-x-8 text-sm font-semibold text-slate-600">
          <a href="#features" className="hover:text-blue-600 transition-colors">Features</a>
          <a href="#solutions" className="hover:text-blue-600 transition-colors">Solutions</a>
          <a href="#pricing" className="hover:text-blue-600 transition-colors">Pricing</a>
          <a href="#docs" className="hover:text-blue-600 transition-colors">Docs</a>
          <a href="#company" className="hover:text-blue-600 transition-colors">Company</a>
        </nav>

        <div className="flex items-center space-x-4">
          <button
            onClick={() => onNavigateAuth(false)}
            className="text-sm font-bold text-slate-700 hover:text-blue-600 px-3 py-2 transition-colors"
          >
            Sign in
          </button>
          <button
            onClick={() => onNavigateAuth(true)}
            className="px-5 py-2.5 rounded-full bg-slate-900 hover:bg-slate-800 text-white font-bold text-xs shadow-md transition-all hover:scale-105"
          >
            Get Started
          </button>
        </div>
      </header>

      {/* Hero Section */}
      <main className="max-w-7xl w-full mx-auto px-6 lg:px-12 py-12 md:py-20 grid grid-cols-1 lg:grid-cols-12 gap-12 items-center relative z-10">
        {/* Left Hero Text */}
        <div className="lg:col-span-7 space-y-8">
          <div className="space-y-4">
            <span className="px-4 py-1.5 rounded-full bg-blue-50 border border-blue-200 text-blue-700 text-xs font-extrabold tracking-wider uppercase inline-flex items-center space-x-2 shadow-xs">
              <span className="w-2 h-2 rounded-full bg-blue-600 animate-pulse" />
              <span>ENTERPRISE READY</span>
            </span>

            <h1 className="text-4xl sm:text-5xl lg:text-6xl font-black text-slate-900 tracking-tight leading-[1.15]">
              Distributed Job <br />
              <span className="bg-gradient-to-r from-blue-600 via-indigo-600 to-purple-600 bg-clip-text text-transparent">
                Scheduling Platform
              </span>
            </h1>

            <p className="text-slate-600 text-base sm:text-lg leading-relaxed max-w-xl">
              A modern, scalable, and fault-tolerant distributed job scheduler built for high-performance systems. Automate, monitor, and optimize your background jobs with ease.
            </p>
          </div>

          {/* Call to Action Buttons */}
          <div className="flex flex-wrap items-center gap-4">
            <button
              onClick={() => onNavigateAuth(true)}
              className="px-8 py-3.5 rounded-full bg-slate-900 hover:bg-slate-800 text-white font-extrabold text-sm shadow-xl shadow-slate-900/20 flex items-center space-x-3 transition-all hover:scale-105"
            >
              <span>Get Started Free</span>
              <ArrowRight className="w-4 h-4" />
            </button>
            <button
              onClick={() => onNavigateAuth(false)}
              className="px-8 py-3.5 rounded-full bg-white hover:bg-slate-50 border border-slate-200 text-slate-800 font-extrabold text-sm shadow-sm transition-all"
            >
              Book a Demo
            </button>
          </div>

          {/* 3 Feature Badges below CTAs */}
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 pt-4 border-t border-slate-200/80">
            <div className="p-3.5 rounded-2xl bg-white border border-slate-200/80 shadow-xs flex items-center space-x-3">
              <div className="p-2 rounded-xl bg-blue-50 text-blue-600 shrink-0">
                <Zap className="w-4 h-4" />
              </div>
              <div>
                <h4 className="text-xs font-bold text-slate-900">Atomic Job Claims</h4>
                <p className="text-[10px] text-slate-500">No duplicate execution</p>
              </div>
            </div>

            <div className="p-3.5 rounded-2xl bg-white border border-slate-200/80 shadow-xs flex items-center space-x-3">
              <div className="p-2 rounded-xl bg-indigo-50 text-indigo-600 shrink-0">
                <RotateCcw className="w-4 h-4" />
              </div>
              <div>
                <h4 className="text-xs font-bold text-slate-900">Smart Retries</h4>
                <p className="text-[10px] text-slate-500">Exponential backoff</p>
              </div>
            </div>

            <div className="p-3.5 rounded-2xl bg-white border border-slate-200/80 shadow-xs flex items-center space-x-3">
              <div className="p-2 rounded-xl bg-sky-50 text-sky-600 shrink-0">
                <Activity className="w-4 h-4" />
              </div>
              <div>
                <h4 className="text-xs font-bold text-slate-900">Real-time Monitoring</h4>
                <p className="text-[10px] text-slate-500">Live system telemetry</p>
              </div>
            </div>
          </div>

          {/* Trusted By Engineering Teams Bar */}
          <div className="pt-6">
            <p className="text-[11px] font-extrabold uppercase tracking-widest text-slate-400 mb-3">
              TRUSTED BY ENGINEERING TEAMS
            </p>
            <div className="flex flex-wrap items-center gap-8 text-slate-400 font-extrabold text-xs tracking-wider">
              <span className="flex items-center space-x-1.5 hover:text-slate-600 transition-colors">
                <Building className="w-4 h-4" /> ACME
              </span>
              <span className="flex items-center space-x-1.5 hover:text-slate-600 transition-colors">
                <Server className="w-4 h-4" /> Globex
              </span>
              <span className="flex items-center space-x-1.5 hover:text-slate-600 transition-colors">
                <Layers className="w-4 h-4" /> Initech
              </span>
              <span className="flex items-center space-x-1.5 hover:text-slate-600 transition-colors">
                <ShieldCheck className="w-4 h-4" /> Umbrella
              </span>
              <span className="flex items-center space-x-1.5 hover:text-slate-600 transition-colors">
                <Zap className="w-4 h-4" /> Soylent
              </span>
            </div>
          </div>
        </div>

        {/* Right 3D Isometric Server Vector Illustration */}
        <div className="lg:col-span-5 relative flex items-center justify-center">
          <div className="w-full max-w-lg p-6 rounded-3xl bg-gradient-to-br from-blue-600/10 via-indigo-600/5 to-purple-600/10 border border-blue-200/50 shadow-2xl relative">
            <svg className="w-full h-auto drop-shadow-2xl" viewBox="0 0 500 400" fill="none" xmlns="http://www.w3.org/2000/svg">
              {/* Isometric 3D Server Platform */}
              <path d="M250 50 L420 130 L250 210 L80 130 Z" fill="url(#grid-grad)" opacity="0.9" />
              <path d="M80 130 L250 210 L250 310 L80 230 Z" fill="#1E293B" />
              <path d="M420 130 L250 210 L250 310 L420 230 Z" fill="#0F172A" />

              {/* 3D Stacked Server Racks */}
              <g transform="translate(180, 80)">
                <rect x="0" y="0" width="140" height="40" rx="10" fill="#3B82F6" />
                <circle cx="20" cy="20" r="5" fill="#60A5FA" />
                <circle cx="35" cy="20" r="5" fill="#34D399" />
                <rect x="50" y="16" width="60" height="8" rx="4" fill="#93C5FD" />
              </g>

              <g transform="translate(180, 130)">
                <rect x="0" y="0" width="140" height="40" rx="10" fill="#4F46E5" />
                <circle cx="20" cy="20" r="5" fill="#818CF8" />
                <circle cx="35" cy="20" r="5" fill="#FBBF24" />
                <rect x="50" y="16" width="60" height="8" rx="4" fill="#C7D2FE" />
              </g>

              <g transform="translate(180, 180)">
                <rect x="0" y="0" width="140" height="40" rx="10" fill="#7C3AED" />
                <circle cx="20" cy="20" r="5" fill="#A78BFA" />
                <circle cx="35" cy="20" r="5" fill="#34D399" />
                <rect x="50" y="16" width="60" height="8" rx="4" fill="#DDD6FE" />
              </g>

              {/* Floating Code & Monitor Overlay */}
              <g transform="translate(40, 160)">
                <rect x="0" y="0" width="120" height="90" rx="16" fill="#FFFFFF" stroke="#E2E8F0" strokeWidth="2" />
                <rect x="15" y="20" width="90" height="10" rx="5" fill="#3B82F6" />
                <rect x="15" y="40" width="60" height="8" rx="4" fill="#94A3B8" />
                <rect x="15" y="55" width="75" height="8" rx="4" fill="#CBD5E1" />
              </g>

              <defs>
                <linearGradient id="grid-grad" x1="80" y1="50" x2="420" y2="210" gradientUnits="userSpaceOnUse">
                  <stop stopColor="#3B82F6" />
                  <stop offset="1" stopColor="#8B5CF6" />
                </linearGradient>
              </defs>
            </svg>
          </div>
        </div>
      </main>

      {/* Features Section */}
      <section id="features" className="max-w-7xl w-full mx-auto px-6 lg:px-12 py-16 border-t border-slate-200/80 relative z-10 space-y-12">
        <div className="text-center space-y-3">
          <h2 className="text-3xl sm:text-4xl font-black text-slate-900 tracking-tight">Powerful Features</h2>
          <p className="text-slate-500 text-sm max-w-md mx-auto">Everything you need to manage and scale background jobs</p>
        </div>

        {/* 6 Feature Cards */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
          <div className="p-6 rounded-3xl bg-white border border-slate-200/80 shadow-sm space-y-3 hover:border-blue-300 transition-all">
            <div className="p-3 rounded-2xl bg-blue-50 text-blue-600 w-fit">
              <Layers className="w-6 h-6" />
            </div>
            <h3 className="text-base font-bold text-slate-900">Queue Priorities</h3>
            <p className="text-xs text-slate-500 leading-relaxed">Prioritize jobs with 4 levels from CRITICAL to LOW concurrency limits.</p>
          </div>

          <div className="p-6 rounded-3xl bg-white border border-slate-200/80 shadow-sm space-y-3 hover:border-indigo-300 transition-all">
            <div className="p-3 rounded-2xl bg-indigo-50 text-indigo-600 w-fit">
              <Clock className="w-6 h-6" />
            </div>
            <h3 className="text-base font-bold text-slate-900">Scheduled Jobs</h3>
            <p className="text-xs text-slate-500 leading-relaxed">Cron-based recurring job scheduling with timezone-safe calculations.</p>
          </div>

          <div className="p-6 rounded-3xl bg-white border border-slate-200/80 shadow-sm space-y-3 hover:border-sky-300 transition-all">
            <div className="p-3 rounded-2xl bg-sky-50 text-sky-600 w-fit">
              <RotateCcw className="w-6 h-6" />
            </div>
            <h3 className="text-base font-bold text-slate-900">Retry & Backoff</h3>
            <p className="text-xs text-slate-500 leading-relaxed">Automatic retry with linear & exponential backoff policies.</p>
          </div>

          <div className="p-6 rounded-3xl bg-white border border-slate-200/80 shadow-sm space-y-3 hover:border-rose-300 transition-all">
            <div className="p-3 rounded-2xl bg-rose-50 text-rose-600 w-fit">
              <FileText className="w-6 h-6" />
            </div>
            <h3 className="text-base font-bold text-slate-900">Dead Letter Queue</h3>
            <p className="text-xs text-slate-500 leading-relaxed">Failed jobs are moved to DLQ after max retries for inspection.</p>
          </div>

          <div className="p-6 rounded-3xl bg-white border border-slate-200/80 shadow-sm space-y-3 hover:border-purple-300 transition-all">
            <div className="p-3 rounded-2xl bg-purple-50 text-purple-600 w-fit">
              <Cpu className="w-6 h-6" />
            </div>
            <h3 className="text-base font-bold text-slate-900">Worker Management</h3>
            <p className="text-xs text-slate-500 leading-relaxed">Real-time worker monitoring, heartbeat telemetry, and auto-scaling.</p>
          </div>

          <div className="p-6 rounded-3xl bg-white border border-slate-200/80 shadow-sm space-y-3 hover:border-emerald-300 transition-all">
            <div className="p-3 rounded-2xl bg-emerald-50 text-emerald-600 w-fit">
              <Building className="w-6 h-6" />
            </div>
            <h3 className="text-base font-bold text-slate-900">Multi-tenancy</h3>
            <p className="text-xs text-slate-500 leading-relaxed">Organization and project isolated workspaces with strict boundaries.</p>
          </div>
        </div>

        {/* Purple/Indigo Banner CTA Card */}
        <div className="p-10 rounded-3xl bg-gradient-to-r from-blue-600 via-indigo-600 to-purple-600 text-white shadow-2xl flex flex-col md:flex-row items-center justify-between gap-6">
          <div className="space-y-2 text-center md:text-left">
            <h3 className="text-2xl sm:text-3xl font-black">Ready to optimize your background job processing?</h3>
            <p className="text-blue-100 text-xs sm:text-sm">Join thousands of developers who trust JobScheduler Pro</p>
          </div>

          <button
            onClick={() => onNavigateAuth(true)}
            className="px-8 py-3.5 rounded-full bg-slate-900 hover:bg-slate-800 text-white font-extrabold text-xs shadow-xl flex items-center space-x-2 transition-all hover:scale-105 shrink-0"
          >
            <span>Get Started Free</span>
            <ArrowRight className="w-4 h-4" />
          </button>
        </div>
      </section>

      {/* Footer */}
      <footer className="bg-white border-t border-slate-200/80 py-6 px-8 text-center text-xs text-slate-500 relative z-10">
        Distributed Job Scheduler Monorepo • Module 14 Production Delivery
      </footer>
    </div>
  );
};
