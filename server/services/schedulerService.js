const classService = require('./classService');
const db = require('../database');

/**
 * Check for classes that need signup and attempt to book them.
 * This function implements a retry mechanism: any class within its booking window
 * will be retried on every scheduler run until either:
 * 1. Signup succeeds, or
 * 2. The class time passes
 * 
 * This ensures that if the computer was asleep when the booking window opened,
 * the class will still be booked once the computer wakes up and the scheduler runs.
 */
async function checkAndSignup(sessionCookie) {
  try {
    const trackedClasses = await db.getAllTrackedClasses();
    const autoSignupClasses = trackedClasses.filter(c => c.auto_signup);

    if (autoSignupClasses.length === 0) {
      return;
    }

    console.log(`Checking ${autoSignupClasses.length} auto-signup classes...`);

    const now = new Date();
    const endDate = new Date();
    endDate.setDate(endDate.getDate() + 7);

    const allClasses = await classService.fetchClasses(sessionCookie, {
      startDate: now.toISOString(),
      endDate: endDate.toISOString()
    });

    for (const tracked of autoSignupClasses) {
      const matchingClasses = allClasses.filter(c => {
        const serviceMatch = c.serviceId === tracked.service_id;
        const trainerMatch = !tracked.trainer_id || c.trainerId === tracked.trainer_id;
        const locationMatch = c.locationId === tracked.location_id;
        
        if (!serviceMatch || !trainerMatch || !locationMatch) {
          return false;
        }

        if (tracked.day_of_week) {
          const classDate = new Date(c.startTime);
          const dayOfWeek = classDate.toLocaleDateString('en-US', { weekday: 'long' });
          if (dayOfWeek !== tracked.day_of_week) {
            return false;
          }
        }

        if (tracked.start_time) {
          const classDate = new Date(c.startTime);
          const classTime = classDate.toTimeString().substring(0, 5);
          if (classTime !== tracked.start_time) {
            return false;
          }
        }

        return true;
      });

      for (const classToSignup of matchingClasses) {
        const classTime = new Date(classToSignup.startTime);
        const hoursUntilClass = (classTime.getTime() - now.getTime()) / (60 * 60 * 1000);
        
        console.log(`\nEvaluating class: ${classToSignup.serviceName} at ${classTime.toISOString()}`);
        console.log(`  Hours until class: ${hoursUntilClass.toFixed(2)}`);
        console.log(`  canSignup: ${classToSignup.canSignup}`);
        console.log(`  actions: ${JSON.stringify(classToSignup.actions)}`);

        const signupHoursBefore = classToSignup.restrictToBookInAdvanceHours || tracked.signup_hours_before || 46;
        const signupTime = new Date(classTime.getTime() - (signupHoursBefore * 60 * 60 * 1000));
        const hoursUntilSignupWindow = (signupTime.getTime() - now.getTime()) / (60 * 60 * 1000);

        console.log(`  signupHoursBefore: ${signupHoursBefore}`);
        console.log(`  signupTime: ${signupTime.toISOString()}`);
        console.log(`  hoursUntilSignupWindow: ${hoursUntilSignupWindow.toFixed(2)}`);
        console.log(`  now >= signupTime: ${now >= signupTime}`);
        console.log(`  now < classTime: ${now < classTime}`);

        if (now < signupTime) {
          console.log(`  ⏰ Waiting: Signup window opens in ${hoursUntilSignupWindow.toFixed(2)} hours`);
          continue;
        }

        if (now >= classTime) {
          console.log(`  ⏱️  Skipping: Class has already started/passed`);
          continue;
        }

        const existingLog = await db.getSignupLogs(1000);
        const successfulSignup = existingLog.find(log => 
          log.occurrence_id === classToSignup.id && 
          log.status === 'success'
        );

        if (successfulSignup) {
          console.log(`  ⏭️  Skipping: Already signed up for this class`);
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
          console.log(`  🔄 Retry attempt #${failedAttempts.length + 1}: Last attempt was ${minutesSinceLastAttempt.toFixed(1)} minutes ago`);
          console.log(`     Last error: ${lastAttempt.error_message || 'Unknown'}`);
          console.log(`     Retrying since class is still within booking window...`);
        }

        if (!classToSignup.canSignup) {
          console.log(`  ⚠️  WARNING: In booking window but canSignup is false - attempting anyway`);
        }

        console.log(`  ✅ ATTEMPTING TO BOOK: ${classToSignup.serviceName} at ${classTime}`);
        
        // For retry attempts, fetch fresh occurrence details to get latest lock_version
        let lockVersion = classToSignup.lock_version;
        if (failedAttempts.length > 0 && !lockVersion) {
          console.log(`  🔄 Fetching fresh occurrence details for retry...`);
          try {
            const freshDetails = await classService.getOccurrenceDetails(sessionCookie, classToSignup.id);
            if (freshDetails?.occurrence?.lock_version) {
              lockVersion = freshDetails.occurrence.lock_version;
              console.log(`  ✓ Retrieved fresh lock_version: ${lockVersion}`);
            }
          } catch (error) {
            console.log(`  ⚠️  Could not fetch fresh details: ${error.message}`);
          }
        }
        
        if (lockVersion !== undefined) {
          console.log(`  Using lock_version: ${lockVersion}`);
        } else {
          console.log(`  ⚠️  No lock_version available`);
        }
        
        try {
          await classService.signupForClass(sessionCookie, classToSignup.id, lockVersion);
          
          await db.addSignupLog({
            occurrenceId: classToSignup.id,
            serviceName: classToSignup.serviceName,
            trainerName: classToSignup.trainerName,
            locationName: classToSignup.locationName,
            classTime: classToSignup.startTime,
            status: 'success',
            errorMessage: null
          });

          console.log(`  ✓ Successfully signed up for: ${classToSignup.serviceName}`);
        } catch (error) {
          console.error(`  ✗ Failed to sign up for: ${classToSignup.serviceName}`, error.message);
          
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
    console.error('Scheduler check error:', error);
    throw error;
  }
}

module.exports = {
  checkAndSignup
};
