import React, { createContext, useContext, useState, useEffect } from 'react';
import { ApiClient } from '../api/client';

interface User {
  id: string;
  email: string;
  firstName?: string;
  lastName?: string;
  role: string;
  organizationId: string;
  organizationName?: string;
}

interface Project {
  id: string;
  name: string;
  slug: string;
  organizationId: string;
}

interface AuthContextType {
  user: User | null;
  token: string | null;
  activeProject: Project | null;
  projects: Project[];
  loading: boolean;
  login: (token: string, user: User) => void;
  logout: () => void;
  setActiveProject: (proj: Project | null) => void;
  refreshProjects: () => Promise<void>;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

export const AuthProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [token, setToken] = useState<string | null>(localStorage.getItem('token'));
  const [user, setUser] = useState<User | null>(null);
  const [projects, setProjects] = useState<Project[]>([]);
  const [activeProject, setActiveProjectState] = useState<Project | null>(null);
  const [loading, setLoading] = useState<boolean>(true);

  const setActiveProject = (proj: Project | null) => {
    setActiveProjectState(proj);
    if (proj) {
      localStorage.setItem('activeProjectId', proj.id);
    } else {
      localStorage.removeItem('activeProjectId');
    }
  };

  // Check URL parameters for Google OAuth callback redirect
  useEffect(() => {
    const urlParams = new URLSearchParams(window.location.search);
    const googleToken = urlParams.get('token');
    if (googleToken) {
      localStorage.setItem('token', googleToken);
      setToken(googleToken);
      window.history.replaceState({}, document.title, window.location.pathname);
    }
  }, []);

  const fetchMeAndProjects = async () => {
    if (!token) {
      setLoading(false);
      return;
    }

    try {
      const meRes = await ApiClient.getMe();
      if (meRes.success && meRes.data) {
        setUser(meRes.data as User);

        const projRes = await ApiClient.getProjects();
        if (projRes.success && Array.isArray(projRes.data)) {
          const fetchedProjects = projRes.data as Project[];
          setProjects(fetchedProjects);
          if (fetchedProjects.length > 0 && !activeProject) {
            const savedProjId = localStorage.getItem('activeProjectId');
            const foundSaved = savedProjId ? fetchedProjects.find((p) => p.id === savedProjId) : null;
            setActiveProject(foundSaved || fetchedProjects[0]);
          }
        }
      } else {
        localStorage.removeItem('token');
        setToken(null);
        setUser(null);
      }
    } catch {
      localStorage.removeItem('token');
      setToken(null);
      setUser(null);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchMeAndProjects();
  }, [token]);

  const login = (newToken: string, newUser: User) => {
    localStorage.setItem('token', newToken);
    setToken(newToken);
    setUser(newUser);
    fetchMeAndProjects();
  };

  const logout = () => {
    localStorage.removeItem('token');
    localStorage.removeItem('activeProjectId');
    setToken(null);
    setUser(null);
    setProjects([]);
    setActiveProjectState(null);
  };

  const refreshProjects = async () => {
    const projRes = await ApiClient.getProjects();
    if (projRes.success && Array.isArray(projRes.data)) {
      const fetchedProjects = projRes.data as Project[];
      setProjects(fetchedProjects);
      if (fetchedProjects.length > 0 && (!activeProject || !fetchedProjects.find((p) => p.id === activeProject.id))) {
        const savedProjId = localStorage.getItem('activeProjectId');
        const foundSaved = savedProjId ? fetchedProjects.find((p) => p.id === savedProjId) : null;
        setActiveProject(foundSaved || fetchedProjects[0]);
      }
    }
  };

  return (
    <AuthContext.Provider
      value={{
        user,
        token,
        activeProject,
        projects,
        loading,
        login,
        logout,
        setActiveProject,
        refreshProjects,
      }}
    >
      {children}
    </AuthContext.Provider>
  );
};

export const useAuth = () => {
  const context = useContext(AuthContext);
  if (!context) {
    throw new Error('useAuth must be used within an AuthProvider');
  }
  return context;
};
