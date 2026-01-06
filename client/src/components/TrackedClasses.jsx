import React, { useState, useEffect } from 'react';
import api from '../api';
import { Calendar, Clock, MapPin, User, Trash2, Settings, RefreshCw, ToggleLeft, ToggleRight, Eye, BookOpen, X, UserX } from 'lucide-react';

function TrackedClasses() {
  const [classes, setClasses] = useState([]);
  const [loading, setLoading] = useState(false);
  const [editingId, setEditingId] = useState(null);
  const [editForm, setEditForm] = useState({ autoSignup: false, signupHoursBefore: 46 });
  const [previewingId, setPreviewingId] = useState(null);
  const [previewClasses, setPreviewClasses] = useState([]);
  const [previewLoading, setPreviewLoading] = useState(false);
  const [bookingClass, setBookingClass] = useState(null);

  useEffect(() => {
    fetchTrackedClasses();
  }, []);

  const fetchTrackedClasses = async () => {
    setLoading(true);
    try {
      const response = await api.get('/api/tracked-classes');
      setClasses(response.data);
    } catch (error) {
      console.error('Failed to fetch tracked classes:', error);
    } finally {
      setLoading(false);
    }
  };

  const startEdit = (classItem) => {
    setEditingId(classItem.id);
    setEditForm({
      autoSignup: classItem.auto_signup === 1,
      signupHoursBefore: classItem.signup_hours_before
    });
  };

  const saveEdit = async (id) => {
    try {
      await api.put(`/api/tracked-classes/${id}`, editForm);
      setEditingId(null);
      fetchTrackedClasses();
    } catch (error) {
      console.error('Failed to update class:', error);
      alert('Failed to update class: ' + (error.response?.data?.error || error.message));
    }
  };

  const deleteClass = async (id) => {
    if (!confirm('Remove this class from tracking?')) return;

    try {
      await api.delete(`/api/tracked-classes/${id}`);
      fetchTrackedClasses();
    } catch (error) {
      console.error('Failed to delete class:', error);
      alert('Failed to delete class: ' + (error.response?.data?.error || error.message));
    }
  };

  const toggleAutoSignup = async (classItem) => {
    try {
      await api.put(`/api/tracked-classes/${classItem.id}`, {
        autoSignup: classItem.auto_signup === 0,
        signupHoursBefore: classItem.signup_hours_before
      });
      fetchTrackedClasses();
    } catch (error) {
      console.error('Failed to toggle auto-signup:', error);
      alert('Failed to toggle auto-signup: ' + (error.response?.data?.error || error.message));
    }
  };

  const previewMatches = async (classItem) => {
    setPreviewingId(classItem.id);
    setPreviewLoading(true);
    setPreviewClasses([]);
    try {
      const requestData = {
        serviceId: classItem.service_id,
        trainerId: classItem.trainer_id,
        locationId: classItem.location_id,
        locationName: classItem.location_name,
        dayOfWeek: classItem.day_of_week,
        startTime: classItem.start_time,
        matchTrainer: classItem.match_trainer === 1,
        matchExactTime: classItem.match_exact_time === 1,
        timeTolerance: classItem.time_tolerance || 15
      };
      console.log('Preview request data:', requestData);
      console.log('Full classItem:', classItem);
      
      const response = await api.post('/api/tracked-classes/preview', requestData);
      console.log('Preview response:', response.data);
      console.log('Preview classes with enrollment status:', response.data.matchingClasses?.map(c => ({ 
        id: c.id, 
        serviceName: c.serviceName, 
        isJoined: c.isJoined, 
        canSignup: c.canSignup 
      })));
      setPreviewClasses(response.data.matchingClasses || []);
    } catch (error) {
      console.error('Failed to preview matches:', error);
      alert('Failed to preview matches: ' + (error.response?.data?.error || error.message));
    } finally {
      setPreviewLoading(false);
    }
  };

  const bookClass = async (occurrenceId, serviceName) => {
    if (!confirm(`Sign up for ${serviceName}?`)) return;

    setBookingClass(occurrenceId);
    try {
      // Find the occurrence in preview classes to get its lock_version
      const occurrence = previewClasses.find(c => c.id === occurrenceId);
      const payload = occurrence?.lock_version !== undefined 
        ? { lock_version: occurrence.lock_version }
        : {};
      
      console.log(`Booking class ${occurrenceId} with payload:`, payload);
      
      await api.post(`/api/signup/${occurrenceId}`, payload);
      alert('Successfully signed up for class!');
      const updatedClassItem = classes.find(c => c.id === previewingId);
      if (updatedClassItem) {
        await previewMatches(updatedClassItem);
      }
    } catch (error) {
      console.error('Signup failed:', error);
      alert('Signup failed: ' + (error.response?.data?.error || error.message));
    } finally {
      setBookingClass(null);
    }
  };

  const cancelClass = async (occurrenceId, serviceName) => {
    if (!confirm(`Cancel your enrollment in ${serviceName}?`)) return;

    setBookingClass(occurrenceId);
    try {
      await api.delete(`/api/bookings/${occurrenceId}`);
      alert('Successfully cancelled class!');
      const updatedClassItem = classes.find(c => c.id === previewingId);
      if (updatedClassItem) {
        await previewMatches(updatedClassItem);
      }
    } catch (error) {
      console.error('Cancel failed:', error);
      alert('Cancel failed: ' + (error.response?.data?.error || error.message));
    } finally {
      setBookingClass(null);
    }
  };

  const getDayOfWeekColor = (day) => {
    const colors = {
      'Monday': 'bg-blue-100 text-blue-800',
      'Tuesday': 'bg-green-100 text-green-800',
      'Wednesday': 'bg-yellow-100 text-yellow-800',
      'Thursday': 'bg-purple-100 text-purple-800',
      'Friday': 'bg-pink-100 text-pink-800',
      'Saturday': 'bg-orange-100 text-orange-800',
      'Sunday': 'bg-red-100 text-red-800'
    };
    return colors[day] || 'bg-gray-100 text-gray-800';
  };

  return (
    <div className="space-y-6">
      <div className="bg-white rounded-lg shadow p-6">
        <div className="flex items-center justify-between mb-4">
          <div>
            <h2 className="text-lg font-semibold text-gray-900">Tracked Classes</h2>
            <p className="text-sm text-gray-500 mt-1">
              Classes that match these patterns will be automatically signed up based on your settings
            </p>
          </div>
          <button
            onClick={fetchTrackedClasses}
            disabled={loading}
            className="px-4 py-2 bg-primary text-white rounded-lg hover:bg-blue-700 disabled:opacity-50 flex items-center space-x-2"
          >
            <RefreshCw className={`w-4 h-4 ${loading ? 'animate-spin' : ''}`} />
            <span>Refresh</span>
          </button>
        </div>
      </div>

      {loading ? (
        <div className="text-center py-12">
          <RefreshCw className="w-8 h-8 text-primary animate-spin mx-auto" />
          <p className="mt-2 text-gray-500">Loading tracked classes...</p>
        </div>
      ) : (
        <div className="grid grid-cols-1 gap-4">
          {[...classes].sort((a, b) => {
            const dateA = a.next_occurrence ? new Date(a.next_occurrence) : new Date(8640000000000000);
            const dateB = b.next_occurrence ? new Date(b.next_occurrence) : new Date(8640000000000000);
            return dateA - dateB;
          }).map((classItem) => (
            <div key={classItem.id} className="bg-white rounded-lg shadow hover:shadow-lg transition-shadow p-6">
              {editingId === classItem.id ? (
                <div className="space-y-4">
                  <h3 className="text-lg font-semibold text-gray-900">{classItem.service_name}</h3>
                  
                  <div className="space-y-3">
                    <div className="flex items-center justify-between">
                      <label className="text-sm font-medium text-gray-700">Auto Signup</label>
                      <button
                        onClick={() => setEditForm({ ...editForm, autoSignup: !editForm.autoSignup })}
                        className={`flex items-center space-x-2 px-4 py-2 rounded-lg ${
                          editForm.autoSignup
                            ? 'bg-green-100 text-green-800'
                            : 'bg-gray-100 text-gray-600'
                        }`}
                      >
                        {editForm.autoSignup ? (
                          <>
                            <ToggleRight className="w-5 h-5" />
                            <span>Enabled</span>
                          </>
                        ) : (
                          <>
                            <ToggleLeft className="w-5 h-5" />
                            <span>Disabled</span>
                          </>
                        )}
                      </button>
                    </div>

                    <div>
                      <label className="block text-sm font-medium text-gray-700 mb-1">
                        Sign up (hours before class)
                      </label>
                      <input
                        type="number"
                        value={editForm.signupHoursBefore}
                        onChange={(e) => setEditForm({ ...editForm, signupHoursBefore: parseInt(e.target.value) })}
                        className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-primary focus:border-transparent"
                        min="1"
                        max="168"
                      />
                      <p className="text-xs text-gray-500 mt-1">
                        The system will attempt signup this many hours before the class starts
                      </p>
                    </div>
                  </div>

                  <div className="flex space-x-2">
                    <button
                      onClick={() => saveEdit(classItem.id)}
                      className="flex-1 px-4 py-2 bg-primary text-white rounded-lg hover:bg-blue-700"
                    >
                      Save
                    </button>
                    <button
                      onClick={() => setEditingId(null)}
                      className="flex-1 px-4 py-2 bg-gray-100 text-gray-700 rounded-lg hover:bg-gray-200"
                    >
                      Cancel
                    </button>
                  </div>
                </div>
              ) : (
                <>
                  <div className="flex items-start justify-between mb-4">
                    <div className="flex-1">
                      <h3 className="text-lg font-semibold text-gray-900 mb-2">{classItem.service_name}</h3>
                      <div className="flex flex-wrap gap-2 mb-3">
                        {classItem.day_of_week && (
                          <span className={`px-2 py-1 text-xs font-medium rounded ${getDayOfWeekColor(classItem.day_of_week)}`}>
                            {classItem.day_of_week}
                          </span>
                        )}
                        {classItem.auto_signup === 1 ? (
                          <span className="px-2 py-1 bg-green-100 text-green-800 text-xs font-medium rounded">
                            Auto-signup enabled
                          </span>
                        ) : (
                          <span className="px-2 py-1 bg-gray-100 text-gray-600 text-xs font-medium rounded">
                            Manual only
                          </span>
                        )}
                      </div>
                    </div>
                  </div>

                  <div className="space-y-2 mb-4">
                    {classItem.trainer_name && (
                      <div className="flex items-center text-sm text-gray-600">
                        <User className="w-4 h-4 mr-2" />
                        <span>{classItem.trainer_name}</span>
                        {classItem.match_trainer === 0 && (
                          <span className="ml-2 px-2 py-0.5 bg-yellow-100 text-yellow-800 text-xs rounded">
                            any instructor
                          </span>
                        )}
                      </div>
                    )}
                    <div className="flex items-center text-sm text-gray-600">
                      <MapPin className="w-4 h-4 mr-2" />
                      <span>{classItem.location_name}</span>
                    </div>
                    {classItem.start_time && (
                      <div className="flex items-center text-sm text-gray-600">
                        <Clock className="w-4 h-4 mr-2" />
                        <span>
                          {new Date(`2000-01-01T${classItem.start_time}`).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                        </span>
                        {classItem.match_exact_time === 0 && classItem.time_tolerance && (
                          <span className="ml-2 px-2 py-0.5 bg-yellow-100 text-yellow-800 text-xs rounded">
                            ±{classItem.time_tolerance}min
                          </span>
                        )}
                      </div>
                    )}
                  </div>

                  {classItem.auto_signup === 1 && (
                    <div className="bg-blue-50 border border-blue-200 rounded-lg p-3 mb-4">
                      <p className="text-sm text-blue-800">
                        Will attempt signup <strong>{classItem.signup_hours_before} hours</strong> before class starts
                      </p>
                    </div>
                  )}

                  <div className="flex space-x-2">
                    <button
                      onClick={() => previewMatches(classItem)}
                      className="flex-1 px-4 py-2 bg-blue-100 text-blue-800 rounded-lg hover:bg-blue-200 flex items-center justify-center space-x-2"
                    >
                      <Eye className="w-4 h-4" />
                      <span>Preview</span>
                    </button>
                    <button
                      onClick={() => toggleAutoSignup(classItem)}
                      className={`flex-1 px-4 py-2 rounded-lg flex items-center justify-center space-x-2 ${
                        classItem.auto_signup === 1
                          ? 'bg-yellow-100 text-yellow-800 hover:bg-yellow-200'
                          : 'bg-green-100 text-green-800 hover:bg-green-200'
                      }`}
                    >
                      {classItem.auto_signup === 1 ? (
                        <>
                          <ToggleLeft className="w-4 h-4" />
                          <span>Disable Auto</span>
                        </>
                      ) : (
                        <>
                          <ToggleRight className="w-4 h-4" />
                          <span>Enable Auto</span>
                        </>
                      )}
                    </button>
                    <button
                      onClick={() => startEdit(classItem)}
                      className="px-4 py-2 bg-gray-100 text-gray-700 rounded-lg hover:bg-gray-200 flex items-center justify-center"
                    >
                      <Settings className="w-4 h-4" />
                    </button>
                    <button
                      onClick={() => deleteClass(classItem.id)}
                      className="px-4 py-2 bg-red-100 text-red-700 rounded-lg hover:bg-red-200 flex items-center justify-center"
                    >
                      <Trash2 className="w-4 h-4" />
                    </button>
                  </div>
                </>
              )}
            </div>
          ))}
        </div>
      )}

      {!loading && classes.length === 0 && (
        <div className="text-center py-12 bg-white rounded-lg shadow">
          <Calendar className="w-12 h-12 text-gray-400 mx-auto mb-3" />
          <p className="text-gray-500">No tracked classes yet</p>
          <p className="text-sm text-gray-400 mt-1">Browse classes and add them to start tracking</p>
        </div>
      )}

      {previewingId && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-lg shadow-xl max-w-4xl w-full max-h-[90vh] overflow-hidden flex flex-col">
            <div className="p-6 border-b">
              <div className="flex items-center justify-between">
                <div>
                  <h3 className="text-xl font-semibold text-gray-900">
                    Matching Classes
                  </h3>
                  <p className="text-sm text-gray-500 mt-1">
                    Upcoming classes that match this tracked pattern (next 30 days)
                  </p>
                </div>
                <button
                  onClick={() => {
                    setPreviewingId(null);
                    setPreviewClasses([]);
                  }}
                  className="text-gray-400 hover:text-gray-600"
                >
                  <X className="w-6 h-6" />
                </button>
              </div>
            </div>

            <div className="flex-1 overflow-y-auto p-6">
              {previewLoading ? (
                <div className="text-center py-12">
                  <RefreshCw className="w-8 h-8 text-primary animate-spin mx-auto" />
                  <p className="mt-2 text-gray-500">Loading matching classes...</p>
                </div>
              ) : previewClasses.length === 0 ? (
                <div className="text-center py-12">
                  <Calendar className="w-12 h-12 text-gray-400 mx-auto mb-3" />
                  <p className="text-gray-500">No matching classes found</p>
                  <p className="text-sm text-gray-400 mt-1">
                    There are no upcoming classes that match this pattern in the next 30 days
                  </p>
                </div>
              ) : (
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  {previewClasses.map((cls) => {
                    const startTime = new Date(cls.startTime);
                    const endTime = cls.endTime ? new Date(cls.endTime) : null;
                    return (
                      <div key={cls.id} className="bg-gray-50 rounded-lg p-4 border border-gray-200">
                        <div className="mb-3">
                          <h4 className="font-semibold text-gray-900">{cls.serviceName}</h4>
                          {cls.trainerName && (
                            <div className="flex items-center text-sm text-gray-600 mt-1">
                              <User className="w-3 h-3 mr-1" />
                              <span>{cls.trainerName}</span>
                            </div>
                          )}
                        </div>

                        <div className="space-y-1 mb-3">
                          <div className="flex items-center text-sm text-gray-600">
                            <MapPin className="w-3 h-3 mr-1" />
                            <span>{cls.locationName}</span>
                          </div>
                          <div className="flex items-center text-sm text-gray-600">
                            <Calendar className="w-3 h-3 mr-1" />
                            <span>{startTime.toLocaleDateString()}</span>
                          </div>
                          <div className="flex items-center text-sm text-gray-600">
                            <Clock className="w-3 h-3 mr-1" />
                            <span>
                              {startTime.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                              {endTime && ` - ${endTime.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}`}
                            </span>
                          </div>
                        </div>

                        <div className="flex items-center justify-between mb-3">
                          {cls.spotsAvailable !== undefined && cls.spotsTotal !== undefined ? (
                            <span className="text-xs text-gray-600">
                              Spots: {cls.spotsAvailable}/{cls.spotsTotal}
                            </span>
                          ) : (
                            <span className="text-xs text-gray-400">
                              Spots: N/A
                            </span>
                          )}
                          {cls.isJoined ? (
                            <span className="px-2 py-0.5 bg-blue-100 text-blue-800 text-xs font-medium rounded">
                              ✓ Enrolled
                            </span>
                          ) : cls.canSignup ? (
                            <span className="px-2 py-0.5 bg-green-100 text-green-800 text-xs font-medium rounded">
                              Available
                            </span>
                          ) : cls.spotsAvailable === 0 ? (
                            <span className="px-2 py-0.5 bg-red-100 text-red-800 text-xs font-medium rounded">
                              Full
                            </span>
                          ) : (
                            <span className="px-2 py-0.5 bg-gray-100 text-gray-600 text-xs font-medium rounded">
                              Not Bookable
                            </span>
                          )}
                        </div>

                        {cls.isJoined ? (
                          <button
                            onClick={() => cancelClass(cls.id, cls.serviceName)}
                            disabled={bookingClass === cls.id}
                            className="w-full px-3 py-2 bg-red-100 text-red-700 rounded-lg hover:bg-red-200 disabled:opacity-50 flex items-center justify-center space-x-2"
                          >
                            {bookingClass === cls.id ? (
                              <>
                                <RefreshCw className="w-4 h-4 animate-spin" />
                                <span>Cancelling...</span>
                              </>
                            ) : (
                              <>
                                <UserX className="w-4 h-4" />
                                <span>Cancel Enrollment</span>
                              </>
                            )}
                          </button>
                        ) : cls.canSignup ? (
                          <button
                            onClick={() => bookClass(cls.id, cls.serviceName)}
                            disabled={bookingClass === cls.id}
                            className="w-full px-3 py-2 bg-primary text-white rounded-lg hover:bg-blue-700 disabled:opacity-50 flex items-center justify-center space-x-2"
                          >
                            {bookingClass === cls.id ? (
                              <>
                                <RefreshCw className="w-4 h-4 animate-spin" />
                                <span>Booking...</span>
                              </>
                            ) : (
                              <>
                                <BookOpen className="w-4 h-4" />
                                <span>Book Now</span>
                              </>
                            )}
                          </button>
                        ) : (
                          <button
                            disabled
                            className="w-full px-3 py-2 bg-gray-200 text-gray-500 rounded-lg cursor-not-allowed flex items-center justify-center space-x-2"
                          >
                            <BookOpen className="w-4 h-4" />
                            <span>Not Available</span>
                          </button>
                        )}
                      </div>
                    );
                  })}
                </div>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

export default TrackedClasses;
