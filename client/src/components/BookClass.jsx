import React, { useState, useEffect } from 'react';
import api from '../api';
import * as classActions from '../services/classActions';
import { Calendar, Clock, MapPin, User, Users, CheckCircle, XCircle, RefreshCw, AlertCircle, ArrowLeft, Info } from 'lucide-react';

function BookClass({ occurrenceId, onDone }) {
  const [classData, setClassData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [booking, setBooking] = useState(false);
  const [result, setResult] = useState(null); // 'signup-success' | 'waitlist-success' | 'not-found' | 'error'
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

  const handleSignup = async () => {
    setBooking(true);
    try {
      await classActions.signupForClass(occurrenceId, classData.lock_version);
      setResult('signup-success');
    } catch (error) {
      console.error('Signup failed:', error);
      setResult('error');
      setErrorMessage(error.response?.data?.error || error.message);
    } finally {
      setBooking(false);
    }
  };

  const handleJoinWaitlist = async () => {
    setBooking(true);
    try {
      await classActions.joinWaitlist(occurrenceId);
      setResult('waitlist-success');
    } catch (error) {
      console.error('Join waitlist failed:', error);
      setResult('error');
      setErrorMessage(error.response?.data?.error || error.message);
    } finally {
      setBooking(false);
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

  if (result === 'signup-success') {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center p-4">
        <div className="bg-white rounded-lg shadow-lg p-8 max-w-md w-full text-center">
          <CheckCircle className="w-16 h-16 text-green-500 mx-auto mb-4" />
          <h2 className="text-xl font-bold text-gray-900 mb-2">Successfully Signed Up</h2>
          <p className="text-gray-600 mb-6">
            You are now booked for {classData?.serviceName}.
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

  if (result === 'waitlist-success') {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center p-4">
        <div className="bg-white rounded-lg shadow-lg p-8 max-w-md w-full text-center">
          <CheckCircle className="w-16 h-16 text-yellow-500 mx-auto mb-4" />
          <h2 className="text-xl font-bold text-gray-900 mb-2">Joined Waitlist</h2>
          <p className="text-gray-600 mb-6">
            You have been added to the waitlist for {classData?.serviceName}. You'll be automatically enrolled if a spot opens up.
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
  const isAlreadyBooked = classData.isJoined && !classData.isWaited;
  const isAlreadyWaitlisted = classData.isWaited;
  const bookingWindowClosed = classData.restrictToBookInAdvanceHours > 0 &&
    (new Date(classData.startTime).getTime() - Date.now()) > (classData.restrictToBookInAdvanceHours * 60 * 60 * 1000);

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

        <h2 className="text-xl font-bold text-gray-900 mb-1">Book Class</h2>
        <p className="text-sm text-gray-500 mb-6">
          {isAlreadyBooked ? "You're already booked for this class." :
           isAlreadyWaitlisted ? "You're already on the waitlist for this class." :
           isPast ? 'This class has already started.' :
           bookingWindowClosed ? 'The booking window is not yet open.' :
           classData.canSignup ? 'Sign up for this class.' :
           classData.canJoinWaitlist ? 'This class is full. You can join the waitlist.' :
           'This class is not available for booking.'}
        </p>

        <div className={`rounded-lg p-5 mb-6 border-l-4 ${
          isAlreadyBooked ? 'bg-green-50 border-green-400' :
          isAlreadyWaitlisted ? 'bg-yellow-50 border-yellow-400' :
          classData.canSignup ? 'bg-blue-50 border-blue-400' :
          classData.canJoinWaitlist ? 'bg-yellow-50 border-yellow-400' :
          'bg-gray-50 border-gray-400'
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
            <div className="flex items-center text-sm text-gray-700">
              <Users className="w-4 h-4 mr-2 text-gray-500" />
              <span>{classData.spotsAvailable} / {classData.spotsTotal} spots available</span>
            </div>
          </div>
          <div className="mt-3">
            {isAlreadyBooked && (
              <span className="px-3 py-1 text-xs font-medium rounded-full bg-green-100 text-green-800 border border-green-200">
                BOOKED
              </span>
            )}
            {isAlreadyWaitlisted && (
              <span className="px-3 py-1 text-xs font-medium rounded-full bg-yellow-100 text-yellow-800 border border-yellow-200">
                WAITLIST #{classData.positionOnWaitingList || '?'}
              </span>
            )}
            {!isAlreadyBooked && !isAlreadyWaitlisted && classData.fullGroup && (
              <span className="px-3 py-1 text-xs font-medium rounded-full bg-red-100 text-red-800 border border-red-200">
                FULL
              </span>
            )}
          </div>
        </div>

        {bookingWindowClosed && !isAlreadyBooked && !isAlreadyWaitlisted && !isPast && (
          <div className="flex items-start space-x-2 mb-6 p-3 bg-blue-50 rounded-lg">
            <Info className="w-5 h-5 text-blue-500 flex-shrink-0 mt-0.5" />
            <p className="text-sm text-blue-700">
              Booking opens {classData.restrictToBookInAdvanceHours} hours before class starts.
            </p>
          </div>
        )}

        <div className="flex space-x-3">
          <button
            onClick={onDone}
            className="flex-1 px-4 py-3 bg-gray-100 text-gray-700 rounded-lg hover:bg-gray-200 font-medium"
          >
            {isAlreadyBooked || isAlreadyWaitlisted ? 'Back to App' : 'Cancel'}
          </button>
          {classData.canSignup && (
            <button
              onClick={handleSignup}
              disabled={booking}
              className="flex-1 px-4 py-3 bg-green-600 text-white rounded-lg hover:bg-green-700 font-medium disabled:opacity-50 flex items-center justify-center space-x-2"
            >
              {booking ? (
                <>
                  <RefreshCw className="w-4 h-4 animate-spin" />
                  <span>Signing up...</span>
                </>
              ) : (
                <span>Sign Up</span>
              )}
            </button>
          )}
          {classData.canJoinWaitlist && (
            <button
              onClick={handleJoinWaitlist}
              disabled={booking}
              className="flex-1 px-4 py-3 bg-yellow-600 text-white rounded-lg hover:bg-yellow-700 font-medium disabled:opacity-50 flex items-center justify-center space-x-2"
            >
              {booking ? (
                <>
                  <RefreshCw className="w-4 h-4 animate-spin" />
                  <span>Joining...</span>
                </>
              ) : (
                <span>Join Waitlist</span>
              )}
            </button>
          )}
        </div>
      </div>
    </div>
  );
}

export default BookClass;
