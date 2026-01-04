const axios = require('axios');
const config = require('../config');
const db = require('../database');

const API_BASE_URL = process.env.API_BASE_URL || 'https://ymca-triangle.fisikal.com/api/web';
const YMCA_URL = process.env.YMCA_URL || 'https://ymca-triangle.fisikal.com';

let cachedClientId = null;
let cachedCsrfToken = null;

async function getCSRFToken(sessionCookie) {
  if (cachedCsrfToken) {
    return cachedCsrfToken;
  }
  
  try {
    const response = await axios.get(YMCA_URL, {
      headers: {
        'Cookie': sessionCookie,
        'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36'
      }
    });
    
    const csrfMatch = response.data.match(/<meta name="csrf-token" content="([^"]+)"/);
    if (csrfMatch) {
      cachedCsrfToken = csrfMatch[1];
      return cachedCsrfToken;
    }
    return null;
  } catch (error) {
    console.warn('Could not fetch CSRF token:', error.message);
    return null;
  }
}

async function getUserClientId(sessionCookie) {
  if (cachedClientId) {
    return cachedClientId;
  }
  
  // Get from database (auto-populated during login)
  try {
    const dbClientId = await db.getClientId();
    if (dbClientId) {
      cachedClientId = dbClientId;
      console.log(`Using auto-detected client_id: ${cachedClientId}`);
      return cachedClientId;
    }
  } catch (error) {
    console.warn('Could not read client_id from database:', error.message);
  }
  
  console.warn('⚠️  No client_id found');
  console.warn('   Client ID is auto-detected during login');
  console.warn('   Enrollment detection will be inaccurate without it');
  
  return null;
}

async function enrichClassesWithBookingStatus(sessionCookie, classes, clientId) {
  if (!classes || classes.length === 0) {
    return classes;
  }

  if (!clientId) {
    console.log('No client ID available, using is_joined flags from occurrences API');
    const now = new Date();
    
    classes.forEach(cls => {
      const classStartTime = new Date(cls.startTime);
      const restrictHours = cls.restrictToBookInAdvanceHours || 0;
      const bookingWindowOpen = restrictHours === 0 || 
        (classStartTime.getTime() - now.getTime()) <= (restrictHours * 60 * 60 * 1000);
      
      cls.canSignup = !cls.isJoined && 
                     !cls.fullGroup && 
                     bookingWindowOpen &&
                     now < classStartTime &&
                     (cls.status === 'Scheduled' || cls.status === 'Rescheduled');
    });
    
    const joinedCount = classes.filter(c => c.isJoined).length;
    console.log(`Classes with isJoined=true: ${joinedCount} out of ${classes.length}`);
    
    return classes;
  }

  // Fetch user's enrolled classes using client_id filter
  try {
    console.log(`Fetching enrolled classes for client_id: ${clientId}...`);
    
    const now = new Date();
    const endDate = new Date();
    endDate.setDate(endDate.getDate() + 30);
    
    const filterObj = {
      filter: [
        { by: 'status', with: ['Rescheduled', 'Scheduled', 'Reminded', 'Completed', 'Requested', 'Counted', 'Verified'] },
        { by: 'since', with: now.toISOString() },
        { by: 'till', with: endDate.toISOString() },
        { by: 'client_id', with: [clientId] }
      ]
    };
    
    const jsonParam = encodeURIComponent(JSON.stringify(filterObj));
    const url = `${API_BASE_URL}/schedule/occurrences?all_service_categories=true&json=${jsonParam}`;
    
    const response = await axios.get(url, {
      headers: {
        'Cookie': sessionCookie,
        'Accept': '*/*',
        'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
        'X-Requested-With': 'XMLHttpRequest'
      }
    });
    
    const enrolledClasses = response.data?.data || [];
    const enrolledOccurrenceIds = new Set(enrolledClasses.map(c => c.id));
    
    console.log(`Found ${enrolledClasses.length} enrolled classes. IDs:`, Array.from(enrolledOccurrenceIds).slice(0, 10));
    
    classes.forEach(cls => {
      const actuallyEnrolled = enrolledOccurrenceIds.has(cls.id);
      
      if (actuallyEnrolled !== cls.isJoined) {
        console.log(`✓ Corrected enrollment for class ${cls.id} (${cls.serviceName}): was ${cls.isJoined}, now ${actuallyEnrolled}`);
      }
      
      cls.isJoined = actuallyEnrolled;
      
      const classStartTime = new Date(cls.startTime);
      const restrictHours = cls.restrictToBookInAdvanceHours || 0;
      const bookingWindowOpen = restrictHours === 0 || 
        (classStartTime.getTime() - now.getTime()) <= (restrictHours * 60 * 60 * 1000);
      
      cls.canSignup = !cls.isJoined && 
                     !cls.fullGroup && 
                     bookingWindowOpen &&
                     now < classStartTime &&
                     (cls.status === 'Scheduled' || cls.status === 'Rescheduled');
    });
    
    const joinedCount = classes.filter(c => c.isJoined).length;
    console.log(`Enrollment verification complete. Classes with isJoined=true: ${joinedCount} out of ${classes.length}`);
    
    return classes;
  } catch (error) {
    console.error('Failed to fetch enrolled classes:', error.message);
    console.warn('Falling back to is_joined flags from initial query');
    return classes;
  }
}

