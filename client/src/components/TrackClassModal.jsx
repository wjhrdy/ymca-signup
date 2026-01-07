import React, { useState, useEffect } from 'react';
import { X, Calendar, Clock, User, MapPin, AlertCircle, CheckCircle } from 'lucide-react';
import api from '../api';
import toast from 'react-hot-toast';

function TrackClassModal({ classItem, onClose, onSuccess }) {
  const [step, setStep] = useState('options');
  const [loading, setLoading] = useState(false);
  const [matchingClasses, setMatchingClasses] = useState([]);
  const [options, setOptions] = useState({
    matchTrainer: true,
    matchExactTime: true,
    timeTolerance: 15,
    autoSignup: true,
    signupHoursBefore: 46
  });

  const classDate = new Date(classItem.startTime);
  const dayOfWeek = classDate.toLocaleDateString('en-US', { weekday: 'long' });
  const startTime = classDate.toTimeString().substring(0, 5);

  const previewMatches = async () => {
    setLoading(true);
    try {
      const response = await api.post('/api/tracked-classes/preview', {
        serviceId: classItem.serviceId,
        serviceName: classItem.serviceName,
        trainerId: classItem.trainerId,
        trainerName: classItem.trainerName,
        locationId: classItem.locationId,
        locationName: classItem.locationName,
        dayOfWeek,
        startTime,
        matchTrainer: options.matchTrainer,
        matchExactTime: options.matchExactTime,
        timeTolerance: options.timeTolerance
      });
      setMatchingClasses(response.data.matchingClasses || []);
      setStep('preview');
    } catch (error) {
      console.error('Failed to preview matches:', error);
      toast.error('Failed to preview matches: ' + (error.response?.data?.error || error.message));
    } finally {
      setLoading(false);
    }
  };

  const confirmTrack = async () => {
    setLoading(true);
    try {
      await api.post('/api/tracked-classes', {
        serviceId: classItem.serviceId,
        serviceName: classItem.serviceName,
        trainerId: classItem.trainerId,
        trainerName: classItem.trainerName,
        locationId: classItem.locationId,
        locationName: classItem.locationName,
        dayOfWeek,
        startTime,
        matchTrainer: options.matchTrainer,
        matchExactTime: options.matchExactTime,
        timeTolerance: options.timeTolerance,
        autoSignup: options.autoSignup,
        signupHoursBefore: options.signupHoursBefore
      });
      toast.success('Class added to tracking!');
      onSuccess();
      onClose();
    } catch (error) {
      console.error('Failed to track class:', error);
      toast.error('Failed to track class: ' + (error.response?.data?.error || error.message));
      setLoading(false);
    }
  };

  return (
    <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4">
      <div className="bg-white rounded-lg shadow-xl max-w-2xl w-full max-h-[90vh] overflow-y-auto">
        <div className="sticky top-0 bg-white border-b px-6 py-4 flex items-center justify-between">
          <h2 className="text-xl font-semibold text-gray-900">
            {step === 'options' && 'Configure Tracking Options'}
            {step === 'preview' && 'Preview Matching Classes'}
            {step === 'success' && 'Class Tracked Successfully!'}
          </h2>
          <button
            onClick={onClose}
            className="text-gray-400 hover:text-gray-600"
          >
            <X className="w-6 h-6" />
          </button>
        </div>

        <div className="p-6">
          {step === 'options' && (
            <div className="space-y-6">
              <div className="bg-blue-50 border border-blue-200 rounded-lg p-4">
                <h3 className="font-semibold text-gray-900 mb-2">{classItem.serviceName}</h3>
                <div className="space-y-1 text-sm text-gray-600">
                  <div className="flex items-center">
                    <Calendar className="w-4 h-4 mr-2" />
                    <span>{dayOfWeek} at {startTime}</span>
                  </div>
                  {classItem.trainerName && (
                    <div className="flex items-center">
                      <User className="w-4 h-4 mr-2" />
                      <span>{classItem.trainerName}</span>
                    </div>
                  )}
                  <div className="flex items-center">
                    <MapPin className="w-4 h-4 mr-2" />
                    <span>{classItem.locationName}</span>
                  </div>
                </div>
              </div>

              <div className="space-y-4">
                <h3 className="font-semibold text-gray-900">Matching Options</h3>
                <p className="text-sm text-gray-600">
                  Configure which variables must match exactly vs. which can be flexible
                </p>

                <div className="space-y-4">
                  <div className="border rounded-lg p-4">
                    <label className="flex items-start space-x-3">
                      <input
                        type="checkbox"
                        checked={options.matchTrainer}
                        onChange={(e) => setOptions({ ...options, matchTrainer: e.target.checked })}
                        className="mt-1"
                      />
                      <div className="flex-1">
                        <div className="font-medium text-gray-900">Match Instructor</div>
                        <div className="text-sm text-gray-600">
                          {options.matchTrainer 
                            ? `Only match classes taught by ${classItem.trainerName || 'this instructor'}`
                            : 'Match classes with any instructor'}
                        </div>
                      </div>
                    </label>
                  </div>

                  <div className="border rounded-lg p-4">
                    <label className="flex items-start space-x-3 mb-3">
                      <input
                        type="checkbox"
                        checked={options.matchExactTime}
                        onChange={(e) => setOptions({ ...options, matchExactTime: e.target.checked })}
                        className="mt-1"
                      />
                      <div className="flex-1">
                        <div className="font-medium text-gray-900">Match Exact Time</div>
                        <div className="text-sm text-gray-600">
                          {options.matchExactTime 
                            ? `Only match classes at exactly ${startTime}`
                            : 'Allow fuzzy time matching within tolerance'}
                        </div>
                      </div>
                    </label>
                    
                    {!options.matchExactTime && (
                      <div className="ml-7">
                        <label className="block text-sm font-medium text-gray-700 mb-1">
                          Time Tolerance (minutes)
                        </label>
                        <input
                          type="number"
                          value={options.timeTolerance}
                          onChange={(e) => setOptions({ ...options, timeTolerance: parseInt(e.target.value) || 0 })}
                          min="0"
                          max="120"
                          className="w-32 px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-primary focus:border-transparent"
                        />
                        <p className="text-xs text-gray-500 mt-1">
                          Match classes within ±{options.timeTolerance} minutes of {startTime}
                        </p>
                      </div>
                    )}
                  </div>
                </div>

                <div className="border-t pt-4 space-y-4">
                  <h3 className="font-semibold text-gray-900">Auto-Signup Settings</h3>
                  
                  <div className="border rounded-lg p-4">
                    <label className="flex items-start space-x-3">
                      <input
                        type="checkbox"
                        checked={options.autoSignup}
                        onChange={(e) => setOptions({ ...options, autoSignup: e.target.checked })}
                        className="mt-1"
                      />
                      <div className="flex-1">
                        <div className="font-medium text-gray-900">Enable Auto-Signup</div>
                        <div className="text-sm text-gray-600">
                          Automatically sign up for matching classes
                        </div>
                      </div>
                    </label>
                  </div>

                  {options.autoSignup && (
                    <div>
                      <label className="block text-sm font-medium text-gray-700 mb-1">
                        Sign up (hours before class)
                      </label>
                      <input
                        type="number"
                        value={options.signupHoursBefore}
                        onChange={(e) => setOptions({ ...options, signupHoursBefore: parseInt(e.target.value) || 46 })}
                        min="1"
                        max="168"
                        className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-primary focus:border-transparent"
                      />
                      <p className="text-xs text-gray-500 mt-1">
                        The system will attempt signup this many hours before the class starts
                      </p>
                    </div>
                  )}
                </div>
              </div>

              <div className="flex space-x-3">
                <button
                  onClick={onClose}
                  className="flex-1 px-4 py-2 border border-gray-300 text-gray-700 rounded-lg hover:bg-gray-50"
                >
                  Cancel
                </button>
                <button
                  onClick={previewMatches}
                  disabled={loading}
                  className="flex-1 px-4 py-2 bg-primary text-white rounded-lg hover:bg-blue-700 disabled:opacity-50"
                >
                  {loading ? 'Loading...' : 'Preview Matches'}
                </button>
              </div>
            </div>
          )}

          {step === 'preview' && (
            <div className="space-y-6">
              <div className="bg-blue-50 border border-blue-200 rounded-lg p-4">
                <div className="flex items-start space-x-2">
                  <AlertCircle className="w-5 h-5 text-blue-600 mt-0.5" />
                  <div>
                    <h3 className="font-semibold text-blue-900">
                      Found {matchingClasses.length} matching {matchingClasses.length === 1 ? 'class' : 'classes'}
                    </h3>
                    <p className="text-sm text-blue-800 mt-1">
                      These classes will be automatically tracked based on your settings
                    </p>
                  </div>
                </div>
              </div>

              {matchingClasses.length > 0 ? (
                <div className="space-y-3 max-h-96 overflow-y-auto">
                  {matchingClasses.map((cls, idx) => (
                    <div key={idx} className={`border rounded-lg p-4 ${cls.isJoined ? 'bg-green-50 border-green-300' : ''}`}>
                      <div className="flex items-start justify-between">
                        <h4 className="font-semibold text-gray-900">{cls.serviceName}</h4>
                        {cls.isJoined && (
                          <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium bg-green-100 text-green-800">
                            <CheckCircle className="w-3 h-3 mr-1" />
                            Enrolled
                          </span>
                        )}
                      </div>
                      <div className="mt-2 space-y-1 text-sm text-gray-600">
                        <div className="flex items-center">
                          <Calendar className="w-4 h-4 mr-2" />
                          <span>{new Date(cls.startTime).toLocaleDateString()} at {new Date(cls.startTime).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}</span>
                        </div>
                        {cls.trainerName && (
                          <div className="flex items-center">
                            <User className="w-4 h-4 mr-2" />
                            <span>{cls.trainerName}</span>
                          </div>
                        )}
                        <div className="flex items-center">
                          <MapPin className="w-4 h-4 mr-2" />
                          <span>{cls.locationName}</span>
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              ) : (
                <div className="text-center py-8 text-gray-500">
                  No upcoming classes match your criteria
                </div>
              )}

              <div className="flex space-x-3">
                <button
                  onClick={() => setStep('options')}
                  className="flex-1 px-4 py-2 border border-gray-300 text-gray-700 rounded-lg hover:bg-gray-50"
                >
                  Back
                </button>
                <button
                  onClick={confirmTrack}
                  disabled={loading}
                  className="flex-1 px-4 py-2 bg-primary text-white rounded-lg hover:bg-blue-700 disabled:opacity-50"
                >
                  {loading ? 'Adding...' : 'Confirm & Track'}
                </button>
              </div>
            </div>
          )}

          {step === 'success' && (
            <div className="text-center py-8">
              <CheckCircle className="w-16 h-16 text-green-500 mx-auto mb-4" />
              <h3 className="text-lg font-semibold text-gray-900 mb-2">
                Class Added to Tracking!
              </h3>
              <p className="text-gray-600">
                You can view and manage it in the Tracked Classes tab
              </p>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

export default TrackClassModal;
