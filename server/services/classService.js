const axios = require('axios');
const logger = require('../logger');
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
    logger.warn('Could not fetch CSRF token:', error.message);
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
      logger.info(`Using auto-detected client_id: ${cachedClientId}`);
      return cachedClientId;
    }
  } catch (error) {
    logger.warn('Could not read client_id from database:', error.message);
  }
  
  logger.warn('⚠️  No client_id found');
  logger.warn('   Client ID is auto-detected during login');
  logger.warn('   Enrollment detection will be inaccurate without it');
  
  return null;
}

async function enrichClassesWithBookingStatus(sessionCookie, classes, clientId) {
  if (!classes || classes.length === 0) {
    return classes;
  }

  // Get waitlist limit from config
  const appConfig = config.getConfig();
  const waitlistLimit = appConfig.waitlistLimit ?? 5;

  if (!clientId) {
    logger.debug('No client ID available, using is_joined flags from occurrences API');
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

      // Check if waitlist has room (totalOnWaitingList < waitlistLimit)
      const waitlistHasRoom = (cls.totalOnWaitingList || 0) < waitlistLimit;
      cls.canJoinWaitlist = !cls.isJoined &&
                           !cls.isWaited &&
                           cls.fullGroup &&
                           cls.waitingListEnabled &&
                           waitlistHasRoom &&
                           bookingWindowOpen &&
                           now < classStartTime &&
                           (cls.status === 'Scheduled' || cls.status === 'Rescheduled');
    });

    const joinedCount = classes.filter(c => c.isJoined).length;
    logger.debug(`Classes with isJoined=true: ${joinedCount} out of ${classes.length}`);
    
    return classes;
  }

  // Fetch user's enrolled classes using the bookings endpoint
  try {
    logger.debug(`Fetching enrolled classes for client_id: ${clientId}...`);
    
    const now = new Date();
    const endDate = new Date();
    endDate.setDate(endDate.getDate() + 30);
    
    const filterObj = {
      filter: [
        { by: 'status', with: ['Rescheduled', 'Scheduled', 'Reminded', 'Completed', 'Requested', 'Counted', 'Verified'] },
        { by: 'since', with: now.toISOString() },
        { by: 'till', with: endDate.toISOString() }
      ]
    };
    
    // OPTIMIZATION: Filter by service IDs to reduce payload when checking specific classes
    const uniqueServiceIds = [...new Set(classes.map(c => c.serviceId).filter(Boolean))];
    if (uniqueServiceIds.length > 0 && uniqueServiceIds.length < 20) {
      // Only add service_id filter if we have a reasonable number of services
      // This dramatically reduces the response size for targeted queries
      filterObj.filter.push({ by: 'service_id', with: uniqueServiceIds });
      logger.debug(`Optimized booking check: Filtering by ${uniqueServiceIds.length} service IDs`);
    }
    
    const jsonParam = encodeURIComponent(JSON.stringify(filterObj));
    const url = `${API_BASE_URL}/schedule/occurrences/bookings?json=${jsonParam}`;
    
    const response = await axios.get(url, {
      headers: {
        'Cookie': sessionCookie,
        'Accept': '*/*',
        'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
        'X-Requested-With': 'XMLHttpRequest'
      }
    });
    
    const allBookings = response.data?.data || [];

    // Separate enrolled bookings (is_joined=true) from waitlisted bookings (is_waited=true)
    const enrolledOccurrenceIds = new Set(
      allBookings.filter(b => b.is_joined).map(b => b.id)
    );
    const waitlistedOccurrenceIds = new Set(
      allBookings.filter(b => b.is_waited).map(b => b.id)
    );

    logger.debug(`Found ${allBookings.length} bookings (${enrolledOccurrenceIds.size} enrolled, ${waitlistedOccurrenceIds.size} waitlisted)`);

    classes.forEach(cls => {
      const actuallyEnrolled = enrolledOccurrenceIds.has(cls.id);
      const actuallyWaitlisted = waitlistedOccurrenceIds.has(cls.id);

      if (actuallyEnrolled !== cls.isJoined) {
        logger.debug(`✓ Corrected enrollment for class ${cls.id} (${cls.serviceName}): was ${cls.isJoined}, now ${actuallyEnrolled}`);
      }

      if (actuallyWaitlisted !== cls.isWaited) {
        logger.debug(`✓ Corrected waitlist status for class ${cls.id} (${cls.serviceName}): was ${cls.isWaited}, now ${actuallyWaitlisted}`);
      }

      cls.isJoined = actuallyEnrolled;
      cls.isWaited = actuallyWaitlisted;

      const classStartTime = new Date(cls.startTime);
      const restrictHours = cls.restrictToBookInAdvanceHours || 0;
      const bookingWindowOpen = restrictHours === 0 ||
        (classStartTime.getTime() - now.getTime()) <= (restrictHours * 60 * 60 * 1000);

      cls.canSignup = !cls.isJoined &&
                     !cls.fullGroup &&
                     bookingWindowOpen &&
                     now < classStartTime &&
                     (cls.status === 'Scheduled' || cls.status === 'Rescheduled');

      // Check if waitlist has room (totalOnWaitingList < waitlistLimit)
      const waitlistHasRoom = (cls.totalOnWaitingList || 0) < waitlistLimit;
      cls.canJoinWaitlist = !cls.isJoined &&
                           !cls.isWaited &&
                           cls.fullGroup &&
                           cls.waitingListEnabled &&
                           waitlistHasRoom &&
                           bookingWindowOpen &&
                           now < classStartTime &&
                           (cls.status === 'Scheduled' || cls.status === 'Rescheduled');
    });

    const joinedCount = classes.filter(c => c.isJoined).length;
    const waitedCount = classes.filter(c => c.isWaited).length;
    logger.debug(`Booking verification complete. Enrolled: ${joinedCount}, Waitlisted: ${waitedCount} out of ${classes.length} classes`);
    
    return classes;
  } catch (error) {
    logger.error('Failed to fetch enrolled classes:', error.message);
    logger.warn('Falling back to is_joined flags from initial query');
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
    
    logger.debug('Config loaded:', JSON.stringify(appConfig, null, 2));
    logger.debug('Filters provided:', JSON.stringify(filters, null, 2));
    
    if (filters.locationId) {
      logger.debug(`Using explicit locationId filter: ${filters.locationId}`);
      filterObj.filter.push({ by: 'location_id', with: [filters.locationId] });
    } else if (appConfig.preferredLocations && appConfig.preferredLocations.length > 0) {
      logger.debug(`Applying preferred locations from config: ${appConfig.preferredLocations.join(', ')}`);
      filterObj.filter.push({ by: 'location_id', with: appConfig.preferredLocations });
    } else {
      logger.debug('No location filter applied - fetching from ALL locations');
    }
    
    // OPTIMIZATION: Filter by specific service IDs (e.g., from tracked classes)
    if (filters.serviceIds && filters.serviceIds.length > 0) {
      logger.debug(`Applying service_id filter: ${filters.serviceIds.join(', ')}`);
      filterObj.filter.push({ by: 'service_id', with: filters.serviceIds });
    }
    
    // OPTIMIZATION: Filter by specific trainer IDs (optional - some classes don't require specific trainer)
    if (filters.trainerIds && filters.trainerIds.length > 0) {
      logger.debug(`Applying trainer_id filter: ${filters.trainerIds.join(', ')}`);
      filterObj.filter.push({ by: 'trainer_id', with: filters.trainerIds });
    }
    
    // OPTIMIZATION: Add pagination limit if specified
    if (filters.limit && filters.limit > 0) {
      const start = filters.offset || 0;
      filterObj.limit = { start: start, count: filters.limit };
      logger.debug(`Applying pagination: start=${start}, count=${filters.limit}`);
    }
    
    // Multi-level sorting: occurs_at (primary), location_name (secondary), service_title (tertiary)
    // Using sorters object for multi-level sorting support
    filterObj.sorters = {
      occurs_at: true,        // true = ascending
      location_name: true,
      service_title: true
    };

    const jsonParam = encodeURIComponent(JSON.stringify(filterObj));
    const url = `${API_BASE_URL}/schedule/occurrences?all_service_categories=true&json=${jsonParam}`;
    const headers = {
      'Cookie': sessionCookie,
      'Accept': '*/*',
      'Accept-Language': 'en-US,en;q=0.9',
      'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
      'X-Requested-With': 'XMLHttpRequest'
    };
    
    logger.debug('Fetching classes...');
    logger.debug('URL:', url);
    logger.debug('Cookie:', sessionCookie.substring(0, 50) + '...');

    const response = await axios.get(url, { headers });

    logger.debug('Response status:', response.status);
    logger.debug('Response data keys:', Object.keys(response.data || {}));
    
    const occurrences = response.data?.data || response.data?.occurrences || [];
    logger.debug('Occurrences count:', occurrences.length);

    if (occurrences.length > 0) {
      logger.debug('Sample occurrence data:', JSON.stringify(occurrences[0], null, 2));
      
      // Log lap lane occurrences for debugging
      const lapLanes = occurrences.filter(o => o.service_title?.includes('Lap Lane'));
      if (lapLanes.length > 0) {
        logger.debug('Lap Lane occurrence data:', JSON.stringify(lapLanes[0], null, 2));
      }
      
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

          // Can join waitlist if class is full but waitlist is enabled and has room
          const waitlistLimit = appConfig.waitlistLimit ?? 5;
          const waitlistHasRoom = (occurrence.total_on_waiting_list || 0) < waitlistLimit;
          const canJoinWaitlist = !occurrence.is_joined &&
                                  !occurrence.is_waited &&
                                  occurrence.full_group &&
                                  occurrence.waiting_list_enabled &&
                                  waitlistHasRoom &&
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
            serviceCategoryId: occurrence.service_category_id,
            serviceCategoryName: occurrence.service_category_name,
            serviceType: occurrence.service_type,
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
            isWaited: occurrence.is_waited,
            isReadonly: occurrence.is_readonly,
            fullGroup: occurrence.full_group,
            waitingListEnabled: occurrence.waiting_list_enabled,
            positionOnWaitingList: occurrence.position_on_waiting_list,
            totalOnWaitingList: occurrence.total_on_waiting_list,
            canSignup,
            canJoinWaitlist,
            restrictToBookInAdvanceHours: occurrence.restrict_to_book_in_advance_time_in_hours,
            lock_version: occurrence.lock_version
          };
        } catch (error) {
          logger.error(`Error processing occurrence at index ${index}:`, error.message);
          logger.error('Occurrence data:', JSON.stringify(occurrence, null, 2));
          return null;
        }
      }).filter(c => c !== null);
      
      // Filter out readonly services (lap lanes, pool reservations, etc.)
      const filteredClasses = classes.filter(c => !c.isReadonly);
      const readonlyCount = classes.length - filteredClasses.length;
      if (readonlyCount > 0) {
        logger.debug(`Filtered out ${readonlyCount} readonly services (pool lanes, etc.)`);
      }
      
      const verifyBookings = filters.verifyBookings !== false;
      if (verifyBookings) {
        const clientId = await getUserClientId(sessionCookie);
        return await enrichClassesWithBookingStatus(sessionCookie, filteredClasses, clientId);
      }
      
      return filteredClasses;
    }

    logger.debug('No occurrences found in response, returning empty array');
    return [];
  } catch (error) {
    logger.error('Error fetching classes:', error.response?.data || error.message);
    logger.error('Error details:', {
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
    logger.error('Error fetching occurrence details:', error.response?.data || error.message);
    return null;
  }
}

async function signupForClass(sessionCookie, occurrenceId, lockVersion = null, tryWaitlist = true, waitingListEnabled = true) {
  try {
    const csrfToken = await getCSRFToken(sessionCookie);
    
    if (!csrfToken) {
      logger.warn('No CSRF token available, attempting without it...');
    }
    
    // Try to get lock_version if not provided, but don't fail if we can't get it
    if (lockVersion === null || lockVersion === undefined) {
      try {
        const details = await getOccurrenceDetails(sessionCookie, occurrenceId);
        if (details?.occurrence?.lock_version !== undefined) {
          lockVersion = details.occurrence.lock_version;
          logger.debug(`Fetched lock_version from details: ${lockVersion}`);
        } else {
          logger.debug('⚠️  lock_version not available from API, attempting signup anyway...');
        }
      } catch (error) {
        logger.debug(`⚠️  Could not fetch occurrence details (${error.message}), attempting signup without lock_version...`);
      }
    } else {
      logger.debug(`Using provided lock_version: ${lockVersion}`);
    }
    
    const payload = (lockVersion !== null && lockVersion !== undefined) ? { lock_version: lockVersion } : {};
    const formData = new URLSearchParams();
    formData.append('json', JSON.stringify(payload));

    logger.info(`Attempting to join occurrence ${occurrenceId} with payload:`, payload);
    
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

    logger.info('✓ Successfully joined class');
    logger.debug('Response data:', JSON.stringify(response.data, null, 2));
    return response.data;
  } catch (error) {
    const errorData = error.response?.data;
    const errorMessage = errorData?.exception || errorData?.error || error.message;
    const status = error.response?.status;
    
    logger.error(`Join request failed with status ${status}:`, errorMessage);
    logger.error('Full error response:', JSON.stringify(errorData, null, 2));
    
    // Check if already enrolled
    if (status === 422) {
      if (errorMessage && (errorMessage.includes('already') || errorMessage.includes('enrolled') || errorMessage.includes('joined'))) {
        logger.info('ℹ️  Already enrolled in this class');
        const alreadyEnrolledError = new Error('Already enrolled in this class');
        alreadyEnrolledError.code = 'ALREADY_ENROLLED';
        throw alreadyEnrolledError;
      }
      
      // Class is full, try waitlist if enabled
      if (tryWaitlist && waitingListEnabled) {
        logger.info('Class full, trying waitlist...');
        try {
          return await joinWaitlist(sessionCookie, occurrenceId);
        } catch (waitlistError) {
          // If waitlist fails with 404, might mean already enrolled or waitlist disabled
          if (waitlistError.response?.status === 404) {
            logger.warn('⚠️  Waitlist endpoint not found (404) - might be already enrolled or waitlist disabled');
            const notAvailableError = new Error('Class full and waitlist not available');
            notAvailableError.code = 'WAITLIST_NOT_AVAILABLE';
            throw notAvailableError;
          }
          throw waitlistError;
        }
      } else if (tryWaitlist && !waitingListEnabled) {
        logger.warn('⚠️  Class is full but waitlist is not enabled');
        const notAvailableError = new Error('Class full and waitlist not enabled');
        notAvailableError.code = 'WAITLIST_NOT_ENABLED';
        throw notAvailableError;
      }
    }
    throw error;
  }
}

async function joinWaitlist(sessionCookie, occurrenceId) {
  try {
    const csrfToken = await getCSRFToken(sessionCookie);
    
    if (!csrfToken) {
      logger.warn('No CSRF token available, attempting without it...');
    }
    
    const formData = new URLSearchParams();
    formData.append('json', JSON.stringify({}));

    // YMCA uses PUT for waitlist, not POST
    const response = await axios.put(
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

    logger.info('✓ Successfully joined waitlist');
    return { ...response.data, waitlisted: true };
  } catch (error) {
    const errorData = error.response?.data;
    const errorMessage = errorData?.exception || errorData?.error || error.message;
    const status = error.response?.status;
    
    if (status === 404) {
      logger.warn('⚠️  Waitlist endpoint not found (404) - waitlist may be disabled or you may already be enrolled');
      const notAvailableError = new Error('Waitlist not available');
      notAvailableError.code = 'WAITLIST_NOT_AVAILABLE';
      throw notAvailableError;
    } else if (status === 422) {
      if (errorMessage && errorMessage.toLowerCase().includes('full')) {
        logger.warn('⚠️  Waitlist is full - will retry');
        const fullError = new Error('Waitlist is full');
        fullError.code = 'WAITLIST_FULL';
        throw fullError;
      } else if (errorMessage && (errorMessage.toLowerCase().includes('already') || errorMessage.toLowerCase().includes('waited'))) {
        logger.info('ℹ️  Already on waitlist');
        const alreadyError = new Error('Already on waitlist');
        alreadyError.code = 'ALREADY_ON_WAITLIST';
        throw alreadyError;
      }
    }
    
    logger.error('Failed to join waitlist:', errorData || error.message);
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
    logger.error('Error fetching bookings:', error.response?.data || error.message);
    throw error;
  }
}

async function cancelBooking(sessionCookie, occurrenceId) {
  try {
    logger.info(`Attempting to cancel occurrence ${occurrenceId}...`);
    logger.debug(`Session cookie: ${sessionCookie.substring(0, 50)}...`);

    const csrfToken = await getCSRFToken(sessionCookie);
    logger.debug(`CSRF token obtained: ${csrfToken ? csrfToken.substring(0, 20) + '...' : 'NONE'}`);

    if (!csrfToken) {
      throw new Error('Failed to obtain CSRF token. Session may be invalid.');
    }

    const formData = new URLSearchParams();
    formData.append('json', JSON.stringify({}));

    logger.debug(`Making DELETE request to: ${API_BASE_URL}/schedule/occurrences/${occurrenceId}/cancel`);

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

    logger.info('✓ Successfully cancelled booking');
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

    logger.error(errorMessage);
    const err = new Error(errorMessage);
    err.status = status;
    err.originalError = errorData;
    throw err;
  }
}

async function lateCancelBooking(sessionCookie, occurrenceId) {
  try {
    logger.info(`Attempting to late cancel occurrence ${occurrenceId}...`);

    const csrfToken = await getCSRFToken(sessionCookie);

    if (!csrfToken) {
      throw new Error('Failed to obtain CSRF token. Session may be invalid.');
    }

    const formData = new URLSearchParams();
    formData.append('json', JSON.stringify({}));

    logger.debug(`Making DELETE request to: ${API_BASE_URL}/schedule/occurrences/${occurrenceId}/late_cancel`);

    const response = await axios.delete(
      `${API_BASE_URL}/schedule/occurrences/${occurrenceId}/late_cancel`,
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

    logger.info('✓ Successfully late cancelled booking');
    return response.data;
  } catch (error) {
    const errorData = error.response?.data;
    const status = error.response?.status;

    let errorMessage = 'Failed to late cancel booking';

    if (status === 400 && errorData?.exception) {
      errorMessage = `Cannot late cancel this class: ${errorData.exception}`;
    } else if (status === 404) {
      errorMessage = 'Class not found or you are not enrolled in this class.';
    } else if (status === 422) {
      errorMessage = 'Late cancellation is not available for this class.';
    } else if (errorData) {
      errorMessage = `Failed to late cancel booking: ${JSON.stringify(errorData)}`;
    } else {
      errorMessage = `Failed to late cancel booking: ${error.message}`;
    }

    logger.error(errorMessage);
    const err = new Error(errorMessage);
    err.status = status;
    err.originalError = errorData;
    throw err;
  }
}

async function leaveWaitlist(sessionCookie, occurrenceId) {
  try {
    logger.info(`Attempting to leave waitlist for occurrence ${occurrenceId}...`);

    const csrfToken = await getCSRFToken(sessionCookie);

    if (!csrfToken) {
      throw new Error('Failed to obtain CSRF token. Session may be invalid.');
    }

    const formData = new URLSearchParams();
    formData.append('json', JSON.stringify({}));

    logger.debug(`Making DELETE request to: ${API_BASE_URL}/schedule/occurrences/${occurrenceId}/leave`);

    const response = await axios.delete(
      `${API_BASE_URL}/schedule/occurrences/${occurrenceId}/leave`,
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

    logger.info('✓ Successfully left waitlist');
    return response.data;
  } catch (error) {
    const errorData = error.response?.data;
    const status = error.response?.status;

    let errorMessage = 'Failed to leave waitlist';

    if (status === 400 && errorData?.exception) {
      errorMessage = `Cannot leave waitlist: ${errorData.exception}`;
    } else if (status === 404) {
      errorMessage = 'Class not found or you are not on the waitlist.';
    } else if (status === 422) {
      errorMessage = 'Cannot leave waitlist for this class.';
    } else if (errorData) {
      errorMessage = `Failed to leave waitlist: ${JSON.stringify(errorData)}`;
    } else {
      errorMessage = `Failed to leave waitlist: ${error.message}`;
    }

    logger.error(errorMessage);
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
    logger.error('Error fetching locations:', error.response?.data || error.message);
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
    logger.error('Error fetching services:', error.response?.data || error.message);
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
    logger.info(`Auto-booking class: ${classToBook.service_title} at ${classToBook.occurs_at}`);
    
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
    logger.error('Error in auto-booking:', error.message);
    return {
      success: false,
      error: error.message,
      profile
    };
  }
}

async function getUserProfile(sessionCookie) {
  try {
    const response = await axios.get(`${API_BASE_URL}/users/clients/linked?include_self=true&json=${encodeURIComponent(JSON.stringify({ limit: { start: 0, count: 10 } }))}`, {
      headers: {
        'Cookie': sessionCookie,
        'Accept': '*/*',
        'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36',
        'X-Requested-With': 'XMLHttpRequest'
      }
    });
    
    const clients = response.data?.data || response.data?.clients || [];
    if (clients.length > 0) {
      const user = clients[0];
      
      // API returns title (full name), description (email), image_url
      const fullName = user.title || '';
      const nameParts = fullName.trim().split(/\s+/);
      const firstName = nameParts[0] || 'User';
      const lastName = nameParts.slice(1).join(' ') || '';
      
      return {
        id: user.id,
        firstName,
        lastName,
        email: user.description || '',
        imageUrl: user.image_url || null
      };
    }
    
    return null;
  } catch (error) {
    logger.error('Error fetching user profile:', error.message);
    return null;
  }
}

module.exports = {
  fetchClasses,
  enrichClassesWithBookingStatus,
  getUserClientId,
  getUserProfile,
  getOccurrenceDetails,
  signupForClass,
  joinWaitlist,
  leaveWaitlist,
  getMyBookings,
  cancelBooking,
  lateCancelBooking,
  getLocations,
  getServices,
  createClassProfile,
  matchesClassProfile,
  findMatchingClasses,
  autoBookClass
};
