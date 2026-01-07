import React, { useState, useEffect } from 'react';
import api from '../api';
import { Save, RefreshCw, AlertCircle, Eye, EyeOff, Key } from 'lucide-react';
import toast from 'react-hot-toast';

const LOCATIONS = [
  { id: 1, name: 'Downtown Durham YMCA' },
  { id: 7, name: 'Lakewood YMCA' },
  { id: 9, name: 'YMCA at American Tobacco' },
  { id: 12, name: 'Hope Valley Farms YMCA' },
  { id: 14, name: 'A.E. Finley YMCA' },
  { id: 15, name: 'Alexander Family YMCA' },
  { id: 16, name: 'Chapel Hill-Carrboro YMCA' },
  { id: 17, name: 'Chatham Park YMCA' },
  { id: 18, name: 'East Triangle YMCA' },
  { id: 19, name: 'Ingram Family YMCA' },
  { id: 20, name: 'Kerr Family YMCA' },
  { id: 21, name: 'Kraft Family YMCA' },
  { id: 22, name: 'Northwest Cary YMCA' },
  { id: 23, name: 'Poole Family YMCA' },
  { id: 24, name: 'Poyner YMCA' },
  { id: 25, name: 'Southeast Raleigh YMCA' },
  { id: 26, name: 'Taylor Family YMCA' },
  { id: 27, name: 'Knightdale Station YMCA' },
  { id: 28, name: 'YMCA at Meadowmont' },
];