async function fetchClasses(sessionCookie, filters = {}) {
  try {
    const appConfig = config.getConfig();
    const today = new Date();
    const nextWeek = new Date();
    nextWeek.setDate(nextWeek.getDate() + 7);
    
    const filterObj = {
      filter: [
        { by: 'status', with: ['Rescheduled', 'Scheduled', 'Reminded', 'Completed', 'Requested', 'Counted', 'Verified'] },
        { by: 'since', with: filters.startDate || today.toISOString() },
        { by: 'till', with: filters.endDate || nextWeek.toISOString() }
      ]
    };
    
    console.log('Config loaded:', JSON.stringify(appConfig, null, 2));
    console.log('Filters provided:', JSON.stringify(filters, null, 2));
    
    if (filters.locationId) {
      console.log(`Using explicit locationId filter: ${filters.locationId}`);
      filterObj.filter.push({ by: 'location_id', with: [filters.locationId] });
    } else if (appConfig.preferredLocations && appConfig.preferredLocations.length > 0) {
      console.log(`Applying preferred locations from config: ${appConfig.preferredLocations.join(', ')}`);
      filterObj.filter.push({ by: 'location_id', with: appConfig.preferredLocations });
    } else {
      console.log('No location filter applied - fetching from ALL locations');
    }

    const jsonParam = encodeURIComponent(JSON.stringify(filterObj));
    const url = `${API_BASE_URL}/schedule/occurrences?all_service_categories=true&json=${jsonParam}`;
    const headers = {
      'Cookie': sessionCookie,
      'Accept': '*/*',
      'Accept-Language': 'en-US,en;q=0.9',
      'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
      'X-Requested-With': 'XMLHttpRequest'
    };
    
    console.log('Fetching classes...');
    console.log('URL:', url);
    console.log('Cookie:', sessionCookie.substring(0, 50) + '...');

    const response = await axios.get(url, { headers });

    console.log('Response status:', response.status);
    console.log('Response data keys:', Object.keys(response.data || {}));
    
    const occurrences = response.data?.data || response.data?.occurrences || [];
    console.log('Occurrences count:', occurrences.length);

    if (occurrences.length > 0) {
      console.log('Sample occurrence data:', JSON.stringify(occurrences[0], null, 2));
      
      const classes = occurrences.map((occurrence, index) => {
        try {
          const startTime = occurrence.occurs_at || occurrence.start_time;
          const duration = occurrence.duration_in_minutes || occurrence.duration || 0;
          
          let endTime = null;
          if (startTime && duration) {
            const startDate = new Date(startTime);
            const endDate = new Date(startDate.getTime() + duration * 60000);
            endTime = endDate.toISOString();
          }
          
          const now = new Date();
          const classStartTime = new Date(startTime);
          const restrictHours = occurrence.restrict_to_book_in_advance_time_in_hours || 0;
          const bookingWindowOpen = restrictHours === 0 || 
            (classStartTime.getTime() - now.getTime()) <= (restrictHours * 60 * 60 * 1000);
          
          const canSignup = !occurrence.is_joined && 
                           !occurrence.full_group && 
                           bookingWindowOpen &&
                           now < classStartTime &&
                           (occurrence.status === 'Scheduled' || occurrence.status === 'Rescheduled');
          
          const spotsTotal = occurrence.service_group_size || 0;
          const attendedCount = occurrence.attended_clients_count || 0;
          const spotsAvailable = Math.max(0, spotsTotal - attendedCount);
          
          return {
            id: occurrence.id,
            serviceId: occurrence.service_id || occurrence.service?.id,
            serviceName: occurrence.service_title || occurrence.service?.name,
            trainerId: occurrence.trainer_id || occurrence.trainer?.id,
            trainerName: occurrence.trainer_name || occurrence.trainer?.name,
            locationId: occurrence.location_id || occurrence.location?.id,
            locationName: occurrence.location_name || occurrence.location?.name,
            startTime,
            endTime,
            duration,
            spotsAvailable,
            spotsTotal,
            status: occurrence.status,
            isJoined: occurrence.is_joined,
            fullGroup: occurrence.full_group,
            canSignup,
            restrictToBookInAdvanceHours: occurrence.restrict_to_book_in_advance_time_in_hours
          };
        } catch (error) {
          console.error(`Error processing occurrence at index ${index}:`, error.message);
          console.error('Occurrence data:', JSON.stringify(occurrence, null, 2));
          return null;
        }
      }).filter(c => c !== null);
      
      const verifyBookings = filters.verifyBookings !== false;
      if (verifyBookings) {
        const clientId = await getUserClientId(sessionCookie);
        return await enrichClassesWithBookingStatus(sessionCookie, classes, clientId);
      }
      
      return classes;
    }

    console.log('No occurrences found in response, returning empty array');
    return [];
  } catch (error) {
    console.error('Error fetching classes:', error.response?.data || error.message);
    console.error('Error details:', {
      status: error.response?.status,
      statusText: error.response?.statusText,
      headers: error.response?.headers
    });
    throw error;
  }
}

