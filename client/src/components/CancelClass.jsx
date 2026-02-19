import React, { useState, useEffect } from 'react';
import api from '../api';
import * as classActions from '../services/classActions';
import { Calendar, Clock, MapPin, User, CheckCircle, XCircle, RefreshCw, AlertCircle, ArrowLeft } from 'lucide-react';

function CancelClass({ occurrenceId, onDone }) {
  const [booking, setBooking] = useState(null);
  const [loading, setLoading] = useState(true);
  const [cancelling, setCancelling] = useState(false);
  const [result, setResult] = useState(null); // 'success' | 'not-found' | 'error'
  const [errorMessage, setErrorMessage] = useState('');

  useEffect(() => {
    fetchBooking();
  }, [occurrenceId]);

  const fetchBooking = async () => {
    setLoading(true);
    try {
      const response = await api.get('/api/my-bookings', {
        params: { includeActiveOnly: false }
      });
      const bookings = response.data?.data || [];
      const found = bookings.find(b => String(b.id) === String(occurrenceId));
      if (found && (found.is_joined || found.is_waited)) {
        setBooking(found);
      } else {
        setResult('not-found');
      }
    } catch (error) {
      console.error('Failed to fetch booking:', error);
      setResult('error');
      setErrorMessage(error.response?.data?.error || error.message);
    } finally {
      setLoading(false);
    }
  };

  const handleCancel = async () => {
    setCancelling(true);
    try {
      const isWaitlisted = booking.is_waited && !booking.is_joined;
      if (isWaitlisted) {
        await classActions.leaveWaitlist(occurrenceId);
      } else {
        await classActions.cancelBooking(occurrenceId);
      }
      setResult('success');
    } catch (error) {
      console.error('Cancel failed:', error);
      setResult('error');
      setErrorMessage(error.response?.data?.error || error.message);
    } finally {
      setCancelling(false);
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

  if (result === 'success') {
    const isWaitlisted = booking?.is_waited && !booking?.is_joined;
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center p-4">
        <div className="bg-white rounded-lg shadow-lg p-8 max-w-md w-full text-center">
          <CheckCircle className="w-16 h-16 text-green-500 mx-auto mb-4" />
          <h2 className="text-xl font-bold text-gray-900 mb-2">
            {isWaitlisted ? 'Left Waitlist' : 'Booking Cancelled'}
          </h2>
          <p className="text-gray-600 mb-6">
            {isWaitlisted
              ? `You have been removed from the waitlist for ${booking?.service_title}.`
              : `Your booking for ${booking?.service_title} has been cancelled.`}
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
          <h2 className="text-xl font-bold text-gray-900 mb-2">Booking Not Found</h2>
          <p className="text-gray-600 mb-6">
            This booking may have already been cancelled or the class has passed.
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

  const isWaitlisted = booking.is_waited && !booking.is_joined;

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
          {isWaitlisted ? 'Leave Waitlist' : 'Cancel Booking'}
        </h2>
        <p className="text-sm text-gray-500 mb-6">
          {isWaitlisted
            ? 'Are you sure you want to leave the waitlist for this class?'
            : 'Are you sure you want to cancel this booking?'}
        </p>

        <div className={`rounded-lg p-5 mb-6 border-l-4 ${
          isWaitlisted ? 'bg-yellow-50 border-yellow-400' : 'bg-blue-50 border-blue-400'
        }`}>
          <h3 className="text-lg font-semibold text-gray-900 mb-3">{booking.service_title}</h3>
          <div className="space-y-2">
            <div className="flex items-center text-sm text-gray-700">
              <Calendar className="w-4 h-4 mr-2 text-gray-500" />
              <span>{formatDate(booking.occurs_at)}</span>
            </div>
            {booking.trainer_name && (
              <div className="flex items-center text-sm text-gray-700">
                <User className="w-4 h-4 mr-2 text-gray-500" />
                <span>{booking.trainer_name}</span>
              </div>
            )}
            {booking.location_name && (
              <div className="flex items-center text-sm text-gray-700">
                <MapPin className="w-4 h-4 mr-2 text-gray-500" />
                <span>
                  {booking.location_name}
                  {booking.sub_location_name && ` - ${booking.sub_location_name}`}
                </span>
              </div>
            )}
            {booking.duration_in_minutes && (
              <div className="flex items-center text-sm text-gray-700">
                <Clock className="w-4 h-4 mr-2 text-gray-500" />
                <span>{booking.duration_in_minutes} minutes</span>
              </div>
            )}
          </div>
          <div className="mt-3">
            <span className={`px-3 py-1 text-xs font-medium rounded-full ${
              isWaitlisted
                ? 'bg-yellow-100 text-yellow-800 border border-yellow-200'
                : 'bg-green-100 text-green-800 border border-green-200'
            }`}>
              {isWaitlisted ? `WAITLIST #${booking.position_on_waiting_list || '?'}` : 'BOOKED'}
            </span>
          </div>
        </div>

        <div className="flex space-x-3">
          <button
            onClick={onDone}
            className="flex-1 px-4 py-3 bg-gray-100 text-gray-700 rounded-lg hover:bg-gray-200 font-medium"
          >
            Keep It
          </button>
          <button
            onClick={handleCancel}
            disabled={cancelling}
            className={`flex-1 px-4 py-3 text-white rounded-lg font-medium disabled:opacity-50 flex items-center justify-center space-x-2 ${
              isWaitlisted
                ? 'bg-yellow-600 hover:bg-yellow-700'
                : 'bg-red-600 hover:bg-red-700'
            }`}
          >
            {cancelling ? (
              <>
                <RefreshCw className="w-4 h-4 animate-spin" />
                <span>{isWaitlisted ? 'Leaving...' : 'Cancelling...'}</span>
              </>
            ) : (
              <span>{isWaitlisted ? 'Leave Waitlist' : 'Cancel Booking'}</span>
            )}
          </button>
        </div>
      </div>
    </div>
  );
}

export default CancelClass;
