const logger = require('../logger');
const classService = require('./classService');
const db = require('../database');

let cachedClasses = [];
let lastFetchTime = null;
const CACHE_DURATION_MS = 10 * 60 * 1000;

/**
 * Check for classes that need signup and attempt to book them.
 * This function implements a retry mechanism: any class within its booking window
 * will be retried on every scheduler run (every 5 minutes) until either:
 * 1. Signup succeeds, or
 * 2. The class time passes
 * 
 * This ensures that if the computer was asleep when the booking window opened,
 * the class will still be booked once the computer wakes up and the scheduler runs.
 * 
 * WAITLIST MONITORING: If a class is full and the waitlist is also full, the app
 * will continuously retry every 5 minutes until either:
 * - A spot opens on the waitlist and signup succeeds
 * - The class time passes
 * This handles scenarios where classes are added early or within the signup window.
 * 
 * OPTIMIZATION: Only fetches from API when necessary:
 * - When a booking window is approaching within 15 minutes
 * - When cache is stale (>10 minutes old)
 * - When we're in an active booking window and need fresh data
 */
async function checkAndSignup(sessionCookie) {
  try {
    const trackedClasses = await db.getAllTrackedClasses();
    const autoSignupClasses = trackedClasses.filter(c => c.auto_signup);

    if (autoSignupClasses.length === 0) {
      logger.debug('No auto-signup classes tracked. Skipping scheduler run.');
      return;
    }

    const now = new Date();
    
    // Calculate if we need to fetch: check if any booking window is within 15 minutes
    let needsFetch = false;
    let inActiveBookingWindow = false;
    
    for (const tracked of autoSignupClasses) {
      const logs = await db.getSignupLogs(1000);
      const successfulSignup = logs.find(log => 
        log.occurrence_id && String(log.occurrence_id).includes(tracked.service_id) &&
        log.status === 'success'
      );
      
      if (successfulSignup) continue;
      
      // Estimate next booking window (this is approximate, real check needs API data)
      const userPreferredHours = tracked.signup_hours_before || 46;
      const estimatedNextClassTime = getNextOccurrence(tracked, now);
      
      if (estimatedNextClassTime) {
        const hoursUntilClass = (estimatedNextClassTime.getTime() - now.getTime()) / (60 * 60 * 1000);
        const signupWindowHours = Math.min(userPreferredHours, 48); // Conservative estimate
        const hoursUntilWindow = hoursUntilClass - signupWindowHours;
        const minutesUntilWindow = hoursUntilWindow * 60;
        
        // Check if we're within 15 minutes of a booking window or already in it
        if (minutesUntilWindow <= 15) {
          needsFetch = true;
          if (hoursUntilWindow <= 0) {
            inActiveBookingWindow = true;
          }
        }
      }
    }
    
    // Check cache validity
    const cacheAge = lastFetchTime ? (now.getTime() - lastFetchTime.getTime()) : Infinity;
    const cacheStale = cacheAge > CACHE_DURATION_MS;
    
    if (!needsFetch && !cacheStale) {
      logger.debug(`Scheduler: No booking windows approaching. Skipping API fetch. Next check in 5 minutes.`);
      return;
    }
    
    if (cacheStale && needsFetch) {
      logger.info(`Scheduler: Booking window approaching. Fetching fresh data from API...`);
    } else if (inActiveBookingWindow) {
      logger.info(`Scheduler: In active booking window. Fetching fresh data...`);
    } else if (needsFetch) {
      logger.debug(`Scheduler: Using cached data (${Math.floor(cacheAge / 1000)}s old)...`);
    }
    
    logger.info(`Checking ${autoSignupClasses.length} auto-signup classes...`);

    let allClasses;
    
    // Only fetch if cache is stale or we're in/near a booking window
    if (cacheStale || inActiveBookingWindow) {
      const endDate = new Date();
      endDate.setDate(endDate.getDate() + 7);
      
      // OPTIMIZATION: Extract unique service IDs and trainer IDs from tracked classes
      // This dramatically reduces API payload by only fetching relevant classes
      const serviceIds = [...new Set(autoSignupClasses.map(c => c.service_id).filter(Boolean))];
      
      // Only include trainer IDs for classes that require specific trainer matching
      const trainerIds = [...new Set(
        autoSignupClasses
          .filter(c => c.match_trainer && c.trainer_id)
          .map(c => c.trainer_id)
      )];
      
      logger.debug(`Fetching classes for ${serviceIds.length} services${trainerIds.length > 0 ? ` and ${trainerIds.length} trainers` : ''}`);
      
      // Skip enrollment verification during regular checks - only verify when actually attempting signup
      allClasses = await classService.fetchClasses(sessionCookie, {
        startDate: now.toISOString(),
        endDate: endDate.toISOString(),
        serviceIds: serviceIds,  // OPTIMIZATION: Only fetch tracked services
        trainerIds: trainerIds.length > 0 ? trainerIds : undefined,  // OPTIMIZATION: Only fetch specific trainers if required
        verifyBookings: false // Skip expensive enrollment verification call
      });
      
      cachedClasses = allClasses;
      lastFetchTime = now;
      logger.info(`✅ Optimized fetch: Retrieved ${allClasses.length} classes (filtered by ${serviceIds.length} services${trainerIds.length > 0 ? ` & ${trainerIds.length} trainers` : ''})`);
    } else {
      allClasses = cachedClasses;
      logger.debug(`Using ${allClasses.length} cached classes`);
    }

    for (const tracked of autoSignupClasses) {
      logger.info(`\n📋 Checking tracked class: ${tracked.service_name}`);
      logger.debug(`   Service ID: ${tracked.service_id}, Trainer: ${tracked.trainer_name || 'any'}, Location: ${tracked.location_name}`);
      logger.debug(`   Day: ${tracked.day_of_week}, Time: ${tracked.start_time}`);
      logger.debug(`   Match settings: trainer=${tracked.match_trainer}, exactTime=${tracked.match_exact_time}, tolerance=${tracked.time_tolerance}min`);
      
      const matchingClasses = allClasses.filter(c => {
        // Use loose equality to handle string vs number comparison
        const serviceMatch = String(c.serviceId) === String(tracked.service_id);
        const trainerMatch = !tracked.match_trainer || !tracked.trainer_id || String(c.trainerId) === String(tracked.trainer_id);
        const locationMatch = !tracked.location_id || String(c.locationId) === String(tracked.location_id);
        
        if (!serviceMatch || !trainerMatch || !locationMatch) {
          return false;
        }

        if (tracked.day_of_week) {
          const classDate = new Date(c.startTime);
          const dayOfWeek = classDate.toLocaleDateString('en-US', { weekday: 'long', timeZone: 'America/New_York' });
          if (dayOfWeek !== tracked.day_of_week) {
            return false;
          }
        }

        if (tracked.start_time) {
          const classDate = new Date(c.startTime);
          if (tracked.match_exact_time) {
            // Exact time match
            const classTime = classDate.toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit', hour12: false, timeZone: 'America/New_York' });
            if (classTime !== tracked.start_time) {
              return false;
            }
          } else {
            // Fuzzy time match with tolerance
            const [targetHour, targetMin] = tracked.start_time.split(':').map(Number);
            const targetMinutes = targetHour * 60 + targetMin;
            
            // Get class time in America/New_York timezone
            const classTimeStr = classDate.toLocaleTimeString('en-US', { 
              hour: '2-digit', 
              minute: '2-digit', 
              hour12: false, 
              timeZone: 'America/New_York' 
            });
            const [classHour, classMin] = classTimeStr.split(':').map(Number);
            const classMinutes = classHour * 60 + classMin;
            
            const diff = Math.abs(classMinutes - targetMinutes);
            const tolerance = tracked.time_tolerance || 15;
            if (diff > tolerance) {
              return false;
            }
          }
        }

        return true;
      });

      for (const classToSignup of matchingClasses) {
        const classTime = new Date(classToSignup.startTime);
        const hoursUntilClass = (classTime.getTime() - now.getTime()) / (60 * 60 * 1000);
        
        logger.debug(`\nEvaluating class: ${classToSignup.serviceName} at ${classTime.toISOString()}`);
        logger.debug(`  Hours until class: ${hoursUntilClass.toFixed(2)}`);
        logger.debug(`  canSignup: ${classToSignup.canSignup}`);
        logger.debug(`  isJoined: ${classToSignup.isJoined}`);
        logger.debug(`  isWaited: ${classToSignup.isWaited}`);
        logger.debug(`  fullGroup: ${classToSignup.fullGroup}`);
        logger.debug(`  waitingListEnabled: ${classToSignup.waitingListEnabled}`);

        // User preference for when to sign up
        const userPreferredHours = tracked.signup_hours_before || 46;
        
        // YMCA restriction - can't book earlier than this window
        // If 0 or undefined, there's no restriction (can book anytime)
        const ymcaRestrictionHours = classToSignup.restrictToBookInAdvanceHours || 0;
        
        // Effective signup time: user's preference, but not earlier than YMCA allows
        // If no YMCA restriction (0), use user preference
        // Otherwise use minimum of user preference and YMCA restriction
        const signupHoursBefore = ymcaRestrictionHours > 0 
          ? Math.min(userPreferredHours, ymcaRestrictionHours)
          : userPreferredHours;
        
        const signupTime = new Date(classTime.getTime() - (signupHoursBefore * 60 * 60 * 1000));
        const hoursUntilSignupWindow = (signupTime.getTime() - now.getTime()) / (60 * 60 * 1000);

        logger.debug(`  userPreferredHours: ${userPreferredHours}`);
        logger.debug(`  ymcaRestrictionHours: ${ymcaRestrictionHours}`);
        logger.debug(`  effectiveSignupHoursBefore: ${signupHoursBefore}`);
        logger.debug(`  signupTime: ${signupTime.toISOString()}`);
        logger.debug(`  hoursUntilSignupWindow: ${hoursUntilSignupWindow.toFixed(2)}`);
        logger.debug(`  now >= signupTime: ${now >= signupTime}`);
        logger.debug(`  now < classTime: ${now < classTime}`);

        if (now < signupTime) {
          logger.debug(`  ⏰ Waiting: Signup window opens in ${hoursUntilSignupWindow.toFixed(2)} hours`);
          continue;
        }

        if (now >= classTime) {
          logger.debug(`  ⏱️  Skipping: Class has already started/passed`);
          continue;
        }

        // Skip if already enrolled (from YMCA API)
        if (classToSignup.isJoined) {
          logger.debug(`  ⏭️  Skipping: Already enrolled in this class (from YMCA API)`);
          continue;
        }

        // Skip if already on waitlist (from YMCA API)
        if (classToSignup.isWaited) {
          logger.debug(`  ⏭️  Skipping: Already on waitlist for this class (from YMCA API)`);
          continue;
        }

        const existingLog = await db.getSignupLogs(1000);
        const successfulSignup = existingLog.find(log => 
          log.occurrence_id === classToSignup.id && 
          log.status === 'success'
        );

        if (successfulSignup) {
          logger.debug(`  ⏭️  Skipping: Already signed up for this class`);
          continue;
        }

        const failedAttempts = existingLog.filter(log => 
          log.occurrence_id === classToSignup.id && 
          log.status === 'failed'
        );

        if (failedAttempts.length > 0) {
          const lastAttempt = failedAttempts[failedAttempts.length - 1];
          const lastAttemptTime = new Date(lastAttempt.timestamp);
          const minutesSinceLastAttempt = (now - lastAttemptTime) / (60 * 1000);
          logger.info(`  🔄 Retry attempt #${failedAttempts.length + 1}: Last attempt was ${minutesSinceLastAttempt.toFixed(1)} minutes ago`);
          logger.debug(`     Last error: ${lastAttempt.error_message || 'Unknown'}`);
          logger.debug(`     Retrying since class is still within booking window...`);
        }

        if (!classToSignup.canSignup) {
          logger.warn(`  ⚠️  WARNING: In booking window but canSignup is false - attempting anyway`);
        }

        logger.info(`  ✅ ATTEMPTING TO BOOK: ${classToSignup.serviceName} at ${classTime}`);
        
        // IMPORTANT: Never use cached lock_version - it changes frequently
        // Always let signupForClass fetch fresh occurrence details to get latest lock_version
        logger.debug(`  🔄 Will fetch fresh lock_version immediately before signup...`);
        
        try {
          const result = await classService.signupForClass(
            sessionCookie, 
            classToSignup.id, 
            null, // Always pass null to force fresh lock_version fetch
            true, // tryWaitlist
            classToSignup.waitingListEnabled
          );
          
          const statusMessage = result.waitlisted ? 'Joined waitlist' : 'Successfully signed up';
          
          await db.addSignupLog({
            occurrenceId: classToSignup.id,
            serviceName: classToSignup.serviceName,
            trainerName: classToSignup.trainerName,
            locationName: classToSignup.locationName,
            classTime: classToSignup.startTime,
            status: 'success',
            errorMessage: result.waitlisted ? 'Joined waitlist' : null
          });

          logger.info(`  ✓ ${statusMessage}: ${classToSignup.serviceName}`);
        } catch (error) {
          // Handle already enrolled case - mark as success to prevent retries
          if (error.code === 'ALREADY_ENROLLED') {
            logger.info(`  ℹ️  Already enrolled: ${classToSignup.serviceName}`);
            await db.addSignupLog({
              occurrenceId: classToSignup.id,
              serviceName: classToSignup.serviceName,
              trainerName: classToSignup.trainerName,
              locationName: classToSignup.locationName,
              classTime: classToSignup.startTime,
              status: 'success',
              errorMessage: 'Already enrolled'
            });
            continue;
          }
          
          // Handle already on waitlist - mark as success
          if (error.code === 'ALREADY_ON_WAITLIST') {
            logger.info(`  ℹ️  Already on waitlist: ${classToSignup.serviceName}`);
            await db.addSignupLog({
              occurrenceId: classToSignup.id,
              serviceName: classToSignup.serviceName,
              trainerName: classToSignup.trainerName,
              locationName: classToSignup.locationName,
              classTime: classToSignup.startTime,
              status: 'success',
              errorMessage: 'Already on waitlist'
            });
            continue;
          }
          
          // Handle waitlist full - RETRY every scheduler run (every 5 minutes)
          if (error.code === 'WAITLIST_FULL') {
            const lastAttemptTime = failedAttempts.length > 0 
              ? new Date(failedAttempts[failedAttempts.length - 1].timestamp)
              : null;
            const minutesSinceLastAttempt = lastAttemptTime 
              ? (now - lastAttemptTime) / (60 * 1000) 
              : Infinity;
            
            logger.warn(`  ⚠️  Waitlist is full - will retry in 5 minutes (attempt #${failedAttempts.length + 1})`);
            
            // Only log if it's been at least 4 minutes since last log (to avoid spam)
            if (minutesSinceLastAttempt >= 4 || failedAttempts.length === 0) {
              await db.addSignupLog({
                occurrenceId: classToSignup.id,
                serviceName: classToSignup.serviceName,
                trainerName: classToSignup.trainerName,
                locationName: classToSignup.locationName,
                classTime: classToSignup.startTime,
                status: 'failed',
                errorMessage: 'Waitlist full - will retry'
              });
            }
            continue;
          }
          
          // Handle waitlist not available/enabled - log but don't retry
          if (error.code === 'WAITLIST_NOT_AVAILABLE' || error.code === 'WAITLIST_NOT_ENABLED') {
            const message = error.code === 'WAITLIST_NOT_ENABLED' 
              ? 'Class full, waitlist not enabled'
              : 'Class full, waitlist not available';
            logger.warn(`  ⚠️  ${message}: ${classToSignup.serviceName}`);
            await db.addSignupLog({
              occurrenceId: classToSignup.id,
              serviceName: classToSignup.serviceName,
              trainerName: classToSignup.trainerName,
              locationName: classToSignup.locationName,
              classTime: classToSignup.startTime,
              status: 'failed',
              errorMessage: message
            });
            continue;
          }
          
          logger.error(`  ✗ Failed to sign up for: ${classToSignup.serviceName}`, error.message);
          
          await db.addSignupLog({
            occurrenceId: classToSignup.id,
            serviceName: classToSignup.serviceName,
            trainerName: classToSignup.trainerName,
            locationName: classToSignup.locationName,
            classTime: classToSignup.startTime,
            status: 'failed',
            errorMessage: error.message
          });
        }
      }
    }
  } catch (error) {
    logger.error('Scheduler check error:', error);
    throw error;
  }
}

/**
 * Estimate the next occurrence of a tracked class based on day of week and time.
 * This is a rough estimate used to determine if we should fetch from the API.
 */
function getNextOccurrence(tracked, fromDate) {
  if (!tracked.day_of_week || !tracked.start_time) {
    return null;
  }
  
  const dayMap = {
    'Sunday': 0, 'Monday': 1, 'Tuesday': 2, 'Wednesday': 3,
    'Thursday': 4, 'Friday': 5, 'Saturday': 6
  };
  
  const targetDay = dayMap[tracked.day_of_week];
  if (targetDay === undefined) return null;
  
  const [hours, minutes] = tracked.start_time.split(':').map(Number);
  if (isNaN(hours) || isNaN(minutes)) return null;
  
  // Find next occurrence of this day/time
  const next = new Date(fromDate);
  next.setHours(hours, minutes, 0, 0);
  
  const currentDay = next.getDay();
  let daysUntil = targetDay - currentDay;
  
  if (daysUntil < 0 || (daysUntil === 0 && next <= fromDate)) {
    daysUntil += 7;
  }
  
  next.setDate(next.getDate() + daysUntil);
  return next;
}

module.exports = {
  checkAndSignup
};
