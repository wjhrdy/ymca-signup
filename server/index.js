require('dotenv').config();
const express = require('express');
const cors = require('cors');
const bodyParser = require('body-parser');
const cron = require('node-cron');
const logger = require('./logger');
const appConfig = require('./config');
const db = require('./database');
const authService = require('./services/authService');
const classService = require('./services/classService');
const schedulerService = require('./services/schedulerService');

const app = express();
const PORT = process.env.PORT || 3001;

app.use(cors());
app.use(bodyParser.json());
app.use(express.static('client/dist'));

let sessionCookie = null;
let dbReady = false;

async function initializeDatabase() {
  return new Promise((resolve) => {
    db.initialize();
    setTimeout(async () => {
      sessionCookie = await db.loadSession();
      if (sessionCookie) {
        logger.info('Loaded saved session from database');
      } else {
        logger.debug('No saved session found');
      }
      dbReady = true;
      resolve();
    }, 100);
  });
}

appConfig.loadConfig();
initializeDatabase().then(() => {
  logger.info('Database initialization complete');
});

app.get('/api/status', (req, res) => {
  res.json({ 
    status: 'running', 
    authenticated: !!sessionCookie,
    timestamp: new Date().toISOString()
  });
});

app.post('/api/auth/login', async (req, res) => {
  try {
    const cookie = await authService.login();
    sessionCookie = cookie;
    await db.saveSession(cookie);
    logger.info('Session saved to database');
    res.json({ success: true, authenticated: true });
  } catch (error) {
    logger.error('Login error:', error);
    res.status(500).json({ success: false, error: error.message });
  }
});

app.get('/api/classes', async (req, res) => {
  try {
    if (!sessionCookie) {
      sessionCookie = await authService.login();
      await db.saveSession(sessionCookie);
      logger.info('Session saved to database');
    }
    
    const { startDate, endDate, locationId } = req.query;
    const classes = await classService.fetchClasses(sessionCookie, { startDate, endDate, locationId });
    
    if (classes.length > 0) {
      logger.debug('Sample class data (first item):', {
        id: classes[0].id,
        serviceName: classes[0].serviceName,
        locationId: classes[0].locationId,
        locationName: classes[0].locationName,
        trainerId: classes[0].trainerId,
        trainerName: classes[0].trainerName
      });
    }
    
    const trackedClasses = await db.getAllTrackedClasses();
    
    classes.forEach(cls => {
      const classDate = new Date(cls.startTime);
      const dayOfWeek = classDate.toLocaleDateString('en-US', { weekday: 'long' });
      const startTime = classDate.toTimeString().substring(0, 5);
      
      const isTracked = trackedClasses.some(tracked => {
        return tracked.service_id === cls.serviceId &&
               tracked.location_id === cls.locationId &&
               tracked.day_of_week === dayOfWeek &&
               tracked.start_time === startTime;
      });
      
      cls.isTracked = isTracked;
    });
    
    res.json(classes);
  } catch (error) {
    logger.error('Fetch classes error:', error);
    if (error.message.includes('401') || error.response?.status === 401) {
      sessionCookie = null;
      await db.clearSession();
      logger.info('Session cleared from database');
    }
    res.status(500).json({ error: error.message });
  }
});

app.get('/api/tracked-classes', async (req, res) => {
  try {
    const classes = await db.getAllTrackedClasses();
    res.json(classes);
  } catch (error) {
    logger.error('Get tracked classes error:', error);
    res.status(500).json({ error: error.message });
  }
});

