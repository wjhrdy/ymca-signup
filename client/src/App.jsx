import React, { useState, useEffect } from 'react';
import api from './api';
import { Calendar, Clock, MapPin, User, Plus, Trash2, Check, X, RefreshCw, Settings } from 'lucide-react';
import ClassBrowser from './components/ClassBrowser';
import TrackedClasses from './components/TrackedClasses';
import SignupLogs from './components/SignupLogs';

function App() {
  const [activeTab, setActiveTab] = useState('browse');
  const [status, setStatus] = useState(null);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    fetchStatus();
    const interval = setInterval(fetchStatus, 30000);
    return () => clearInterval(interval);
  }, []);

  const fetchStatus = async () => {
    try {
      const response = await api.get('/api/status');
      setStatus(response.data);
    } catch (error) {
      console.error('Failed to fetch status:', error);
    }
  };

  const handleLogin = async () => {
    setLoading(true);
    try {
      await api.post('/api/auth/login');
      await fetchStatus();
      alert('Successfully authenticated!');
    } catch (error) {
      console.error('Login failed:', error);
      alert('Login failed: ' + (error.response?.data?.error || error.message));
    } finally {
      setLoading(false);
    }
  };

  return (
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
                  <span className="text-sm text-gray-600">Authenticated</span>
                </div>
              ) : (
                <div className="flex items-center space-x-2">
                  <div className="w-3 h-3 rounded-full bg-red-500" />
                  <span className="text-sm text-gray-600">Not authenticated</span>
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
                      <span>Logging in...</span>
                    </>
                  ) : (
                    <span>Login</span>
                  )}
                </button>
              )}
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
            </nav>
          </div>
        </div>

        {activeTab === 'browse' && <ClassBrowser authenticated={status?.authenticated} onNavigateToTracked={() => setActiveTab('tracked')} />}
        {activeTab === 'tracked' && <TrackedClasses />}
        {activeTab === 'logs' && <SignupLogs />}
      </div>
    </div>
  );
}

export default App;