async function getOccurrenceDetails(sessionCookie, occurrenceId) {
  try {
    const response = await axios.get(
      `${API_BASE_URL}/schedule/occurrences/${occurrenceId}`,
      {
        headers: {
          'Cookie': sessionCookie,
          'Accept': '*/*',
          'Accept-Language': 'en-US,en;q=0.9',
          'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
          'X-Requested-With': 'XMLHttpRequest'
        }
      }
    );
    return response.data;
  } catch (error) {
    console.error('Error fetching occurrence details:', error.response?.data || error.message);
    return null;
  }
}

async function signupForClass(sessionCookie, occurrenceId, lockVersion = null, tryWaitlist = true) {
  try {
    const csrfToken = await getCSRFToken(sessionCookie);
    
    if (!csrfToken) {
      console.warn('No CSRF token available, attempting without it...');
    }
    
    // Try to get lock_version if not provided, but don't fail if we can't get it
    if (!lockVersion) {
      try {
        const details = await getOccurrenceDetails(sessionCookie, occurrenceId);
        if (details?.occurrence?.lock_version) {
          lockVersion = details.occurrence.lock_version;
          console.log(`Fetched lock_version: ${lockVersion}`);
        } else {
          console.log('⚠️  lock_version not available from API, attempting signup anyway...');
        }
      } catch (error) {
        console.log(`⚠️  Could not fetch occurrence details (${error.message}), attempting signup without lock_version...`);
      }
    }
    
    const payload = lockVersion ? { lock_version: lockVersion } : {};
    const formData = new URLSearchParams();
    formData.append('json', JSON.stringify(payload));

    const response = await axios.post(
      `${API_BASE_URL}/schedule/occurrences/${occurrenceId}/join`,
      formData.toString(),
      {
        headers: {
          'Cookie': sessionCookie,
          'Accept': '*/*',
          'Accept-Language': 'en-US,en;q=0.9',
          'Content-Type': 'application/x-www-form-urlencoded; charset=UTF-8',
          'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
          'X-Requested-With': 'XMLHttpRequest',
          'Origin': YMCA_URL,
          'Referer': YMCA_URL + '/',
          ...(csrfToken ? { 'X-CSRF-Token': csrfToken } : {})
        }
      }
    );

    return response.data;
  } catch (error) {
    if (tryWaitlist && error.response?.status === 422) {
      console.log('Class full, trying waitlist...');
      return await joinWaitlist(sessionCookie, occurrenceId);
    }
    throw error;
  }
}