app.post('/api/tracked-classes/preview', async (req, res) => {
  try {
    if (!sessionCookie) {
      sessionCookie = await authService.login();
      await db.saveSession(sessionCookie);
    }
    
    const { 
      serviceId, trainerId, locationId, locationName, dayOfWeek, startTime, 
      matchTrainer, matchExactTime, timeTolerance 
    } = req.body;
    
    logger.debug('Preview request params:', {
      serviceId, trainerId, locationId, locationName, dayOfWeek, startTime,
      matchTrainer, matchExactTime, timeTolerance
    });
    
    const startDate = new Date();
    const endDate = new Date(Date.now() + 30 * 24 * 60 * 60 * 1000);
    
    // Don't apply location filter at API level - let client-side filtering handle it
    // This avoids issues with child location IDs (e.g., location 36 is Poyner Studio 2,
    // but the API only recognizes parent location 24 for Poyner YMCA)
    const classes = await classService.fetchClasses(sessionCookie, { 
      startDate: startDate.toISOString().split('T')[0], 
      endDate: endDate.toISOString().split('T')[0],
      skipLocationFilter: true
    });
    
    logger.debug(`Fetched ${classes.length} classes from API with verified enrollment status`);
    
    if (classes.length > 0) {
      logger.debug('Sample class:', {
        serviceId: classes[0].serviceId,
        serviceName: classes[0].serviceName,
        locationId: classes[0].locationId,
        trainerId: classes[0].trainerId,
        startTime: classes[0].startTime,
        isJoined: classes[0].isJoined
      });
    }
    
    // First check: how many classes match just the serviceId
    const serviceMatches = classes.filter(cls => String(cls.serviceId) === String(serviceId));
    logger.debug(`Classes matching serviceId ${serviceId}: ${serviceMatches.length}`);
    
    const matchingClasses = classes.filter(cls => {
      // Use loose equality to handle string vs number comparison
      if (String(cls.serviceId) !== String(serviceId)) return false;
      
      // Match by locationId if available, otherwise fall back to locationName
      if (locationId && cls.locationId) {
        if (String(cls.locationId) !== String(locationId)) return false;
      } else if (locationName && cls.locationName) {
        if (cls.locationName !== locationName) return false;
      }
      
      const classDate = new Date(cls.startTime);
      const classDayOfWeek = classDate.toLocaleDateString('en-US', { weekday: 'long', timeZone: 'America/New_York' });
      if (classDayOfWeek !== dayOfWeek) return false;
      
      if (matchTrainer && String(cls.trainerId) !== String(trainerId)) return false;
      
      if (matchExactTime) {
        const classTime = classDate.toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit', hour12: false, timeZone: 'America/New_York' });
        logger.debug(`Comparing class time ${classTime} with target ${startTime}`);
        if (classTime !== startTime) return false;
      } else if (timeTolerance !== undefined && timeTolerance !== null) {
        // Apply time tolerance (can be 0 for exact match or higher for fuzzy match)
        const [targetHour, targetMin] = startTime.split(':').map(Number);
        const targetMinutes = targetHour * 60 + targetMin;
        const classMinutes = classDate.getHours() * 60 + classDate.getMinutes();
        const diff = Math.abs(classMinutes - targetMinutes);
        if (diff > timeTolerance) return false;
      }
      
      return true;
    });
    
    logger.debug(`Found ${matchingClasses.length} matching classes`);
    if (matchingClasses.length > 0) {
      logger.debug('First matching class:', JSON.stringify(matchingClasses[0], null, 2));
      logger.debug('isJoined status check:', matchingClasses.map(c => ({ id: c.id, isJoined: c.isJoined, canSignup: c.canSignup })));
    }
    res.json({ matchingClasses });
  } catch (error) {
    logger.error('Preview tracked classes error:', error);
    if (error.message.includes('401') || error.response?.status === 401) {
      sessionCookie = null;
      await db.clearSession();
    }
    res.status(500).json({ error: error.message });
  }
});

