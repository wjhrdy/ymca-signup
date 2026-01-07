import React, { useState, useEffect, useMemo } from 'react';
import api from '../api';
import { Calendar, Clock, MapPin, User, Plus, RefreshCw, Search, CheckCircle, UserX, ExternalLink } from 'lucide-react';
import Fuse from 'fuse.js';
import TrackClassModal from './TrackClassModal';
import toast from 'react-hot-toast';
import { useConfirm } from './ConfirmDialog';

function ClassBrowser({ authenticated, onNavigateToTracked }) {
  const { confirm } = useConfirm();
  const [classes, setClasses] = useState([]);
  const [loading, setLoading] = useState(false);
  const [loadingMore, setLoadingMore] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const [trackingClass, setTrackingClass] = useState(null);
  const [cancellingClass, setCancellingClass] = useState(null);
  const [isSearchMode, setIsSearchMode] = useState(false);
  const [hasMore, setHasMore] = useState(true);
  const [offset, setOffset] = useState(0);
  const [filters, setFilters] = useState({
    startDate: new Date().toISOString().split('T')[0],
    endDate: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString().split('T')[0]
  });

  useEffect(() => {
    if (authenticated) {
      fetchClasses();
    }
  }, [authenticated]);
  
  useEffect(() => {
    const handleScroll = () => {
      if (isSearchMode || loadingMore || !hasMore) return;
      
      const scrollTop = window.scrollY;
      const windowHeight = window.innerHeight;
      const documentHeight = document.documentElement.scrollHeight;
      
      // Load more when user is 300px from bottom
      if (scrollTop + windowHeight >= documentHeight - 300) {
        loadMoreClasses();
      }
    };
    
    window.addEventListener('scroll', handleScroll);
    return () => window.removeEventListener('scroll', handleScroll);
  }, [classes, loadingMore, hasMore, isSearchMode]);

  const fetchClasses = async (forSearch = false, reset = true) => {
    setLoading(true);
    if (reset) {
      setOffset(0);
      setHasMore(true);
    }
    
    try {
      const params = { ...filters };
      
      // OPTIMIZATION: Load limited classes initially for fast page load
      // When searching, fetch full month for comprehensive search
      if (forSearch) {
        // Expand to 30 days for search
        const searchEndDate = new Date();
        searchEndDate.setDate(searchEndDate.getDate() + 30);
        params.endDate = searchEndDate.toISOString().split('T')[0];
        // No limit - fetch all classes in the month
        console.log('🔍 Search mode: Fetching full month of classes (30 days)');
      } else if (!isSearchMode) {
        // Initial load - limit to 50 classes for speed
        params.limit = 50;
        console.log('⚡ Initial load: Fetching first 50 classes');
      }
      
      const response = await api.get('/api/classes', { params });
      setClasses(response.data);
      
      if (forSearch) {
        setIsSearchMode(true);
        console.log(`✅ Loaded ${response.data.length} classes for comprehensive search`);
      } else {
        setOffset(50);
        setHasMore(response.data.length > 0);
        console.log(`📊 Initial load: ${response.data.length} classes, hasMore: true`);
      }
    } catch (error) {
      console.error('Failed to fetch classes:', error);
      toast.error('Failed to fetch classes: ' + (error.response?.data?.error || error.message));
    } finally {
      setLoading(false);
    }
  };
  
  const loadMoreClasses = async () => {
    if (loadingMore || !hasMore || isSearchMode) return;
    
    setLoadingMore(true);
    try {
      const params = { ...filters, limit: 50, offset };
      console.log(`📄 Loading more classes (offset: ${offset})`);
      
      const response = await api.get('/api/classes', { params });
      
      if (response.data.length > 0) {
        setClasses(prev => [...prev, ...response.data]);
        setOffset(prev => prev + 50);  // Always increment by page size, not response length
        // Keep loading - server filtering (readonly removal) can reduce count below 50
        // Only stop when we get 0 results
        setHasMore(true);
        console.log(`✅ Loaded ${response.data.length} more classes (offset now ${offset + 50}), will try next batch`);
      } else {
        setHasMore(false);
        console.log('🏁 No more classes to load (got 0 results)');
      }
    } catch (error) {
      console.error('Failed to load more classes:', error);
    } finally {
      setLoadingMore(false);
    }
  };

  const handleTrackSuccess = () => {
    fetchClasses();
  };

  const signupNow = async (classId) => {
    const confirmed = await confirm('Sign up for this class now?', {
      title: 'Confirm Signup',
      confirmText: 'Sign Up'
    });
    if (!confirmed) return;

    try {
      const classData = classes.find(c => c.id === classId);
      const payload = classData?.lock_version !== undefined 
        ? { lock_version: classData.lock_version }
        : {};
      
      await api.post(`/api/signup/${classId}`, payload);
      toast.success('Successfully signed up for class!');
      fetchClasses();
    } catch (error) {
      console.error('Signup failed:', error);
      toast.error('Signup failed: ' + (error.response?.data?.error || error.message));
    }
  };

  const cancelClass = async (classId, serviceName) => {
    const confirmed = await confirm(`Cancel your enrollment in ${serviceName}?`, {
      title: 'Cancel Enrollment',
      confirmText: 'Cancel Enrollment'
    });
    if (!confirmed) return;

    setCancellingClass(classId);
    try {
      await api.delete(`/api/bookings/${classId}`);
      toast.success('Successfully cancelled class!');
      fetchClasses();
    } catch (error) {
      console.error('Cancel failed:', error);
      toast.error('Cancel failed: ' + (error.response?.data?.error || error.message));
    } finally {
      setCancellingClass(null);
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
    let results = classes;

    if (searchQuery.trim()) {
      const structuredQuery = parseStructuredQuery(searchQuery);

      if (structuredQuery) {
        results = [...classes];

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
      } else {
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

        const fuseResults = fuse.search(searchQuery);
        results = fuseResults.map(result => result.item);
      }
    }

    // No client-side sorting - API handles all sorting by occurs_at, location, service_name
    return results;
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
          <label className="block text-sm font-medium text-gray-700 mb-1">
            Search Classes
            {isSearchMode && (
              <span className="ml-2 text-xs text-gray-500">(searching 30 days)</span>
            )}
          </label>
          <div className="relative">
            <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 w-5 h-5 text-gray-400" />
            <input
              type="text"
              value={searchQuery}
              onChange={(e) => {
                const query = e.target.value;
                setSearchQuery(query);
                
                // When user starts typing, fetch full month if not already in search mode
                if (query.trim() && !isSearchMode) {
                  fetchClasses(true);
                }
                // When user clears search, reset to normal mode on next refresh
                if (!query.trim() && isSearchMode) {
                  setIsSearchMode(false);
                }
              }}
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
            <div key={classItem.id} className={`bg-white rounded-lg shadow hover:shadow-lg transition-shadow p-6 ${classItem.isJoined ? 'border-2 border-green-300' : ''}`}>
              <div className="mb-4">
                <div className="flex items-start justify-between mb-1">
                  <h3 className="text-lg font-semibold text-gray-900">{classItem.serviceName}</h3>
                  {classItem.isJoined && (
                    <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium bg-green-100 text-green-800">
                      <CheckCircle className="w-3 h-3 mr-1" />
                      Enrolled
                    </span>
                  )}
                </div>
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
                {!classItem.isJoined && classItem.canSignup && (
                  <span className="px-2 py-1 bg-green-100 text-green-800 text-xs font-medium rounded">
                    Available
                  </span>
                )}
              </div>

              <div className="flex space-x-2">
                {classItem.isTracked ? (
                  <button
                    onClick={onNavigateToTracked}
                    className="flex-1 px-4 py-2 bg-blue-100 text-blue-700 rounded-lg hover:bg-blue-200 flex items-center justify-center space-x-2"
                  >
                    <ExternalLink className="w-4 h-4" />
                    <span>View in Tracked</span>
                  </button>
                ) : (
                  <button
                    onClick={() => setTrackingClass(classItem)}
                    className="flex-1 px-4 py-2 bg-gray-100 text-gray-700 rounded-lg hover:bg-gray-200 flex items-center justify-center space-x-2"
                  >
                    <Plus className="w-4 h-4" />
                    <span>Track</span>
                  </button>
                )}
                {classItem.isJoined ? (
                  <button
                    onClick={() => cancelClass(classItem.id, classItem.serviceName)}
                    disabled={cancellingClass === classItem.id}
                    className="flex-1 px-4 py-2 bg-red-100 text-red-700 rounded-lg hover:bg-red-200 disabled:opacity-50 flex items-center justify-center space-x-2"
                  >
                    {cancellingClass === classItem.id ? (
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
                ) : classItem.canSignup ? (
                  <button
                    onClick={() => signupNow(classItem.id)}
                    className="flex-1 px-4 py-2 bg-primary text-white rounded-lg hover:bg-blue-700 flex items-center justify-center"
                  >
                    <span>Sign Up Now</span>
                  </button>
                ) : null}
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
      
      {loadingMore && (
        <div className="text-center py-8">
          <RefreshCw className="w-6 h-6 text-primary animate-spin mx-auto" />
          <p className="mt-2 text-sm text-gray-500">Loading more classes...</p>
        </div>
      )}
      
      {!loading && !loadingMore && !hasMore && classes.length > 0 && !isSearchMode && (
        <div className="text-center py-8 bg-white rounded-lg shadow">
          <p className="text-gray-500">No more classes to load</p>
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