async function joinWaitlist(sessionCookie, occurrenceId) {
  try {
    const csrfToken = await getCSRFToken(sessionCookie);
    
    if (!csrfToken) {
      console.warn('No CSRF token available, attempting without it...');
    }
    
    const formData = new URLSearchParams();
    formData.append('json', JSON.stringify({}));

    const response = await axios.post(
      `${API_BASE_URL}/schedule/occurrences/${occurrenceId}/wait`,
      formData.toString(),
      {
        headers: {
          'Cookie': sessionCookie,
          'Accept': '*/*',
          'Accept-Language': 'en-US,en;q=0.9',
          'Content-Type': 'application/x-www-form-urlencoded; charset=UTF-8',
          'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
          'X-Requested-With': 'XMLHttpRequest',
          'Origin': YMCA_URL,
          'Referer': YMCA_URL + '/',
          ...(csrfToken ? { 'X-CSRF-Token': csrfToken } : {})
        }
      }
    );

    console.log('Successfully joined waitlist');
    return { ...response.data, waitlisted: true };
  } catch (error) {
    console.error('Failed to join waitlist:', error.response?.data || error.message);
    throw error;
  }
}

async function getMyBookings(sessionCookie, filters = {}) {
  try {
    // The bookings endpoint requires a status filter to work properly
    const filterObj = {
      filter: [
        {
          by: 'status',
          with: ['Rescheduled', 'Scheduled', 'Reminded', 'Completed', 'Requested', 'Counted', 'Verified']
        }
      ]
    };
    
    if (filters.startDate) {
      filterObj.filter.push({ by: 'since', with: filters.startDate });
    }
    
    if (filters.endDate) {
      filterObj.filter.push({ by: 'till', with: filters.endDate });
    }
    
    if (filters.locationId) {
      filterObj.filter.push({ by: 'location_id', with: [filters.locationId] });
    }

    const jsonParam = encodeURIComponent(JSON.stringify(filterObj));
    const url = `${API_BASE_URL}/schedule/occurrences/bookings?json=${jsonParam}`;
    
    const response = await axios.get(url, {
      headers: {
        'Cookie': sessionCookie,
        'Accept': '*/*',
        'Accept-Language': 'en-US,en;q=0.9',
        'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
        'X-Requested-With': 'XMLHttpRequest'
      }
    });

    return response.data;
  } catch (error) {
    console.error('Error fetching bookings:', error.response?.data || error.message);
    throw error;
  }
}

async function cancelBooking(sessionCookie, occurrenceId) {
  try {
    console.log(`Attempting to cancel occurrence ${occurrenceId}...`);
    console.log(`Session cookie: ${sessionCookie.substring(0, 50)}...`);
    
    const csrfToken = await getCSRFToken(sessionCookie);
    console.log(`CSRF token obtained: ${csrfToken ? csrfToken.substring(0, 20) + '...' : 'NONE'}`);
    
    if (!csrfToken) {
      throw new Error('Failed to obtain CSRF token. Session may be invalid.');
    }
    
    const formData = new URLSearchParams();
    formData.append('json', JSON.stringify({}));

    console.log(`Making DELETE request to: ${API_BASE_URL}/schedule/occurrences/${occurrenceId}/cancel`);
    
    const response = await axios.delete(
      `${API_BASE_URL}/schedule/occurrences/${occurrenceId}/cancel`,
      {
        headers: {
          'Cookie': sessionCookie,
          'Accept': '*/*',
          'Accept-Language': 'en-US,en;q=0.9',
          'Content-Type': 'application/x-www-form-urlencoded; charset=UTF-8',
          'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
          'X-Requested-With': 'XMLHttpRequest',
          'Referer': YMCA_URL + '/',
          'Origin': YMCA_URL,
          ...(csrfToken ? { 'X-CSRF-Token': csrfToken } : {})
        },
        data: formData.toString()
      }
    );

    console.log('✓ Successfully cancelled booking');
    return response.data;
  } catch (error) {
    const errorData = error.response?.data;
    const status = error.response?.status;
    
    let errorMessage = 'Failed to cancel booking';
    
    if (status === 400 && errorData?.exception) {
      errorMessage = `Cannot cancel this class. The YMCA API returned: ${errorData.exception}. This may mean you're not enrolled, the class has started, or the cancellation deadline has passed.`;
    } else if (status === 404) {
      errorMessage = 'Class not found or you are not enrolled in this class.';
    } else if (status === 422) {
      errorMessage = 'Cannot cancel this class. You may not have permission or the class cannot be cancelled at this time.';
    } else if (errorData) {
      errorMessage = `Failed to cancel booking: ${JSON.stringify(errorData)}`;
    } else {
      errorMessage = `Failed to cancel booking: ${error.message}`;
    }
    
    console.error(errorMessage);
    const err = new Error(errorMessage);
    err.status = status;
    err.originalError = errorData;
    throw err;
  }
}