app.post('/api/tracked-classes', async (req, res) => {
  try {
    if (!dbReady) {
      return res.status(503).json({ error: 'Database not ready, please try again' });
    }

    const { 
      serviceId, serviceName, trainerId, trainerName, locationId, locationName, 
      dayOfWeek, startTime, matchTrainer, matchExactTime, timeTolerance, 
      autoSignup, signupHoursBefore 
    } = req.body;
    
    logger.debug('Add tracked class request:', {
      serviceId, serviceName, trainerId, trainerName, locationId, locationName,
      dayOfWeek, startTime, matchTrainer, matchExactTime, timeTolerance,
      autoSignup, signupHoursBefore
    });
    
    const id = await db.addTrackedClass({
      serviceId,
      serviceName,
      trainerId,
      trainerName,
      locationId,
      locationName,
      dayOfWeek,
      startTime,
      matchTrainer: matchTrainer !== undefined ? matchTrainer : true,
      matchExactTime: matchExactTime !== undefined ? matchExactTime : false,
      timeTolerance: timeTolerance || 15,
      autoSignup: autoSignup || false,
      signupHoursBefore: signupHoursBefore || parseInt(process.env.DEFAULT_SIGNUP_HOURS) || 46
    });
    
    logger.info('Successfully added tracked class with ID:', id);
    res.json({ success: true, id });
  } catch (error) {
    logger.error('Add tracked class error:', error);
    logger.error('Error stack:', error.stack);
    res.status(500).json({ error: error.message, stack: error.stack });
  }
});

app.put('/api/tracked-classes/:id', (req, res) => {
  try {
    const { id } = req.params;
    const { autoSignup, signupHoursBefore } = req.body;
    
    db.updateTrackedClass(id, { autoSignup, signupHoursBefore });
    res.json({ success: true });
  } catch (error) {
    logger.error('Update tracked class error:', error);
    res.status(500).json({ error: error.message });
  }
});

app.delete('/api/tracked-classes/:id', (req, res) => {
  try {
    const { id } = req.params;
    db.deleteTrackedClass(id);
    res.json({ success: true });
  } catch (error) {
    logger.error('Delete tracked class error:', error);
    res.status(500).json({ error: error.message });
  }
});

app.post('/api/signup/:occurrenceId', async (req, res) => {
  try {
    if (!sessionCookie) {
      sessionCookie = await authService.login();
      await db.saveSession(sessionCookie);
      logger.info('Session saved to database');
    }
    
    const { occurrenceId } = req.params;
    const { lock_version } = req.body;
    
    logger.info(`Signup request for occurrence ${occurrenceId}${lock_version !== undefined ? ` with lock_version: ${lock_version}` : ' (no lock_version provided)'}`);
    
    const result = await classService.signupForClass(sessionCookie, occurrenceId, lock_version);
    res.json({ success: true, result });
  } catch (error) {
    logger.error('Signup error:', error);
    if (error.message.includes('401') || error.response?.status === 401) {
      sessionCookie = null;
      await db.clearSession();
      logger.info('Session cleared from database');
    }
    res.status(500).json({ error: error.message });
  }
});

app.get('/api/my-bookings', async (req, res) => {
  try {
    if (!sessionCookie) {
      sessionCookie = await authService.login();
      await db.saveSession(sessionCookie);
      logger.info('Session saved to database');
    }
    
    const { includeActiveOnly, startDate, endDate, locationId } = req.query;
    const filters = {
      includeActiveOnly: includeActiveOnly === 'true',
      startDate,
      endDate,
      locationId: locationId ? parseInt(locationId) : undefined
    };
    
    const bookings = await classService.getMyBookings(sessionCookie, filters);
    res.json(bookings);
  } catch (error) {
    logger.error('Get bookings error:', error);
    if (error.message.includes('401') || error.response?.status === 401) {
      sessionCookie = null;
      await db.clearSession();
      logger.info('Session cleared from database');
    }
    res.status(500).json({ error: error.message });
  }
});

app.delete('/api/bookings/:occurrenceId', async (req, res) => {
  try {
    if (!sessionCookie) {
      sessionCookie = await authService.login();
      await db.saveSession(sessionCookie);
      logger.info('Session saved to database');
    }
    
    const { occurrenceId } = req.params;
    const result = await classService.cancelBooking(sessionCookie, occurrenceId);
    res.json({ success: true, result });
  } catch (error) {
    logger.error('Cancel booking error:', error);
    if (error.message.includes('401') || error.response?.status === 401) {
      sessionCookie = null;
      await db.clearSession();
      logger.info('Session cleared from database');
    }
    res.status(500).json({ error: error.message });
  }
});

