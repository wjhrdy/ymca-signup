import React, { useState, useEffect } from 'react';
import api from '../api';
import * as classActions from '../services/classActions';
import { Calendar, Clock, MapPin, User, CheckCircle, XCircle, RefreshCw, AlertCircle, ArrowLeft, Ban, RotateCcw } from 'lucide-react';

/**
 * Confirmation screen for preemptively skipping (or un-skipping) auto-signup
 * for a single class occurrence. Reached via calendar deep links:
 *   /?skip=<id>    → default action: skip
 *   /?unskip=<id>  → default action: unskip
 *
 * The actual mutation only happens on an explicit button press, so calendar
 * clients / link scanners that prefetch the URL can't accidentally change state.
 */
function SkipClass({ occurrenceId, mode = 'skip', onDone }) {
  const [classData, setClassData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [result, setResult] = useState(null); // 'skipped' | 'unskipped' | 'not-found' | 'error'
  const [errorMessage, setErrorMessage] = useState('');

  useEffect(() => {
    fetchClassDetails();
  }, [occurrenceId]);

  const fetchClassDetails = async () => {
    setLoading(true);
    try {
      const response = await api.get(`/api/class/${occurrenceId}`);
      setClassData(response.data);
    } catch (error) {
      console.error('Failed to fetch class details:', error);
      if (error.response?.status === 404) {
        setResult('not-found');
      } else {
        setResult('error');
        setErrorMessage(error.response?.data?.error || error.message);
      }
    } finally {
      setLoading(false);
    }
  };

  const handleSkip = async () => {
    setSubmitting(true);
    try {
      await classActions.skipOccurrence(occurrenceId, {
        serviceName: classData?.serviceName,
        classTime: classData?.startTime
      });
      setResult('skipped');
    } catch (error) {
      console.error('Skip failed:', error);
      setResult('error');
      setErrorMessage(error.response?.data?.error || error.message);
    } finally {
      setSubmitting(false);
    }
  };

  const handleUnskip = async () => {
    setSubmitting(true);
    try {
      await classActions.unskipOccurrence(occurrenceId);
      setResult('unskipped');
    } catch (error) {
      console.error('Unskip failed:', error);
      setResult('error');
      setErrorMessage(error.response?.data?.error || error.message);
    } finally {
      setSubmitting(false);
    }
  };

  const formatDate = (dateString) => {
    const date = new Date(dateString);
    return date.toLocaleString('en-US', {
      weekday: 'long',
      month: 'long',
      day: 'numeric',
      year: 'numeric',
      hour: '2-digit',
      minute: '2-digit'
    });
  };

  if (loading) {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center">
        <div className="text-center">
          <RefreshCw className="w-8 h-8 text-primary animate-spin mx-auto mb-2" />
          <p className="text-gray-600">Loading class details...</p>
        </div>
      </div>
    );
  }

  if (result === 'skipped') {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center p-4">
        <div className="bg-white rounded-lg shadow-lg p-8 max-w-md w-full text-center">
          <CheckCircle className="w-16 h-16 text-green-500 mx-auto mb-4" />
          <h2 className="text-xl font-bold text-gray-900 mb-2">Auto-Signup Skipped</h2>
          <p className="text-gray-600 mb-6">
            We won't automatically sign you up for {classData?.serviceName}. The calendar event is now marked <strong>[Skipped]</strong>. You can undo this anytime from the calendar event.
          </p>
          <button
            onClick={onDone}
            className="px-6 py-3 bg-primary text-white rounded-lg hover:bg-blue-700 font-medium"
          >
            Back to App
          </button>
        </div>
      </div>
    );
  }

  if (result === 'unskipped') {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center p-4">
        <div className="bg-white rounded-lg shadow-lg p-8 max-w-md w-full text-center">
          <CheckCircle className="w-16 h-16 text-green-500 mx-auto mb-4" />
          <h2 className="text-xl font-bold text-gray-900 mb-2">Auto-Signup Re-enabled</h2>
          <p className="text-gray-600 mb-6">
            {classData?.serviceName} is back in the auto-signup queue and will be booked normally when its window opens.
          </p>
          <button
            onClick={onDone}
            className="px-6 py-3 bg-primary text-white rounded-lg hover:bg-blue-700 font-medium"
          >
            Back to App
          </button>
        </div>
      </div>
    );
  }

  if (result === 'not-found') {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center p-4">
        <div className="bg-white rounded-lg shadow-lg p-8 max-w-md w-full text-center">
          <AlertCircle className="w-16 h-16 text-yellow-500 mx-auto mb-4" />
          <h2 className="text-xl font-bold text-gray-900 mb-2">Class Not Found</h2>
          <p className="text-gray-600 mb-6">
            This class may no longer be available or the link may be invalid.
          </p>
          <button
            onClick={onDone}
            className="px-6 py-3 bg-primary text-white rounded-lg hover:bg-blue-700 font-medium"
          >
            Back to App
          </button>
        </div>
      </div>
    );
  }

  if (result === 'error') {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center p-4">
        <div className="bg-white rounded-lg shadow-lg p-8 max-w-md w-full text-center">
          <XCircle className="w-16 h-16 text-red-500 mx-auto mb-4" />
          <h2 className="text-xl font-bold text-gray-900 mb-2">Something Went Wrong</h2>
          <p className="text-gray-600 mb-6">{errorMessage || 'An unexpected error occurred.'}</p>
          <button
            onClick={onDone}
            className="px-6 py-3 bg-primary text-white rounded-lg hover:bg-blue-700 font-medium"
          >
            Back to App
          </button>
        </div>
      </div>
    );
  }

  const isPast = new Date(classData.startTime) < new Date();
  const alreadySkipped = !!classData.isSkipped;
  // If the link said "skip" but it's already skipped (or vice versa), defer to
  // the real current state so we always show the useful action.
  const showUnskip = alreadySkipped;
  const isBookedOrWaitlisted = classData.isJoined || classData.isWaited;

  return (
    <div className="min-h-screen bg-gray-50 flex items-center justify-center p-4">
      <div className="bg-white rounded-lg shadow-lg p-8 max-w-md w-full">
        <button
          onClick={onDone}
          className="flex items-center text-gray-500 hover:text-gray-700 mb-6 text-sm"
        >
          <ArrowLeft className="w-4 h-4 mr-1" />
          Back to App
        </button>

        <h2 className="text-xl font-bold text-gray-900 mb-1">
          {showUnskip ? 'Re-enable Auto-Signup' : 'Skip Auto-Signup'}
        </h2>
        <p className="text-sm text-gray-500 mb-6">
          {isBookedOrWaitlisted
            ? "You're already booked/waitlisted for this class. To get out of it, use the Cancel link instead."
            : isPast
            ? 'This class has already started.'
            : showUnskip
            ? 'Put this class back in the auto-signup queue.'
            : "We won't automatically sign you up for this class occurrence. Useful when you'll be away."}
        </p>

        <div className={`rounded-lg p-5 mb-6 border-l-4 ${
          showUnskip ? 'bg-gray-50 border-gray-400' : 'bg-amber-50 border-amber-400'
        }`}>
          <h3 className="text-lg font-semibold text-gray-900 mb-3">{classData.serviceName}</h3>
          <div className="space-y-2">
            <div className="flex items-center text-sm text-gray-700">
              <Calendar className="w-4 h-4 mr-2 text-gray-500" />
              <span>{formatDate(classData.startTime)}</span>
            </div>
            {classData.trainerName && (
              <div className="flex items-center text-sm text-gray-700">
                <User className="w-4 h-4 mr-2 text-gray-500" />
                <span>{classData.trainerName}</span>
              </div>
            )}
            {classData.locationName && (
              <div className="flex items-center text-sm text-gray-700">
                <MapPin className="w-4 h-4 mr-2 text-gray-500" />
                <span>{classData.locationName}</span>
              </div>
            )}
            {classData.duration > 0 && (
              <div className="flex items-center text-sm text-gray-700">
                <Clock className="w-4 h-4 mr-2 text-gray-500" />
                <span>{classData.duration} minutes</span>
              </div>
            )}
          </div>
          <div className="mt-3">
            {alreadySkipped && (
              <span className="px-3 py-1 text-xs font-medium rounded-full bg-amber-100 text-amber-800 border border-amber-200">
                SKIPPED
              </span>
            )}
          </div>
        </div>

        <div className="flex space-x-3">
          <button
            onClick={onDone}
            className="flex-1 px-4 py-3 bg-gray-100 text-gray-700 rounded-lg hover:bg-gray-200 font-medium"
          >
            {isBookedOrWaitlisted ? 'Back to App' : 'Cancel'}
          </button>
          {!isBookedOrWaitlisted && showUnskip && (
            <button
              onClick={handleUnskip}
              disabled={submitting}
              className="flex-1 px-4 py-3 bg-green-600 text-white rounded-lg hover:bg-green-700 font-medium disabled:opacity-50 flex items-center justify-center space-x-2"
            >
              {submitting ? (
                <>
                  <RefreshCw className="w-4 h-4 animate-spin" />
                  <span>Re-enabling...</span>
                </>
              ) : (
                <>
                  <RotateCcw className="w-4 h-4" />
                  <span>Re-enable</span>
                </>
              )}
            </button>
          )}
          {!isBookedOrWaitlisted && !showUnskip && !isPast && (
            <button
              onClick={handleSkip}
              disabled={submitting}
              className="flex-1 px-4 py-3 bg-amber-600 text-white rounded-lg hover:bg-amber-700 font-medium disabled:opacity-50 flex items-center justify-center space-x-2"
            >
              {submitting ? (
                <>
                  <RefreshCw className="w-4 h-4 animate-spin" />
                  <span>Skipping...</span>
                </>
              ) : (
                <>
                  <Ban className="w-4 h-4" />
                  <span>Skip This Class</span>
                </>
              )}
            </button>
          )}
        </div>
      </div>
    </div>
  );
}

export default SkipClass;