async function getLocations(sessionCookie) {
  try {
    const filterObj = {
      filter: [
        { by: 'parent_id', with: null },
        { by: 'hidden', with: false }
      ],
      limit: { start: 0, count: 50 }
    };

    const jsonParam = encodeURIComponent(JSON.stringify(filterObj));
    const url = `${API_BASE_URL}/locations/lookup?json=${jsonParam}`;
    
    const response = await axios.get(url, {
      headers: {
        'Cookie': sessionCookie,
        'Accept': '*/*',
        'Accept-Language': 'en-US,en;q=0.9',
        'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
        'X-Requested-With': 'XMLHttpRequest'
      }
    });

    return response.data;
  } catch (error) {
    console.error('Error fetching locations:', error.response?.data || error.message);
    throw error;
  }
}

async function getServices(sessionCookie) {
  try {
    const filterObj = {
      filter: [
        { by: 'disabled', with: false }
      ],
      limit: { start: 0, count: 100 }
    };

    const jsonParam = encodeURIComponent(JSON.stringify(filterObj));
    const url = `${API_BASE_URL}/services/services/lookup?json=${jsonParam}`;
    
    const response = await axios.get(url, {
      headers: {
        'Cookie': sessionCookie,
        'Accept': '*/*',
        'Accept-Language': 'en-US,en;q=0.9',
        'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
        'X-Requested-With': 'XMLHttpRequest'
      }
    });

    return response.data;
  } catch (error) {
    console.error('Error fetching services:', error.response?.data || error.message);
    throw error;
  }
}

/**
 * Create a class profile for auto-booking
 * @param {Object} occurrence - The class occurrence object
 * @param {Object} options - Optional matching criteria
 * @param {boolean} options.matchTrainer - Whether to match specific trainer (default: false)
 * @param {boolean} options.matchExactTime - Whether to match exact time or allow tolerance (default: false)
 * @param {number} options.timeToleranceMinutes - Minutes of tolerance for time matching (default: 15)
 * @param {boolean} options.matchSubLocation - Whether to match specific room/studio (default: false)
 */
function createClassProfile(occurrence, options = {}) {
  const {
    matchTrainer = false,
    matchExactTime = false,
    timeToleranceMinutes = 15,
    matchSubLocation = false
  } = options;

  const occursAt = new Date(occurrence.occurs_at);
  const dayOfWeek = occursAt.getUTCDay();
  const timeString = occursAt.toISOString().substring(11, 19);

  const profile = {
    serviceId: occurrence.service_id,
    serviceTitle: occurrence.service_title,
    locationId: occurrence.location_id,
    locationName: occurrence.location_name,
    dayOfWeek,
    time: timeString,
    durationMinutes: occurrence.duration_in_minutes,
    
    // Optional matching criteria
    matchTrainer,
    trainerId: matchTrainer ? occurrence.trainer_id : null,
    trainerName: matchTrainer ? occurrence.trainer_name : null,
    
    matchExactTime,
    timeToleranceMinutes: matchExactTime ? 0 : timeToleranceMinutes,
    
    matchSubLocation,
    subLocationName: matchSubLocation ? occurrence.sub_location_name : null
  };

  return profile;
}

/**
 * Check if an occurrence matches a class profile
 * @param {Object} occurrence - The class occurrence to check
 * @param {Object} profile - The class profile to match against
 * @returns {boolean} - True if the occurrence matches the profile
 */