function Settings() {
  const [settings, setSettings] = useState(null);
  const [credentials, setCredentials] = useState({ email: '', password: '' });
  const [credentialsStatus, setCredentialsStatus] = useState(null);
  const [showPassword, setShowPassword] = useState(false);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [savingCredentials, setSavingCredentials] = useState(false);
  const [error, setError] = useState(null);
  const [hasChanges, setHasChanges] = useState(false);
  const [hasCredentialChanges, setHasCredentialChanges] = useState(false);

  useEffect(() => {
    loadSettings();
  }, []);

  const loadSettings = async () => {
    try {
      setLoading(true);
      setError(null);
      const [settingsResponse, credentialsResponse] = await Promise.all([
        api.get('/api/settings'),
        api.get('/api/credentials/status')
      ]);
      setSettings(settingsResponse.data);
      setCredentialsStatus(credentialsResponse.data);
      setHasChanges(false);
      setHasCredentialChanges(false);
    } catch (err) {
      console.error('Failed to load settings:', err);
      setError('Failed to load settings. Please try again.');
      toast.error('Failed to load settings');
    } finally {
      setLoading(false);
    }
  };

  const handleSave = async () => {
    try {
      setSaving(true);
      setError(null);
      await api.put('/api/settings', settings);
      toast.success('Settings saved successfully');
      setHasChanges(false);
    } catch (err) {
      console.error('Failed to save settings:', err);
      setError('Failed to save settings. Please try again.');
      toast.error('Failed to save settings');
    } finally {
      setSaving(false);
    }
  };

  const handleSaveCredentials = async () => {
    try {
      if (!credentials.email || !credentials.password) {
        toast.error('Please enter both email and password');
        return;
      }

      setSavingCredentials(true);
      setError(null);
      await api.put('/api/credentials', credentials);
      toast.success('Credentials saved successfully. You will be logged in on next action.');
      setHasCredentialChanges(false);
      setCredentials({ email: '', password: '' });
      await loadSettings();
    } catch (err) {
      console.error('Failed to save credentials:', err);
      setError('Failed to save credentials. Please try again.');
      toast.error('Failed to save credentials');
    } finally {
      setSavingCredentials(false);
    }
  };

  const updateField = (path, value) => {
    setSettings(prev => {
      const newSettings = { ...prev };
      const parts = path.split('.');
      let current = newSettings;
      for (let i = 0; i < parts.length - 1; i++) {
        current = current[parts[i]];
      }
      current[parts[parts.length - 1]] = value;
      return newSettings;
    });
    setHasChanges(true);
  };

  const toggleLocation = (locationId) => {
    setSettings(prev => {
      const currentLocations = prev.preferredLocations || [];
      const newLocations = currentLocations.includes(locationId)
        ? currentLocations.filter(id => id !== locationId)
        : [...currentLocations, locationId].sort((a, b) => a - b);
      return {
        ...prev,
        preferredLocations: newLocations
      };
    });
    setHasChanges(true);
  };

  const updateCredentialField = (field, value) => {
    setCredentials(prev => ({ ...prev, [field]: value }));
    setHasCredentialChanges(true);
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center py-12">
        <RefreshCw className="w-8 h-8 animate-spin text-primary" />
      </div>
    );
  }

  if (error && !settings) {
    return (
      <div className="bg-red-50 border border-red-200 rounded-lg p-4 flex items-start space-x-3">
        <AlertCircle className="w-5 h-5 text-red-600 flex-shrink-0 mt-0.5" />
        <div className="flex-1">
          <h3 className="text-sm font-medium text-red-800">Error Loading Settings</h3>
          <p className="text-sm text-red-700 mt-1">{error}</p>
          <button
            onClick={loadSettings}
            className="mt-3 text-sm font-medium text-red-600 hover:text-red-700"
          >
            Try Again
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-2xl font-bold text-gray-900">Settings</h2>
        <p className="text-sm text-gray-500 mt-1">Configure your YMCA auto-signup preferences</p>
      </div>

      <div className="bg-white rounded-lg shadow-sm border border-gray-200">
        <div className="p-6 border-b border-gray-200">
          <div className="flex items-center space-x-2">
            <Key className="w-5 h-5 text-gray-700" />
            <h3 className="text-lg font-semibold text-gray-900">YMCA Credentials</h3>
          </div>
          <p className="text-sm text-gray-500 mt-1">
            {credentialsStatus?.configured 
              ? `Credentials are configured (source: ${credentialsStatus.source})`
              : 'Set your YMCA login credentials to enable auto-signup functionality'}
          </p>
        </div>
        <div className="p-6 space-y-4">
          <div>
            <label htmlFor="ymca-email" className="block text-sm font-medium text-gray-700 mb-2">
              YMCA Email
            </label>
            <input
              id="ymca-email"
              type="email"
              value={credentials.email}
              onChange={(e) => updateCredentialField('email', e.target.value)}
              placeholder="your-email@example.com"
              className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-primary focus:border-transparent"
            />
          </div>

          <div>
            <label htmlFor="ymca-password" className="block text-sm font-medium text-gray-700 mb-2">
              YMCA Password
            </label>
            <div className="relative">
              <input
                id="ymca-password"
                type={showPassword ? 'text' : 'password'}
                value={credentials.password}
                onChange={(e) => updateCredentialField('password', e.target.value)}
                placeholder="••••••••"
                className="w-full px-3 py-2 pr-10 border border-gray-300 rounded-lg focus:ring-2 focus:ring-primary focus:border-transparent"
              />
              <button
                type="button"
                onClick={() => setShowPassword(!showPassword)}
                className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-500 hover:text-gray-700"
              >
                {showPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
              </button>
            </div>
          </div>

          <div className="flex items-center justify-between pt-2">
            <p className="text-xs text-gray-500">
              Credentials are stored securely in the database
            </p>
            <button
              onClick={handleSaveCredentials}
              disabled={!hasCredentialChanges || savingCredentials}
              className="px-4 py-2 bg-primary text-white rounded-lg hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed flex items-center space-x-2"
            >
              {savingCredentials ? (
                <>
                  <RefreshCw className="w-4 h-4 animate-spin" />
                  <span>Saving...</span>
                </>
              ) : (
                <>
                  <Save className="w-4 h-4" />
                  <span>Save Credentials</span>
                </>
              )}
            </button>
          </div>
        </div>
      </div>

      <div className="bg-white rounded-lg shadow-sm border border-gray-200">
        <div className="p-6 border-b border-gray-200 flex items-center justify-between">
          <div>
            <h3 className="text-lg font-semibold text-gray-900">Preferred Locations</h3>
            <p className="text-sm text-gray-500 mt-1">
              Select which YMCA locations to fetch classes from. Leave all unchecked to fetch from all locations.
            </p>
          </div>
          <button
            onClick={handleSave}
            disabled={!hasChanges || saving}
            className="px-4 py-2 bg-primary text-white rounded-lg hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed flex items-center space-x-2"
          >
            {saving ? (
              <>
                <RefreshCw className="w-4 h-4 animate-spin" />
                <span>Saving...</span>
              </>
            ) : (
              <>
                <Save className="w-4 h-4" />
                <span>Save</span>
              </>
            )}
          </button>
        </div>
        <div className="p-6">
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3">
            {LOCATIONS.map(location => (
              <label
                key={location.id}
                className="flex items-center space-x-3 p-3 rounded-lg border border-gray-200 hover:bg-gray-50 cursor-pointer transition-colors"
              >
                <input
                  type="checkbox"
                  checked={settings?.preferredLocations?.includes(location.id) || false}
                  onChange={() => toggleLocation(location.id)}
                  className="w-4 h-4 text-primary border-gray-300 rounded focus:ring-primary"
                />
                <span className="text-sm text-gray-700">{location.name}</span>
              </label>
            ))}
          </div>
          {settings?.preferredLocations?.length > 0 && (
            <div className="mt-4 text-sm text-gray-600">
              <strong>{settings.preferredLocations.length}</strong> location{settings.preferredLocations.length !== 1 ? 's' : ''} selected
            </div>
          )}
        </div>
      </div>

      <div className="bg-white rounded-lg shadow-sm border border-gray-200">
        <div className="p-6 border-b border-gray-200">
          <h3 className="text-lg font-semibold text-gray-900">Scheduler Settings</h3>
          <p className="text-sm text-gray-500 mt-1">
            Configure how often the system checks for classes and when to auto-signup
          </p>
        </div>
        <div className="p-6 space-y-6">
          <div>
            <label htmlFor="checkInterval" className="block text-sm font-medium text-gray-700 mb-2">
              Check Interval (minutes)
            </label>
            <input
              id="checkInterval"
              type="number"
              min="1"
              max="60"
              value={settings?.scheduler?.checkIntervalMinutes || 5}
              onChange={(e) => updateField('scheduler.checkIntervalMinutes', parseInt(e.target.value, 10))}
              className="w-full md:w-64 px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-primary focus:border-transparent"
            />
            <p className="text-xs text-gray-500 mt-1">How often to check for new classes to auto-signup (default: 5 minutes)</p>
          </div>

          <div>
            <label htmlFor="signupHours" className="block text-sm font-medium text-gray-700 mb-2">
              Default Signup Hours Before Class
            </label>
            <input
              id="signupHours"
              type="number"
              min="1"
              max="168"
              value={settings?.scheduler?.defaultSignupHoursBefore || 46}
              onChange={(e) => updateField('scheduler.defaultSignupHoursBefore', parseInt(e.target.value, 10))}
              className="w-full md:w-64 px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-primary focus:border-transparent"
            />
            <p className="text-xs text-gray-500 mt-1">Default hours before class to attempt auto-signup (default: 46 hours)</p>
          </div>
        </div>
      </div>

      <div className="bg-white rounded-lg shadow-sm border border-gray-200">
        <div className="p-6 border-b border-gray-200">
          <h3 className="text-lg font-semibold text-gray-900">Class Fetch Settings</h3>
          <p className="text-sm text-gray-500 mt-1">
            Configure how classes are fetched from the YMCA system
          </p>
        </div>
        <div className="p-6 space-y-6">
          <div>
            <label htmlFor="daysAhead" className="block text-sm font-medium text-gray-700 mb-2">
              Default Days Ahead
            </label>
            <input
              id="daysAhead"
              type="number"
              min="1"
              max="30"
              value={settings?.classFetch?.defaultDaysAhead || 7}
              onChange={(e) => updateField('classFetch.defaultDaysAhead', parseInt(e.target.value, 10))}
              className="w-full md:w-64 px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-primary focus:border-transparent"
            />
            <p className="text-xs text-gray-500 mt-1">Number of days in the future to fetch classes (default: 7 days)</p>
          </div>

          <div>
            <label htmlFor="maxClasses" className="block text-sm font-medium text-gray-700 mb-2">
              Maximum Classes Per Fetch
            </label>
            <input
              id="maxClasses"
              type="number"
              min="100"
              max="10000"
              step="100"
              value={settings?.classFetch?.maxClassesPerFetch || 5000}
              onChange={(e) => updateField('classFetch.maxClassesPerFetch', parseInt(e.target.value, 10))}
              className="w-full md:w-64 px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-primary focus:border-transparent"
            />
            <p className="text-xs text-gray-500 mt-1">Maximum number of classes to process in a single fetch (default: 5000)</p>
          </div>
        </div>
      </div>
    </div>
  );
}

export default Settings;