app.get('/api/signup-logs', (req, res) => {
  try {
    const logs = db.getSignupLogs(50);
    res.json(logs);
  } catch (error) {
    logger.error('Get signup logs error:', error);
    res.status(500).json({ error: error.message });
  }
});

app.post('/api/class-profiles', async (req, res) => {
  try {
    if (!sessionCookie) {
      sessionCookie = await authService.login();
      await db.saveSession(sessionCookie);
      logger.info('Session saved to database');
    }
    
    const { occurrenceId, options } = req.body;
    
    const filterObj = {
      filter: [
        { by: 'status', with: ['Rescheduled', 'Scheduled', 'Reminded', 'Completed', 'Requested', 'Counted', 'Verified'] }
      ]
    };
    
    const jsonParam = encodeURIComponent(JSON.stringify(filterObj));
    const url = `https://ymca-triangle.fisikal.com/api/web/schedule/occurrences?all_service_categories=true&json=${jsonParam}`;
    
    const response = await classService.fetchClasses(sessionCookie);
    const occurrence = response.find(c => c.id === occurrenceId);
    
    if (!occurrence) {
      return res.status(404).json({ error: 'Class occurrence not found' });
    }
    
    const profile = classService.createClassProfile(occurrence, options);
    const id = db.addClassProfile(profile);
    
    res.json({ success: true, id, profile });
  } catch (error) {
    logger.error('Create class profile error:', error);
    res.status(500).json({ error: error.message });
  }
});

app.get('/api/class-profiles', (req, res) => {
  try {
    const profiles = db.getAllClassProfiles();
    res.json(profiles);
  } catch (error) {
    logger.error('Get class profiles error:', error);
    res.status(500).json({ error: error.message });
  }
});

app.delete('/api/class-profiles/:id', (req, res) => {
  try {
    const { id } = req.params;
    db.deleteClassProfile(id);
    res.json({ success: true });
  } catch (error) {
    logger.error('Delete class profile error:', error);
    res.status(500).json({ error: error.message });
  }
});

app.post('/api/auto-book/:profileId', async (req, res) => {
  try {
    if (!sessionCookie) {
      sessionCookie = await authService.login();
      await db.saveSession(sessionCookie);
      logger.info('Session saved to database');
    }
    
    const { profileId } = req.params;
    const { startDate, endDate, tryWaitlist } = req.body;
    
    const profile = db.getClassProfile(profileId);
    if (!profile) {
      return res.status(404).json({ error: 'Class profile not found' });
    }
    
    const result = await classService.autoBookClass(sessionCookie, profile, {
      startDate: startDate ? new Date(startDate) : undefined,
      endDate: endDate ? new Date(endDate) : undefined,
      tryWaitlist
    });
    
    if (result.success && result.booked) {
      db.addSignupLog({
        occurrenceId: result.class.id,
        serviceName: result.class.title,
        status: 'success',
        message: 'Auto-booked via profile',
        profileId
      });
    }
    
    res.json(result);
  } catch (error) {
    logger.error('Auto-book error:', error);
    res.status(500).json({ error: error.message });
  }
});

cron.schedule('*/5 * * * *', async () => {
  logger.debug('Running scheduler check...');
  try {
    if (!sessionCookie) {
      sessionCookie = await authService.login();
      await db.saveSession(sessionCookie);
      logger.info('Session saved to database');
    }
    await schedulerService.checkAndSignup(sessionCookie);
  } catch (error) {
    logger.error('Scheduler error:', error);
    if (error.message?.includes('401') || error.response?.status === 401) {
      sessionCookie = null;
      await db.clearSession();
      logger.info('Session cleared from database');
    } else {
      sessionCookie = null;
    }
  }
});

app.listen(PORT, () => {
  logger.info(`YMCA Auto-Signup server running on port ${PORT}`);
  logger.info(`Environment: ${process.env.NODE_ENV || 'development'}`);
  logger.info(`YMCA URL: ${process.env.YMCA_URL}`);
});
