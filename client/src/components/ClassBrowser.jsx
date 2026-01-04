import React, { useState, useEffect, useMemo } from 'react';
import api from '../api';
import { Calendar, Clock, MapPin, User, Plus, RefreshCw, Search } from 'lucide-react';
import Fuse from 'fuse.js';
import TrackClassModal from './TrackClassModal';

function ClassBrowser({ authenticated }) {
  const [classes, setClasses] = useState([]);
  const [loading, setLoading] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const [trackingClass, setTrackingClass] = useState(null);
  const [filters, setFilters] = useState({
    startDate: new Date().toISOString().split('T')[0],
    endDate: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString().split('T')[0]
  });

  useEffect(() => {
    if (authenticated) {
      fetchClasses();
    }
  }, [authenticated]);

  const fetchClasses = async () => {
    setLoading(true);
    try {
      const response = await api.get('/api/classes', { params: filters });
      setClasses(response.data);
    } catch (error) {
      console.error('Failed to fetch classes:', error);
      alert('Failed to fetch classes: ' + (error.response?.data?.error || error.message));
    } finally {
      setLoading(false);
    }
  };

  const handleTrackSuccess = () => {
    fetchClasses();
  };

  const signupNow = async (classId) => {
    if (!confirm('Sign up for this class now?')) return;

    try {
      // Find the class to get its lock_version
      const classData = classes.find(c => c.id === classId);
      const payload = classData?.lock_version !== undefined 
        ? { lock_version: classData.lock_version }
        : {};
      
      await api.post(`/api/signup/${classId}`, payload);
      alert('Successfully signed up for class!');
      fetchClasses(); // Refresh the list
    } catch (error) {
      console.error('Signup failed:', error);
      alert('Signup failed: ' + (error.response?.data?.error || error.message));
    }
  };

  const parseStructuredQuery = (query) => {
    const trimmedQuery = query.trim();
    
    const startsWithAt = /^at\s+(.+)/i.test(trimmedQuery);
    const startsWithWith = /^with\s+(.+)/i.test(trimmedQuery);
    
    if (startsWithAt) {
      const atMatch = trimmedQuery.match(/^at\s+(.+?)(?:\s+with\s+(.+))?$/i);
      if (atMatch) {
        return {
          className: null,
          location: atMatch[1].trim(),
          instructor: atMatch[2] ? atMatch[2].trim() : null
        };
      }
    }
    
    if (startsWithWith) {
      const withMatch = trimmedQuery.match(/^with\s+(.+)$/i);
      if (withMatch) {
        return {
          className: null,
          location: null,
          instructor: withMatch[1].trim()
        };
      }
    }
    
    const atWithMatch = trimmedQuery.match(/(.+?)\s+at\s+(.+?)\s+with\s+(.+)/i);
    if (atWithMatch) {
      return {
        className: atWithMatch[1].trim(),
        location: atWithMatch[2].trim(),
        instructor: atWithMatch[3].trim()
      };
    }
    
    const atMatch = trimmedQuery.match(/(.+?)\s+at\s+(.+)/i);
    if (atMatch) {
      const beforeAt = atMatch[1].trim();
      const afterAt = atMatch[2].trim();
      
      const afterAtWithMatch = afterAt.match(/(.+?)\s+with\s+(.+)/i);
      if (afterAtWithMatch) {
        return {
          className: beforeAt,
          location: afterAtWithMatch[1].trim(),
          instructor: afterAtWithMatch[2].trim()
        };
      }
      
      return {
        className: beforeAt,
        location: afterAt,
        instructor: null
      };
    }
    
    const withMatch = trimmedQuery.match(/(.+?)\s+with\s+(.+)/i);
    if (withMatch) {
      return {
        className: withMatch[1].trim(),
        location: null,
        instructor: withMatch[2].trim()
      };
    }

    return null;
  };

  const filteredClasses = useMemo(() => {
    if (!searchQuery.trim()) {
      return classes;
    }

    const structuredQuery = parseStructuredQuery(searchQuery);

    if (structuredQuery) {
      let results = [...classes];

      if (structuredQuery.className) {
        const classFuse = new Fuse(results, {
          keys: ['serviceName'],
          threshold: 0.4,
          includeScore: true
        });
        const classResults = classFuse.search(structuredQuery.className);
        results = classResults.map(r => r.item);
      }

      if (structuredQuery.location && results.length > 0) {
        const locationFuse = new Fuse(results, {
          keys: ['locationName'],
          threshold: 0.4,
          includeScore: true
        });
        const locationResults = locationFuse.search(structuredQuery.location);
        results = locationResults.map(r => r.item);
      }

      if (structuredQuery.instructor && results.length > 0) {
        const instructorFuse = new Fuse(results, {
          keys: ['trainerName'],
          threshold: 0.4,
          includeScore: true
        });
        const instructorResults = instructorFuse.search(structuredQuery.instructor);
        results = instructorResults.map(r => r.item);
      }

      return results;
    }

    const fuse = new Fuse(classes, {
      keys: [
        { name: 'serviceName', weight: 2 },
        { name: 'locationName', weight: 1.5 },
        { name: 'trainerName', weight: 1 }
      ],
      threshold: 0.4,
      includeScore: true,
      ignoreLocation: true
    });

    const results = fuse.search(searchQuery);
    return results.map(result => result.item);
  }, [classes, searchQuery]);

  if (!authenticated) {
    return (
      <div className="text-center py-12">
        <p className="text-gray-500">Please login to browse classes</p>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="bg-white rounded-lg shadow p-6">
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-lg font-semibold text-gray-900">Available Classes</h2>
          <button
            onClick={fetchClasses}
            disabled={loading}
            className="px-4 py-2 bg-primary text-white rounded-lg hover:bg-blue-700 disabled:opacity-50 flex items-center space-x-2"
          >
            <RefreshCw className={`w-4 h-4 ${loading ? 'animate-spin' : ''}`} />
            <span>Refresh</span>
          </button>
        </div>

        <div className="mb-4">
          <label className="block text-sm font-medium text-gray-700 mb-1">Search Classes</label>
          <div className="relative">
            <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 w-5 h-5 text-gray-400" />
            <input
              type="text"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder="Try: 'at downtown', 'with sarah', or 'yoga at downtown with sarah'"
              className="w-full pl-10 pr-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-primary focus:border-transparent"
            />
          </div>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mb-4">
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Start Date</label>
            <input
              type="date"
              value={filters.startDate}
              onChange={(e) => setFilters({ ...filters, startDate: e.target.value })}
              className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-primary focus:border-transparent"
            />
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">End Date</label>
            <input
              type="date"
              value={filters.endDate}
              onChange={(e) => setFilters({ ...filters, endDate: e.target.value })}
              className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-primary focus:border-transparent"
            />
          </div>
        </div>
      </div>

      {loading ? (
        <div className="text-center py-12">
          <RefreshCw className="w-8 h-8 text-primary animate-spin mx-auto" />
          <p className="mt-2 text-gray-500">Loading classes...</p>
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          {filteredClasses.map((classItem) => (
            <div key={classItem.id} className="bg-white rounded-lg shadow hover:shadow-lg transition-shadow p-6">
              <div className="mb-4">
                <h3 className="text-lg font-semibold text-gray-900 mb-1">{classItem.serviceName}</h3>
                <div className="flex items-center text-sm text-gray-600 space-x-4">
                  {classItem.trainerName && (
                    <div className="flex items-center space-x-1">
                      <User className="w-4 h-4" />
                      <span>{classItem.trainerName}</span>
                    </div>
                  )}
                </div>
              </div>

              <div className="space-y-2 mb-4">
                <div className="flex items-center text-sm text-gray-600">
                  <MapPin className="w-4 h-4 mr-2" />
                  <span>{classItem.locationName}</span>
                </div>
                <div className="flex items-center text-sm text-gray-600">
                  <Calendar className="w-4 h-4 mr-2" />
                  <span>{new Date(classItem.startTime).toLocaleDateString()}</span>
                </div>
                <div className="flex items-center text-sm text-gray-600">
                  <Clock className="w-4 h-4 mr-2" />
                  <span>
                    {new Date(classItem.startTime).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                    {' - '}
                    {new Date(classItem.endTime).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                  </span>
                </div>
              </div>

              <div className="flex items-center justify-between mb-4">
                <span className="text-sm text-gray-600">
                  Spots: {classItem.spotsAvailable}/{classItem.spotsTotal}
                </span>
                {classItem.canSignup && (
                  <span className="px-2 py-1 bg-green-100 text-green-800 text-xs font-medium rounded">
                    Available
                  </span>
                )}
              </div>

              <div className="flex space-x-2">
                <button
                  onClick={() => setTrackingClass(classItem)}
                  className="flex-1 px-4 py-2 bg-gray-100 text-gray-700 rounded-lg hover:bg-gray-200 flex items-center justify-center space-x-2"
                >
                  <Plus className="w-4 h-4" />
                  <span>Track</span>
                </button>
                {classItem.canSignup && (
                  <button
                    onClick={() => signupNow(classItem.id)}
                    className="flex-1 px-4 py-2 bg-primary text-white rounded-lg hover:bg-blue-700 flex items-center justify-center"
                  >
                    <span>Sign Up Now</span>
                  </button>
                )}
              </div>
            </div>
          ))}
        </div>
      )}

      {!loading && classes.length === 0 && (
        <div className="text-center py-12 bg-white rounded-lg shadow">
          <p className="text-gray-500">No classes found. Try adjusting your filters.</p>
        </div>
      )}

      {!loading && classes.length > 0 && filteredClasses.length === 0 && (
        <div className="text-center py-12 bg-white rounded-lg shadow">
          <p className="text-gray-500">No classes match your search. Try a different search term.</p>
        </div>
      )}

      {trackingClass && (
        <TrackClassModal
          classItem={trackingClass}
          onClose={() => setTrackingClass(null)}
          onSuccess={handleTrackSuccess}
        />
      )}
    </div>
  );
}

export default ClassBrowser;