function matchesClassProfile(occurrence, profile) {
  // Must match: service_id, location_id, day of week
  if (occurrence.service_id !== profile.serviceId) {
    return false;
  }
  
  if (occurrence.location_id !== profile.locationId) {
    return false;
  }

  const occursAt = new Date(occurrence.occurs_at);
  const dayOfWeek = occursAt.getUTCDay();
  if (dayOfWeek !== profile.dayOfWeek) {
    return false;
  }

  // Time matching with optional tolerance
  const timeString = occursAt.toISOString().substring(11, 19);
  if (profile.matchExactTime) {
    if (timeString !== profile.time) {
      return false;
    }
  } else if (profile.timeToleranceMinutes > 0) {
    const profileTime = new Date(`1970-01-01T${profile.time}Z`);
    const occurrenceTime = new Date(`1970-01-01T${timeString}Z`);
    const diffMinutes = Math.abs((occurrenceTime - profileTime) / 1000 / 60);
    
    if (diffMinutes > profile.timeToleranceMinutes) {
      return false;
    }
  }

  // Optional: trainer matching
  if (profile.matchTrainer && occurrence.trainer_id !== profile.trainerId) {
    return false;
  }

  // Optional: sub-location (room/studio) matching
  if (profile.matchSubLocation && occurrence.sub_location_name !== profile.subLocationName) {
    return false;
  }

  return true;
}

/**
 * Find matching class occurrences based on a profile
 * @param {Array} occurrences - Array of class occurrences
 * @param {Object} profile - Class profile to match
 * @returns {Array} - Matching occurrences
 */
function findMatchingClasses(occurrences, profile) {
  return occurrences.filter(occurrence => matchesClassProfile(occurrence, profile));
}

/**
 * Auto-book a class based on a profile
 * @param {string} sessionCookie - Session cookie for authentication
 * @param {Object} profile - Class profile to match and book
 * @param {Object} options - Booking options
 * @param {Date} options.startDate - Start date for search window
 * @param {Date} options.endDate - End date for search window
 * @param {boolean} options.tryWaitlist - Whether to join waitlist if class is full
 * @returns {Object} - Booking result
 */
async function autoBookClass(sessionCookie, profile, options = {}) {
  const {
    startDate = new Date(),
    endDate = (() => {
      const date = new Date();
      date.setDate(date.getDate() + 7);
      return date;
    })(),
    tryWaitlist = true
  } = options;

  try {
    // Fetch available classes in the time window
    const filterObj = {
      filter: [
        { by: 'status', with: ['Rescheduled', 'Scheduled', 'Reminded', 'Completed', 'Requested', 'Counted', 'Verified'] },
        { by: 'since', with: startDate.toISOString() },
        { by: 'till', with: endDate.toISOString() },
        { by: 'location_id', with: [profile.locationId] }
      ]
    };

    const jsonParam = encodeURIComponent(JSON.stringify(filterObj));
    const url = `${API_BASE_URL}/schedule/occurrences?all_service_categories=true&json=${jsonParam}`;
    
    const response = await axios.get(url, {
      headers: {
        'Cookie': sessionCookie,
        'Accept': '*/*',
        'Accept-Language': 'en-US,en;q=0.9',
        'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
        'X-Requested-With': 'XMLHttpRequest'
      }
    });

    const occurrences = response.data?.data || [];
    
    // Find matching classes
    const matchingClasses = findMatchingClasses(occurrences, profile);
    
    if (matchingClasses.length === 0) {
      return {
        success: false,
        error: 'No matching classes found',
        profile
      };
    }

    // Filter out already booked classes
    const unbookedClasses = matchingClasses.filter(c => !c.is_joined);
    
    if (unbookedClasses.length === 0) {
      return {
        success: true,
        alreadyBooked: true,
        message: 'Already booked matching class(es)',
        matchedClasses: matchingClasses.length
      };
    }

    // Book the first matching unbooked class
    const classToBook = unbookedClasses[0];
    console.log(`Auto-booking class: ${classToBook.service_title} at ${classToBook.occurs_at}`);
    
    const bookingResult = await signupForClass(sessionCookie, classToBook.id, tryWaitlist);
    
    return {
      success: true,
      booked: true,
      class: {
        id: classToBook.id,
        title: classToBook.service_title,
        trainer: classToBook.trainer_name,
        location: classToBook.location_name,
        subLocation: classToBook.sub_location_name,
        time: classToBook.occurs_at
      },
      bookingResult,
      totalMatches: matchingClasses.length
    };
  } catch (error) {
    console.error('Error in auto-booking:', error.message);
    return {
      success: false,
      error: error.message,
      profile
    };
  }
}

module.exports = {
  fetchClasses,
  enrichClassesWithBookingStatus,
  getUserClientId,
  getOccurrenceDetails,
  signupForClass,
  joinWaitlist,
  getMyBookings,
  cancelBooking,
  getLocations,
  getServices,
  createClassProfile,
  matchesClassProfile,
  findMatchingClasses,
  autoBookClass
};
