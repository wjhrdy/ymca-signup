import React, { useState, useEffect } from 'react';
import api from './api';
import { Calendar, Clock, MapPin, User, Plus, Trash2, Check, X, RefreshCw, Settings as SettingsIcon, LogOut } from 'lucide-react';
import ClassBrowser from './components/ClassBrowser';
import TrackedClasses from './components/TrackedClasses';
import SignupLogs from './components/SignupLogs';
import Settings from './components/Settings';
import Setup from './components/Setup';
import Login from './components/Login';
import { Toaster } from 'react-hot-toast';
import { ConfirmProvider } from './components/ConfirmDialog';

function App() {
  const [activeTab, setActiveTab] = useState('browse');
  const [status, setStatus] = useState(null);
  const [loading, setLoading] = useState(false);
  const [authState, setAuthState] = useState({ loading: true, setupRequired: false, authenticated: false, user: null });

  useEffect(() => {
    checkAuth();
  }, []);

  useEffect(() => {
    if (authState.authenticated) {
      fetchStatus();
      const interval = setInterval(fetchStatus, 30000);
      return () => clearInterval(interval);
    }
  }, [authState.authenticated]);

  const checkAuth = async () => {
    try {
      const response = await fetch('/api/auth/session', {
        credentials: 'include'
      });
      const data = await response.json();
      setAuthState({
        loading: false,
        setupRequired: data.setupRequired || false,
        authenticated: data.authenticated || false,
        user: data.user || null
      });
    } catch (error) {
      console.error('Auth check failed:', error);
      setAuthState({ loading: false, setupRequired: false, authenticated: false, user: null });
    }
  };

  const fetchStatus = async () => {
    try {
      const response = await api.get('/api/status');
      setStatus(response.data);
    } catch (error) {
      console.error('Failed to fetch status:', error);
      if (error.response?.status === 401) {
        setAuthState({ ...authState, authenticated: false });
      }
    }
  };

  const handleSetupComplete = () => {
    setAuthState({ ...authState, setupRequired: false });
  };

  const handleLoginSuccess = (user) => {
    setAuthState({ ...authState, authenticated: true, user });
  };

  const handleLogout = async () => {
    try {
      await fetch('/api/auth/logout', {
        method: 'POST',
        credentials: 'include'
      });
      setAuthState({ loading: false, setupRequired: false, authenticated: false, user: null });
      setStatus(null);
    } catch (error) {
      console.error('Logout failed:', error);
    }
  };

  const handleLogin = async () => {
    setLoading(true);
    try {
      const credentialsStatus = await api.get('/api/credentials/status');
      if (!credentialsStatus.data.configured) {
        setActiveTab('settings');
        setLoading(false);
        return;
      }
      await api.post('/api/auth/login');
      await fetchStatus();
    } catch (error) {
      console.error('Login failed:', error);
    } finally {
      setLoading(false);
    }
  };

  if (authState.loading) {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center">
        <div className="text-center">
          <RefreshCw className="w-8 h-8 text-primary animate-spin mx-auto mb-2" />
          <p className="text-gray-600">Loading...</p>
        </div>
      </div>
    );
  }

  if (authState.setupRequired) {
    return <Setup onSetupComplete={handleSetupComplete} />;
  }

  if (!authState.authenticated) {
    return <Login onLoginSuccess={handleLoginSuccess} />;
  }

  return (
    <ConfirmProvider>
      <Toaster position="top-center" />
      <div className="min-h-screen bg-gray-50">
      <header className="bg-white shadow-sm border-b">
        <div className="max-w-7xl mx-auto px-4 py-4">
          <div className="flex items-center justify-between">
            <div className="flex items-center space-x-3">
              <Calendar className="w-8 h-8 text-primary" />
              <div>
                <h1 className="text-2xl font-bold text-gray-900">YMCA Auto-Signup</h1>
                <p className="text-sm text-gray-500">Automated class registration system</p>
              </div>
            </div>
            <div className="flex items-center space-x-4">
              {authState.user && (
                <div className="flex items-center space-x-2 px-3 py-1.5 bg-gray-100 rounded-lg">
                  <User className="w-4 h-4 text-gray-600" />
                  <span className="text-sm font-medium text-gray-700">{authState.user.username}</span>
                </div>
              )}
              {status?.authenticated && status?.user ? (
                <div className="flex items-center space-x-3">
                  {status.user.imageUrl ? (
                    <img 
                      src={status.user.imageUrl} 
                      alt={`${status.user.firstName} ${status.user.lastName}`}
                      className="w-10 h-10 rounded-full object-cover border-2 border-gray-200"
                    />
                  ) : (
                    <div className="w-10 h-10 rounded-full bg-primary text-white flex items-center justify-center font-semibold border-2 border-gray-200">
                      {status.user.firstName?.charAt(0)}{status.user.lastName?.charAt(0)}
                    </div>
                  )}
                  <span className="text-sm font-medium text-gray-700">
                    {status.user.firstName} {status.user.lastName?.charAt(0)}.
                  </span>
                </div>
              ) : status?.authenticated ? (
                <div className="flex items-center space-x-2">
                  <div className="w-3 h-3 rounded-full bg-green-500" />
                  <span className="text-sm text-gray-600">YMCA Connected</span>
                </div>
              ) : (
                <div className="flex items-center space-x-2">
                  <div className="w-3 h-3 rounded-full bg-red-500" />
                  <span className="text-sm text-gray-600">YMCA Not Connected</span>
                </div>
              )}
              {!status?.authenticated && (
                <button
                  onClick={handleLogin}
                  disabled={loading}
                  className="px-4 py-2 bg-primary text-white rounded-lg hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed flex items-center space-x-2"
                >
                  {loading ? (
                    <>
                      <RefreshCw className="w-4 h-4 animate-spin" />
                      <span>Connecting...</span>
                    </>
                  ) : (
                    <span>Connect YMCA</span>
                  )}
                </button>
              )}
              <button
                onClick={handleLogout}
                className="px-4 py-2 text-gray-700 hover:bg-gray-100 rounded-lg flex items-center space-x-2 transition-colors"
                title="Logout"
              >
                <LogOut className="w-4 h-4" />
                <span>Logout</span>
              </button>
            </div>
          </div>
        </div>
      </header>

      <div className="max-w-7xl mx-auto px-4 py-6">
        <div className="mb-6">
          <div className="border-b border-gray-200">
            <nav className="flex space-x-8">
              <button
                onClick={() => setActiveTab('browse')}
                className={`py-4 px-1 border-b-2 font-medium text-sm ${
                  activeTab === 'browse'
                    ? 'border-primary text-primary'
                    : 'border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-300'
                }`}
              >
                Browse Classes
              </button>
              <button
                onClick={() => setActiveTab('tracked')}
                className={`py-4 px-1 border-b-2 font-medium text-sm ${
                  activeTab === 'tracked'
                    ? 'border-primary text-primary'
                    : 'border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-300'
                }`}
              >
                Tracked Classes
              </button>
              <button
                onClick={() => setActiveTab('logs')}
                className={`py-4 px-1 border-b-2 font-medium text-sm ${
                  activeTab === 'logs'
                    ? 'border-primary text-primary'
                    : 'border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-300'
                }`}
              >
                Booked Classes
              </button>
              <button
                onClick={() => setActiveTab('settings')}
                className={`py-4 px-1 border-b-2 font-medium text-sm flex items-center space-x-2 ${
                  activeTab === 'settings'
                    ? 'border-primary text-primary'
                    : 'border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-300'
                }`}
              >
                <SettingsIcon className="w-4 h-4" />
                <span>Settings</span>
              </button>
            </nav>
          </div>
        </div>

        {activeTab === 'browse' && <ClassBrowser authenticated={status?.authenticated} onNavigateToTracked={() => setActiveTab('tracked')} />}
        {activeTab === 'tracked' && <TrackedClasses />}
        {activeTab === 'logs' && <SignupLogs />}
        {activeTab === 'settings' && <Settings />}
      </div>
    </div>
    </ConfirmProvider>
  );
}

export default App;
