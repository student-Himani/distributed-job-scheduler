import React, { useState, useEffect } from 'react';
import { ApiClient } from '../api/client';
import { useAuth } from '../context/AuthContext';
import { useToast } from '../components/Toast';
import {
  ShieldCheck,
  Lock,
  Mail,
  User,
  Building,
  ArrowRight,
  AlertCircle,
  ArrowLeft,
} from 'lucide-react';

interface AuthViewProps {
  initialRegister?: boolean;
  onBackToLanding?: () => void;
}

export const AuthView: React.FC<AuthViewProps> = ({ initialRegister = false, onBackToLanding }) => {
  const { login } = useAuth();
  const { showToast } = useToast();

  const [isRegister, setIsRegister] = useState<boolean>(initialRegister);
  const [email, setEmail] = useState<string>('himanichaudhari66@gmail.com');
  const [password, setPassword] = useState<string>('Password123!');
  const [firstName, setFirstName] = useState<string>('Himani');
  const [lastName, setLastName] = useState<string>('Chaudhari');
  const [organizationName, setOrganizationName] = useState<string>('SGGSIE&T');
  const [rememberMe, setRememberMe] = useState<boolean>(true);

  const [loading, setLoading] = useState<boolean>(false);
  const [errorMsg, setErrorMsg] = useState<string>('');
  const [fieldErrors, setFieldErrors] = useState<Record<string, string[]>>({});

  useEffect(() => {
    const urlParams = new URLSearchParams(window.location.search);
    const errParam = urlParams.get('error');
    if (errParam) {
      setErrorMsg(errParam);
      showToast('error', 'Authentication Failed', errParam);
      window.history.replaceState({}, document.title, window.location.pathname);
    }
  }, []);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setErrorMsg('');
    setFieldErrors({});

    const fullName = `${firstName} ${lastName}`.trim();

    if (isRegister) {
      const res = await ApiClient.register({
        email,
        password,
        name: fullName,
        organizationName,
      });

      if (res.success && res.data) {
        const data = res.data as { token: string; user: { id: string; email: string; role: string; organizationId: string } };
        showToast('success', 'Registration Successful', 'Welcome to JobScheduler Pro.');
        login(data.token, data.user);
      } else {
        const msg = res.error?.message || 'Registration failed.';
        setErrorMsg(msg);
        showToast('error', 'Registration Error', msg);
        if (res.error?.details) {
          setFieldErrors(res.error.details as Record<string, string[]>);
        }
      }
    } else {
      const res = await ApiClient.login({ email, password });
      if (res.success && res.data) {
        const data = res.data as { token: string; user: { id: string; email: string; role: string; organizationId: string } };
        showToast('success', 'Signed In', `Authenticated as ${data.user.email}`);
        login(data.token, data.user);
      } else {
        const msg = res.error?.message || 'Invalid credentials.';
        setErrorMsg(msg);
        showToast('error', 'Login Error', msg);
        if (res.error?.details) {
          setFieldErrors(res.error.details as Record<string, string[]>);
        }
      }
    }
    setLoading(false);
  };

  const handleGoogleLogin = () => {
    window.location.href = 'http://localhost:3001/api/v1/auth/google';
  };

  return (
    <div className="min-h-screen bg-slate-100 flex items-center justify-center p-4 md:p-8 font-sans selection:bg-blue-100 selection:text-blue-900">
      <div className="max-w-5xl w-full bg-white rounded-3xl border border-slate-200/80 shadow-2xl overflow-hidden grid grid-cols-1 lg:grid-cols-12 min-h-[640px]">
        {/* Left Side: Soft Blue 3D Vector Graphic Hero (Matching Reference Screenshot) */}
        <div className="lg:col-span-5 bg-gradient-to-br from-blue-500 via-indigo-600 to-blue-700 text-white p-8 md:p-12 flex flex-col justify-between relative overflow-hidden">
          {/* Back button */}
          {onBackToLanding && (
            <button
              onClick={onBackToLanding}
              className="flex items-center space-x-2 text-xs font-extrabold text-blue-100 hover:text-white transition-colors w-fit"
            >
              <ArrowLeft className="w-4 h-4" />
              <span>Back to Home</span>
            </button>
          )}

          <div className="space-y-3 z-10">
            <div className="w-12 h-12 rounded-2xl bg-white/20 backdrop-blur-md text-white flex items-center justify-center shadow-lg mb-4">
              <ShieldCheck className="w-7 h-7" />
            </div>
            <span className="text-2xl font-black tracking-tight block">JobScheduler Pro</span>
            <h2 className="text-3xl font-extrabold tracking-tight">
              {isRegister ? 'Join the Engine!' : 'Welcome Back!'}
            </h2>
            <p className="text-blue-100 text-xs md:text-sm">
              {isRegister ? 'Create an enterprise workspace for distributed task processing.' : 'Please sign in to continue to your dashboard.'}
            </p>
          </div>

          {/* 3D Security Shield & Server Graphic */}
          <div className="relative py-6 flex items-center justify-center z-10">
            <svg className="w-48 h-48 drop-shadow-2xl" viewBox="0 0 200 200" fill="none" xmlns="http://www.w3.org/2000/svg">
              <path d="M100 20 L160 50 V110 C160 150 100 180 100 180 C100 180 40 150 40 110 V50 Z" fill="url(#shield-grad)" opacity="0.9" />
              <path d="M100 40 L145 62 V105 C145 137 100 160 100 160 C100 160 55 137 55 105 V62 Z" fill="#FFFFFF" opacity="0.95" />
              <path d="M85 100 L95 110 L120 85" stroke="#3B82F6" strokeWidth="10" strokeLinecap="round" strokeLinejoin="round" />
              <defs>
                <linearGradient id="shield-grad" x1="40" y1="20" x2="160" y2="180" gradientUnits="userSpaceOnUse">
                  <stop stopColor="#60A5FA" />
                  <stop offset="1" stopColor="#3B82F6" />
                </linearGradient>
              </defs>
            </svg>
          </div>

          <div className="text-[10px] text-blue-200 z-10">
            Multi-Tenant Isolation • PostgreSQL 16 • JWT Protection
          </div>
        </div>

        {/* Right Side: Clean White Auth Form (Matching Reference Screenshot) */}
        <div className="lg:col-span-7 p-8 md:p-12 flex flex-col justify-center space-y-6">
          <div className="space-y-1">
            <h2 className="text-2xl font-black text-slate-900 tracking-tight">
              {isRegister ? 'Create your account' : 'Sign in to your account'}
            </h2>
            <p className="text-slate-500 text-xs">Enter your details below to access your workspace</p>
          </div>

          {/* Continue with Google Button */}
          <button
            type="button"
            onClick={handleGoogleLogin}
            className="w-full py-3 px-4 rounded-2xl border border-slate-200 bg-white hover:bg-slate-50 text-slate-700 font-bold text-xs shadow-sm flex items-center justify-center space-x-3 transition-colors"
          >
            <svg className="w-4 h-4" viewBox="0 0 24 24">
              <path fill="#4285F4" d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z" />
              <path fill="#34A853" d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z" />
              <path fill="#FBBC05" d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.06H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.94l2.85-2.22.81-.63z" />
              <path fill="#EA4335" d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.06l3.66 2.84c.87-2.6 3.3-4.52 6.16-4.52z" />
            </svg>
            <span>Continue with Google</span>
          </button>

          <div className="relative flex items-center justify-center">
            <div className="border-t border-slate-200 w-full" />
            <span className="bg-white px-3 text-[10px] uppercase font-bold text-slate-400 absolute">OR</span>
          </div>

          {errorMsg && (
            <div className="p-3.5 rounded-2xl bg-rose-50 border border-rose-200 text-rose-700 text-xs space-y-1">
              <div className="flex items-center space-x-2 font-bold">
                <AlertCircle className="w-4 h-4 text-rose-500 shrink-0" />
                <span>{errorMsg}</span>
              </div>
              {Object.keys(fieldErrors).length > 0 && (
                <ul className="pl-6 list-disc text-[11px] text-rose-600 space-y-0.5 pt-1">
                  {Object.entries(fieldErrors).map(([field, errs]) => (
                    <li key={field}>
                      <strong className="capitalize">{field}:</strong> {errs.join(', ')}
                    </li>
                  ))}
                </ul>
              )}
            </div>
          )}

          <form onSubmit={handleSubmit} className="space-y-4">
            {isRegister && (
              <>
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className="block text-xs font-semibold text-slate-700 mb-1">First Name</label>
                    <div className="relative">
                      <User className="w-4 h-4 text-slate-400 absolute left-3 top-3" />
                      <input
                        type="text"
                        required
                        value={firstName}
                        onChange={(e) => setFirstName(e.target.value)}
                        className="w-full pl-9 pr-3 py-2.5 text-sm rounded-2xl border border-slate-200 focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500"
                      />
                    </div>
                  </div>
                  <div>
                    <label className="block text-xs font-semibold text-slate-700 mb-1">Last Name</label>
                    <input
                      type="text"
                      required
                      value={lastName}
                      onChange={(e) => setLastName(e.target.value)}
                      className="w-full px-3.5 py-2.5 text-sm rounded-2xl border border-slate-200 focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500"
                    />
                  </div>
                </div>

                <div>
                  <label className="block text-xs font-semibold text-slate-700 mb-1">Organization Name</label>
                  <div className="relative">
                    <Building className="w-4 h-4 text-slate-400 absolute left-3 top-3" />
                    <input
                      type="text"
                      required
                      value={organizationName}
                      onChange={(e) => setOrganizationName(e.target.value)}
                      className="w-full pl-9 pr-3 py-2.5 text-sm rounded-2xl border border-slate-200 focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500"
                    />
                  </div>
                </div>
              </>
            )}

            <div>
              <label className="block text-xs font-semibold text-slate-700 mb-1">Email address</label>
              <div className="relative">
                <Mail className="w-4 h-4 text-slate-400 absolute left-3 top-3" />
                <input
                  type="email"
                  required
                  placeholder="john.doe@acme.com"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  className="w-full pl-9 pr-3 py-2.5 text-sm rounded-2xl border border-slate-200 focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500"
                />
              </div>
            </div>

            <div>
              <div className="flex items-center justify-between mb-1">
                <label className="block text-xs font-semibold text-slate-700">Password</label>
                {!isRegister && (
                  <a href="#" onClick={(e) => e.preventDefault()} className="text-[11px] font-semibold text-blue-600 hover:underline">
                    Forgot password?
                  </a>
                )}
              </div>
              <div className="relative">
                <Lock className="w-4 h-4 text-slate-400 absolute left-3 top-3" />
                <input
                  type="password"
                  required
                  minLength={8}
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  className="w-full pl-9 pr-3 py-2.5 text-sm rounded-2xl border border-slate-200 focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500"
                />
              </div>
            </div>

            {!isRegister && (
              <div className="flex items-center space-x-2">
                <input
                  type="checkbox"
                  id="rememberMe"
                  checked={rememberMe}
                  onChange={(e) => setRememberMe(e.target.checked)}
                  className="rounded text-blue-600 focus:ring-blue-500 cursor-pointer"
                />
                <label htmlFor="rememberMe" className="text-xs text-slate-600 cursor-pointer">
                  Remember me
                </label>
              </div>
            )}

            <button
              type="submit"
              disabled={loading}
              className="w-full py-3 rounded-2xl bg-slate-900 hover:bg-slate-800 text-white font-extrabold text-sm shadow-md flex items-center justify-center space-x-2 transition-all disabled:opacity-50"
            >
              <span>{loading ? 'Authenticating...' : isRegister ? 'Register Account' : 'Sign In'}</span>
              <ArrowRight className="w-4 h-4" />
            </button>
          </form>

          <div className="text-center text-xs text-slate-600">
            {isRegister ? (
              <span>
                Already have an account?{' '}
                <button
                  type="button"
                  onClick={() => setIsRegister(false)}
                  className="font-bold text-blue-600 hover:underline"
                >
                  Sign in
                </button>
              </span>
            ) : (
              <span>
                Don't have an account?{' '}
                <button
                  type="button"
                  onClick={() => setIsRegister(true)}
                  className="font-bold text-blue-600 hover:underline"
                >
                  Create one
                </button>
              </span>
            )}
          </div>
        </div>
      </div>
    </div>
  );
};
