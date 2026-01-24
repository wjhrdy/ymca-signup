import React, { useState, useEffect } from 'react';
import api from '../api';
import * as classActions from '../services/classActions';
import { Calendar, Clock, MapPin, User, CheckCircle, XCircle, RefreshCw, AlertCircle, Trash2, ListChecks, LogOut } from 'lucide-react';
import toast from 'react-hot-toast';
import { useConfirm } from './ConfirmDialog';

function SignupLogs() {
  const { confirm } = useConfirm();
  const [bookings, setBookings] = useState([]);
  const [loading, setLoading] = useState(false);
  const [actionInProgress, setActionInProgress] = useState(null);
  const [filter, setFilter] = useState('all');

  useEffect(() => {
    fetchBookings();
    const interval = setInterval(fetchBookings, 30000);
    return () => clearInterval(interval);
  }, []);

  const fetchBookings = async () => {
    setLoading(true);
    try {
      const today = new Date().toISOString();
      const response = await api.get('/api/my-bookings', {
        params: {
          includeActiveOnly: false,
          startDate: today
        }
      });
      setBookings(response.data?.data || []);
    } catch (error) {
      console.error('Failed to fetch bookings:', error);
    } finally {
      setLoading(false);
    }
  };

  const handleCancelBooking = async (occurrenceId) => {
    const confirmed = await confirm('Are you sure you want to cancel this booking?', {
      title: 'Cancel Booking',
      confirmText: 'Cancel Booking'
    });
    if (!confirmed) return;

    setActionInProgress(occurrenceId);
    try {
      await classActions.cancelBooking(occurrenceId);
      toast.success('Booking cancelled successfully');
      await fetchBookings();
    } catch (error) {
      console.error('Failed to cancel booking:', error);
      toast.error('Failed to cancel booking: ' + (error.response?.data?.error || error.message));
    } finally {
      setActionInProgress(null);
    }
  };

  const handleLeaveWaitlist = async (occurrenceId) => {
    const confirmed = await confirm('Are you sure you want to leave the waitlist?', {
      title: 'Leave Waitlist',
      confirmText: 'Leave Waitlist'
    });
    if (!confirmed) return;

    setActionInProgress(occurrenceId);
    try {
      await classActions.leaveWaitlist(occurrenceId);
      toast.success('Left waitlist successfully');
      await fetchBookings();
    } catch (error) {
      console.error('Failed to leave waitlist:', error);
      toast.error('Failed to leave waitlist: ' + (error.response?.data?.error || error.message));
    } finally {
      setActionInProgress(null);
    }
  };

  const formatDate = (dateString) => {
    const date = new Date(dateString);
    return date.toLocaleString('en-US', {
      month: 'short',
      day: 'numeric',
      year: 'numeric',
      hour: '2-digit',
      minute: '2-digit'
    });
  };

  const getFilteredBookings = () => {
    const now = new Date();
    
    return bookings.filter(booking => {
      const occursAt = new Date(booking.occurs_at);
      
      if (filter === 'active') {
        return booking.is_joined && occursAt > now;
      } else if (filter === 'waitlist') {
        return booking.is_waited;
      } else if (filter === 'upcoming') {
        return (booking.is_joined || booking.is_waited) && occursAt > now;
      } else if (filter === 'past') {
        return occursAt <= now;
      }
      return true;
    }).sort((a, b) => new Date(a.occurs_at) - new Date(b.occurs_at));
  };

  const filteredBookings = getFilteredBookings();
  const upcomingCount = bookings.filter(b => {
    const occursAt = new Date(b.occurs_at);
    return b.is_joined && occursAt > new Date();
  }).length;
  const waitlistCount = bookings.filter(b => b.is_waited).length;

  return (
    <div className="space-y-6">
      <div className="bg-white rounded-lg shadow p-6">
        <div className="flex items-center justify-between mb-4">
          <div>
            <h2 className="text-lg font-semibold text-gray-900">My Bookings</h2>
            <p className="text-sm text-gray-500 mt-1">
              Manage your class signups and waitlist items
            </p>
          </div>
          <button
            onClick={fetchBookings}
            disabled={loading}
            className="px-4 py-2 bg-primary text-white rounded-lg hover:bg-blue-700 disabled:opacity-50 flex items-center space-x-2"
          >
            <RefreshCw className={`w-4 h-4 ${loading ? 'animate-spin' : ''}`} />
            <span>Refresh</span>
          </button>
        </div>

        {bookings.length > 0 && (
          <div className="grid grid-cols-3 gap-4 mb-6">
            <div className="bg-green-50 border border-green-200 rounded-lg p-4">
              <div className="flex items-center justify-between">
                <span className="text-sm font-medium text-green-800">Upcoming</span>
                <CheckCircle className="w-5 h-5 text-green-600" />
              </div>
              <p className="text-2xl font-bold text-green-900 mt-2">
                {upcomingCount}
              </p>
            </div>
            <div className="bg-yellow-50 border border-yellow-200 rounded-lg p-4">
              <div className="flex items-center justify-between">
                <span className="text-sm font-medium text-yellow-800">Waitlist</span>
                <ListChecks className="w-5 h-5 text-yellow-600" />
              </div>
              <p className="text-2xl font-bold text-yellow-900 mt-2">
                {waitlistCount}
              </p>
            </div>
            <div className="bg-blue-50 border border-blue-200 rounded-lg p-4">
              <div className="flex items-center justify-between">
                <span className="text-sm font-medium text-blue-800">Total</span>
                <Calendar className="w-5 h-5 text-blue-600" />
              </div>
              <p className="text-2xl font-bold text-blue-900 mt-2">
                {bookings.length}
              </p>
            </div>
          </div>
        )}

        <div className="flex space-x-2 mb-4">
          <button
            onClick={() => setFilter('all')}
            className={`px-4 py-2 rounded-lg text-sm font-medium ${
              filter === 'all'
                ? 'bg-primary text-white'
                : 'bg-gray-100 text-gray-700 hover:bg-gray-200'
            }`}
          >
            All
          </button>
          <button
            onClick={() => setFilter('upcoming')}
            className={`px-4 py-2 rounded-lg text-sm font-medium ${
              filter === 'upcoming'
                ? 'bg-primary text-white'
                : 'bg-gray-100 text-gray-700 hover:bg-gray-200'
            }`}
          >
            Upcoming
          </button>
          <button
            onClick={() => setFilter('active')}
            className={`px-4 py-2 rounded-lg text-sm font-medium ${
              filter === 'active'
                ? 'bg-primary text-white'
                : 'bg-gray-100 text-gray-700 hover:bg-gray-200'
            }`}
          >
            Active
          </button>
          <button
            onClick={() => setFilter('waitlist')}
            className={`px-4 py-2 rounded-lg text-sm font-medium ${
              filter === 'waitlist'
                ? 'bg-primary text-white'
                : 'bg-gray-100 text-gray-700 hover:bg-gray-200'
            }`}
          >
            Waitlist
          </button>
          <button
            onClick={() => setFilter('past')}
            className={`px-4 py-2 rounded-lg text-sm font-medium ${
              filter === 'past'
                ? 'bg-primary text-white'
                : 'bg-gray-100 text-gray-700 hover:bg-gray-200'
            }`}
          >
            Past
          </button>
        </div>
      </div>

      {loading && bookings.length === 0 ? (
        <div className="text-center py-12">
          <RefreshCw className="w-8 h-8 text-primary animate-spin mx-auto" />
          <p className="mt-2 text-gray-500">Loading bookings...</p>
        </div>
      ) : (
        <div className="space-y-3">
          {filteredBookings.map((booking) => {
            const isPast = new Date(booking.occurs_at) <= new Date();
            const isWaitlisted = booking.is_waited;
            const isActive = booking.is_joined && !isPast;
            
            return (
              <div
                key={booking.id}
                className={`bg-white rounded-lg shadow hover:shadow-md transition-shadow p-6 border-l-4 ${
                  isWaitlisted ? 'border-yellow-500' : isActive ? 'border-green-500' : 'border-gray-300'
                }`}
              >
                <div className="flex items-start justify-between mb-3">
                  <div className="flex items-start space-x-3 flex-1">
                    <div className="mt-1">
                      {isWaitlisted ? (
                        <ListChecks className="w-5 h-5 text-yellow-600" />
                      ) : isActive ? (
                        <CheckCircle className="w-5 h-5 text-green-600" />
                      ) : (
                        <Clock className="w-5 h-5 text-gray-400" />
                      )}
                    </div>
                    <div className="flex-1">
                      <h3 className="text-lg font-semibold text-gray-900">{booking.service_title}</h3>
                      <div className="mt-2 space-y-1">
                        {booking.trainer_name && (
                          <div className="flex items-center text-sm text-gray-600">
                            <User className="w-4 h-4 mr-2" />
                            <span>{booking.trainer_name}</span>
                          </div>
                        )}
                        {booking.location_name && (
                          <div className="flex items-center text-sm text-gray-600">
                            <MapPin className="w-4 h-4 mr-2" />
                            <span>{booking.location_name}</span>
                            {booking.sub_location_name && (
                              <span className="text-gray-400 ml-1">• {booking.sub_location_name}</span>
                            )}
                          </div>
                        )}
                        <div className="flex items-center text-sm text-gray-600">
                          <Calendar className="w-4 h-4 mr-2" />
                          <span>{formatDate(booking.occurs_at)}</span>
                        </div>
                        {isWaitlisted && (
                          <div className="flex items-center text-sm text-yellow-700 bg-yellow-50 px-2 py-1 rounded mt-2 inline-flex">
                            <AlertCircle className="w-4 h-4 mr-2" />
                            <span>Position #{booking.position_on_waiting_list} on waitlist</span>
                          </div>
                        )}
                      </div>
                    </div>
                  </div>
                  <div className="flex items-center space-x-2">
                    <span className={`px-3 py-1 text-xs font-medium rounded-full ${
                      isWaitlisted
                        ? 'bg-yellow-100 text-yellow-800 border border-yellow-200'
                        : isActive
                        ? 'bg-green-100 text-green-800 border border-green-200'
                        : 'bg-gray-100 text-gray-600 border border-gray-200'
                    }`}>
                      {isWaitlisted ? 'WAITLIST' : isActive ? 'BOOKED' : 'COMPLETED'}
                    </span>
                    {!isPast && isWaitlisted && (
                      <button
                        onClick={() => handleLeaveWaitlist(booking.id)}
                        disabled={actionInProgress === booking.id}
                        className="px-4 py-2 bg-yellow-100 text-yellow-700 rounded-lg hover:bg-yellow-200 disabled:opacity-50 flex items-center space-x-2"
                      >
                        {actionInProgress === booking.id ? (
                          <>
                            <RefreshCw className="w-4 h-4 animate-spin" />
                            <span>Leaving...</span>
                          </>
                        ) : (
                          <>
                            <LogOut className="w-4 h-4" />
                            <span>Leave Waitlist</span>
                          </>
                        )}
                      </button>
                    )}
                    {!isPast && booking.is_joined && !isWaitlisted && (
                      <button
                        onClick={() => handleCancelBooking(booking.id)}
                        disabled={actionInProgress === booking.id}
                        className="px-4 py-2 bg-red-100 text-red-700 rounded-lg hover:bg-red-200 disabled:opacity-50 flex items-center space-x-2"
                      >
                        {actionInProgress === booking.id ? (
                          <>
                            <RefreshCw className="w-4 h-4 animate-spin" />
                            <span>Cancelling...</span>
                          </>
                        ) : (
                          <>
                            <Trash2 className="w-4 h-4" />
                            <span>Cancel Booking</span>
                          </>
                        )}
                      </button>
                    )}
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      )}

      {!loading && filteredBookings.length === 0 && (
        <div className="text-center py-12 bg-white rounded-lg shadow">
          <AlertCircle className="w-12 h-12 text-gray-400 mx-auto mb-3" />
          <p className="text-gray-500">
            {bookings.length === 0 ? 'No bookings yet' : 'No bookings match this filter'}
          </p>
          <p className="text-sm text-gray-400 mt-1">
            {bookings.length === 0 ? 'Your class signups will appear here' : 'Try selecting a different filter'}
          </p>
        </div>
      )}
    </div>
  );
}

export default SignupLogs;
