require('dotenv').config();
const express = require('express');
const cors = require('cors');
const bodyParser = require('body-parser');
const session = require('express-session');
const crypto = require('crypto');
const cron = require('node-cron');
const logger = require('./logger');
const appConfig = require('./config');
const db = require('./database');
const authService = require('./services/authService');
const classService = require('./services/classService');
const schedulerService = require('./services/schedulerService');
const userAuthService = require('./services/userAuthService');
const calendarService = require('./services/calendarService');
const { requireAuth } = require('./middleware/auth');

const app = express();
const PORT = process.env.PORT || 3001;
const NODE_ENV = process.env.NODE_ENV || 'production';

let SESSION_SECRET = null;
let calendarToken = null;
let calendarCache = null;    // { occurrences: [...], generatedAt: Date }
const CALENDAR_CACHE_TTL = 5 * 60 * 1000; // 5 minutes

app.use(cors({
  origin: true,
  credentials: true
}));
app.use(bodyParser.json());

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
      
      // Load or generate SESSION_SECRET from database
      SESSION_SECRET = process.env.SESSION_SECRET || await db.getSessionSecret();
      if (!SESSION_SECRET) {
        SESSION_SECRET = crypto.randomBytes(32).toString('hex');
        await db.saveSessionSecret(SESSION_SECRET);
        logger.info('✓ Generated and saved new SESSION_SECRET to database for persistent sessions');
      } else if (!process.env.SESSION_SECRET) {
        logger.info('✓ Loaded SESSION_SECRET from database - sessions will persist across deployments');
      } else {
        logger.info('✓ Using SESSION_SECRET from environment variable');
      }
      
      // Load or generate calendar token
      calendarToken = await db.getCalendarToken();
      if (!calendarToken) {
        calendarToken = crypto.randomUUID();
        await db.saveCalendarToken(calendarToken);
        logger.info('Generated and saved new calendar subscription token');
      }

      dbReady = true;
      resolve();
    }, 100);
  });
}

async function startServer() {
  await initializeDatabase();
  logger.info('Database initialization complete');
  
  appConfig.setDatabase(db);
  await appConfig.loadConfig();
  logger.info('Configuration initialization complete');
  
  // Initialize session middleware after SESSION_SECRET is loaded
  app.use(session({
    secret: SESSION_SECRET,
    resave: false,
    saveUninitialized: false,
    cookie: {
      secure: process.env.NODE_ENV === 'production',
      httpOnly: true,
      maxAge: 7 * 24 * 60 * 60 * 1000
    }
  }));
  
  app.use(express.static('client/dist'));
  
  logger.info('Session middleware initialized');
  
  // Define routes AFTER session middleware is set up
  app.get('/health', (req, res) => {
    res.status(200).json({ status: 'ok', timestamp: new Date().toISOString() });
  });

  // Calendar subscription feed (public, token-authenticated)
  app.get('/cal/:token.ics', async (req, res) => {
    try {
      if (req.params.token !== calendarToken) {
        return res.status(404).send('Not found');
      }

      if (!sessionCookie) {
        try {
          sessionCookie = await authService.login();
          await db.saveSession(sessionCookie);
          logger.info('Session saved to database');
        } catch (loginErr) {
          logger.error('Calendar feed: failed to login:', loginErr.message);
          return res.status(503).send('Service unavailable');
        }
      }

      // Serve from cache if fresh
      const now = Date.now();
      if (!calendarCache || (now - calendarCache.generatedAt) > CALENDAR_CACHE_TTL) {
        // Refresh: fetch tracked classes and all occurrences
        const trackedClasses = await db.getAllTrackedClasses();

        const startDate = new Date().toISOString().split('T')[0];
        const endDate = new Date(now + 30 * 24 * 60 * 60 * 1000).toISOString().split('T')[0];
        const allOccurrences = await classService.fetchClasses(sessionCookie, {
          startDate,
          endDate,
          skipLocationFilter: true,
          verifyBookings: false
        });

        // Match each tracked class to occurrences, dedup by occurrence id
        const matchedById = new Map();
        for (const tracked of trackedClasses) {
          const matches = classService.matchTrackedClassToOccurrences(tracked, allOccurrences);
          for (const cls of matches) {
            if (!matchedById.has(cls.id)) {
              matchedById.set(cls.id, cls);
            }
          }
        }

        // Also fetch booked/waitlisted classes from the bookings API
        // The schedule API sometimes omits classes that the bookings API returns
        try {
          const bookingsResponse = await classService.getMyBookings(sessionCookie, {
            startDate: new Date().toISOString()
          });
          const rawBookings = bookingsResponse?.data || [];
          for (const b of rawBookings) {
            if (!b.is_joined && !b.is_waited) continue;
            const id = b.id;
            if (!matchedById.has(id)) {
              matchedById.set(id, {
                id,
                serviceName: b.service_title,
                startTime: b.occurs_at,
                duration: b.duration_in_minutes || 60,
                locationName: b.location_name,
                subLocationName: b.sub_location_name || null,
                trainerName: b.trainer_name,
                isJoined: b.is_joined,
                isWaited: b.is_waited,
                positionOnWaitingList: b.position_on_waiting_list,
              });
              logger.debug(`Added booked class from bookings API: ${b.service_title} (${id})`);
            }
          }
        } catch (bookingsError) {
          logger.warn('Failed to fetch bookings for calendar, continuing with tracked matches only:', bookingsError.message);
        }

        // Detect cancelled occurrences from signup logs
        const logs = await db.getSignupLogs(1000);
        const cancelledIds = new Set(
          logs.filter(l => l.status === 'cancelled').map(l => String(l.occurrence_id))
        );

        const occurrences = Array.from(matchedById.values()).map(cls => ({
          ...cls,
          isCancelled: cancelledIds.has(String(cls.id)) && !cls.isJoined && !cls.isWaited
        }));

        calendarCache = { occurrences, generatedAt: now };
        logger.debug(`Calendar cache refreshed: ${occurrences.length} occurrences from ${trackedClasses.length} tracked classes`);
      }

      const appUrl = `${req.protocol}://${req.get('host')}`;
      const icsContent = calendarService.generateCalendar(calendarCache.occurrences, appUrl);
      res.set('Content-Type', 'text/calendar; charset=utf-8');
      res.send(icsContent);
    } catch (error) {
      logger.error('Calendar feed error:', error.message);
      if (error.message?.includes('401') || error.response?.status === 401) {
        sessionCookie = null;
        await db.clearSession();
      }
      res.status(500).send('Internal server error');
    }
  });

  app.get('/api/auth/setup-status', async (req, res) => {
    try {
      const setupRequired = await userAuthService.isSetupRequired();
      res.json({ setupRequired });
    } catch (error) {
      logger.error('Setup status check error:', error);
      res.status(500).json({ error: error.message });
    }
  });

  app.post('/api/auth/setup', async (req, res) => {
    try {
      const { username, password } = req.body;
      
      if (!username || !password) {
        return res.status(400).json({ error: 'Username and password are required' });
      }
      
      await userAuthService.setupFirstUser(username, password);
      logger.info('First user setup completed');
      res.json({ success: true, message: 'Account created successfully' });
    } catch (error) {
      logger.error('Setup error:', error);
      res.status(400).json({ error: error.message });
    }
  });

  app.post('/api/auth/user-login', async (req, res) => {
    try {
      const { username, password } = req.body;
      
      if (!username || !password) {
        return res.status(400).json({ error: 'Username and password are required' });
      }
      
      const user = await userAuthService.authenticateUser(username, password);
      req.session.userId = user.id;
      req.session.username = user.username;
      
      logger.info(`User logged in: ${username}`);
      res.json({ success: true, user: { username: user.username } });
    } catch (error) {
      logger.error('User login error:', error);
      res.status(401).json({ error: error.message });
    }
  });

  app.post('/api/auth/logout', (req, res) => {
    const username = req.session?.username;
    req.session.destroy((err) => {
      if (err) {
        logger.error('Logout error:', err);
        return res.status(500).json({ error: 'Logout failed' });
      }
      logger.info(`User logged out: ${username}`);
      res.json({ success: true });
    });
  });

  app.get('/api/auth/session', async (req, res) => {
    try {
      const setupRequired = await userAuthService.isSetupRequired();
      
      if (setupRequired) {
        return res.json({ setupRequired: true, authenticated: false });
      }
      
      if (req.session && req.session.userId) {
        return res.json({ 
          authenticated: true, 
          setupRequired: false,
          user: { username: req.session.username }
        });
      }
      
      res.json({ authenticated: false, setupRequired: false });
    } catch (error) {
      logger.error('Session check error:', error);
      res.status(500).json({ error: error.message });
    }
  });

  app.get('/api/status', requireAuth, async (req, res) => {
    try {
      const status = { 
        status: 'running', 
        authenticated: !!sessionCookie,
        timestamp: new Date().toISOString()
      };
      
      if (sessionCookie) {
        try {
          const userData = await classService.getUserProfile(sessionCookie);
          status.user = userData;
        } catch (error) {
          logger.warn('Failed to fetch user profile:', error.message);
        }
      }
      
      res.json(status);
    } catch (error) {
      logger.error('Status error:', error);
      res.status(500).json({ error: error.message });
    }
  });

  app.post('/api/auth/login', requireAuth, async (req, res) => {
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

  app.get('/api/classes', requireAuth, async (req, res) => {
    try {
    if (!sessionCookie) {
      sessionCookie = await authService.login();
      await db.saveSession(sessionCookie);
      logger.info('Session saved to database');
    }
    
    const { startDate, endDate, locationId, limit, offset } = req.query;
    const classes = await classService.fetchClasses(sessionCookie, { 
      startDate, 
      endDate, 
      locationId,
      limit: limit ? parseInt(limit, 10) : undefined,  // OPTIMIZATION: Support pagination limit
      offset: offset ? parseInt(offset, 10) : undefined  // OPTIMIZATION: Support infinite scroll offset
    });
    
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

app.get('/api/tracked-classes', requireAuth, async (req, res) => {
  try {
    const trackedClasses = await db.getAllTrackedClasses();
    
    if (!sessionCookie) {
      sessionCookie = await authService.login();
      await db.saveSession(sessionCookie);
    }
    
    const startDate = new Date();
    const endDate = new Date(Date.now() + 30 * 24 * 60 * 60 * 1000);
    
    const upcomingClasses = await classService.fetchClasses(sessionCookie, { 
      startDate: startDate.toISOString().split('T')[0], 
      endDate: endDate.toISOString().split('T')[0],
      skipLocationFilter: true
    });
    
    const classesWithNextOccurrence = trackedClasses.map(tracked => {
      const matchingClasses = upcomingClasses.filter(cls => {
        if (String(cls.serviceId) !== String(tracked.service_id)) return false;
        
        if (tracked.location_id && cls.locationId) {
          if (String(cls.locationId) !== String(tracked.location_id)) return false;
        } else if (tracked.location_name && cls.locationName) {
          if (cls.locationName !== tracked.location_name) return false;
        }
        
        const classDate = new Date(cls.startTime);
        const classDayOfWeek = classDate.toLocaleDateString('en-US', { weekday: 'long', timeZone: 'America/New_York' });
        if (classDayOfWeek !== tracked.day_of_week) return false;
        
        if (tracked.match_trainer === 1 && String(cls.trainerId) !== String(tracked.trainer_id)) return false;
        
        if (tracked.match_exact_time === 1) {
          const classTime = classDate.toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit', hour12: false, timeZone: 'America/New_York' });
          if (classTime !== tracked.start_time) return false;
        } else if (tracked.time_tolerance !== undefined && tracked.time_tolerance !== null) {
          const [targetHour, targetMin] = tracked.start_time.split(':').map(Number);
          const targetMinutes = targetHour * 60 + targetMin;
          const classTimeET = classDate.toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit', hour12: false, timeZone: 'America/New_York' });
          const [clsHour, clsMin] = classTimeET.split(':').map(Number);
          const classMinutes = clsHour * 60 + clsMin;
          const diff = Math.abs(classMinutes - targetMinutes);
          if (diff > tracked.time_tolerance) return false;
        }

        return true;
      });

      matchingClasses.sort((a, b) => new Date(a.startTime) - new Date(b.startTime));

      return {
        ...tracked,
        next_occurrence: matchingClasses.length > 0 ? matchingClasses[0].startTime : null
      };
    });
    
    res.json(classesWithNextOccurrence);
  } catch (error) {
    logger.error('Get tracked classes error:', error);
    if (error.message.includes('401') || error.response?.status === 401) {
      sessionCookie = null;
      await db.clearSession();
    }
    res.status(500).json({ error: error.message });
  }
});

app.post('/api/tracked-classes/preview', requireAuth, async (req, res) => {
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
    
    // OPTIMIZATION: Use API-level filtering to dramatically reduce payload size
    // Instead of fetching ALL classes and filtering client-side, we filter by service_id at the API
    // This reduces the response from potentially 500+ classes to just 5-20 matching occurrences
    const fetchParams = {
      startDate: startDate.toISOString().split('T')[0], 
      endDate: endDate.toISOString().split('T')[0],
      serviceIds: [serviceId],  // OPTIMIZATION: Only fetch this specific service
      skipLocationFilter: true   // Keep this to avoid sub-location issues
    };
    
    // OPTIMIZATION: If matching specific trainer, add trainer filter to API call
    if (matchTrainer && trainerId) {
      fetchParams.trainerIds = [trainerId];
      logger.debug(`Optimized preview: Filtering by service ${serviceId} and trainer ${trainerId}`);
    } else {
      logger.debug(`Optimized preview: Filtering by service ${serviceId} only`);
    }
    
    const classes = await classService.fetchClasses(sessionCookie, fetchParams);
    
    logger.debug(`Optimized fetch: Retrieved ${classes.length} classes (filtered by service_id at API level)`);
    
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
        const classTimeET = classDate.toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit', hour12: false, timeZone: 'America/New_York' });
        const [clsHour, clsMin] = classTimeET.split(':').map(Number);
        const classMinutes = clsHour * 60 + clsMin;
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

app.post('/api/tracked-classes', requireAuth, async (req, res) => {
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
    
    const config = appConfig.getConfig();
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
      signupHoursBefore: signupHoursBefore || config.scheduler.defaultSignupHoursBefore || 46
    });
    
    logger.info('Successfully added tracked class with ID:', id);
    res.json({ success: true, id });
  } catch (error) {
    logger.error('Add tracked class error:', error);
    logger.error('Error stack:', error.stack);
    res.status(500).json({ error: error.message, stack: error.stack });
  }
});

app.put('/api/tracked-classes/:id', requireAuth, (req, res) => {
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

app.delete('/api/tracked-classes/:id', requireAuth, (req, res) => {
  try {
    const { id } = req.params;
    db.deleteTrackedClass(id);
    res.json({ success: true });
  } catch (error) {
    logger.error('Delete tracked class error:', error);
    res.status(500).json({ error: error.message });
  }
});

app.post('/api/signup/:occurrenceId', requireAuth, async (req, res) => {
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

app.post('/api/waitlist/:occurrenceId', requireAuth, async (req, res) => {
  try {
    if (!sessionCookie) {
      sessionCookie = await authService.login();
      await db.saveSession(sessionCookie);
      logger.info('Session saved to database');
    }

    const { occurrenceId } = req.params;

    logger.info(`Waitlist join request for occurrence ${occurrenceId}`);

    const result = await classService.joinWaitlist(sessionCookie, occurrenceId);
    res.json({ success: true, result });
  } catch (error) {
    logger.error('Waitlist join error:', error);
    if (error.message.includes('401') || error.response?.status === 401) {
      sessionCookie = null;
      await db.clearSession();
      logger.info('Session cleared from database');
    }

    // Return specific error messages for known error codes
    if (error.code === 'WAITLIST_FULL') {
      return res.status(422).json({ error: 'The waitlist for this class is full', code: 'WAITLIST_FULL' });
    }
    if (error.code === 'ALREADY_ON_WAITLIST') {
      return res.status(409).json({ error: 'You are already on the waitlist for this class', code: 'ALREADY_ON_WAITLIST' });
    }
    if (error.code === 'WAITLIST_NOT_AVAILABLE') {
      return res.status(404).json({ error: 'Waitlist is not available for this class', code: 'WAITLIST_NOT_AVAILABLE' });
    }

    res.status(500).json({ error: error.message });
  }
});

app.get('/api/my-bookings', requireAuth, async (req, res) => {
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

app.delete('/api/bookings/:occurrenceId', requireAuth, async (req, res) => {
  try {
    if (!sessionCookie) {
      sessionCookie = await authService.login();
      await db.saveSession(sessionCookie);
      logger.info('Session saved to database');
    }

    const { occurrenceId } = req.params;
    const result = await classService.cancelBooking(sessionCookie, occurrenceId);

    // Log the cancellation so the scheduler knows not to re-book this class
    await db.addSignupLog({
      occurrenceId: occurrenceId,
      serviceName: 'Cancelled booking',
      trainerName: null,
      locationName: null,
      classTime: null,
      status: 'cancelled',
      errorMessage: 'User cancelled booking'
    });
    logger.info(`Logged cancellation for occurrence ${occurrenceId} to prevent re-booking`);

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

app.delete('/api/waitlist/:occurrenceId', requireAuth, async (req, res) => {
  try {
    if (!sessionCookie) {
      sessionCookie = await authService.login();
      await db.saveSession(sessionCookie);
      logger.info('Session saved to database');
    }

    const { occurrenceId } = req.params;
    const result = await classService.leaveWaitlist(sessionCookie, occurrenceId);

    // Log the cancellation so the scheduler knows not to re-book this class
    await db.addSignupLog({
      occurrenceId: occurrenceId,
      serviceName: 'Left waitlist',
      trainerName: null,
      locationName: null,
      classTime: null,
      status: 'cancelled',
      errorMessage: 'User left waitlist'
    });
    logger.info(`Logged waitlist departure for occurrence ${occurrenceId} to prevent re-booking`);

    res.json({ success: true, result });
  } catch (error) {
    logger.error('Leave waitlist error:', error);
    if (error.message.includes('401') || error.response?.status === 401) {
      sessionCookie = null;
      await db.clearSession();
      logger.info('Session cleared from database');
    }
    res.status(500).json({ error: error.message });
  }
});

app.get('/api/signup-logs', requireAuth, (req, res) => {
  try {
    const logs = db.getSignupLogs(50);
    res.json(logs);
  } catch (error) {
    logger.error('Get signup logs error:', error);
    res.status(500).json({ error: error.message });
  }
});

app.get('/api/settings', requireAuth, async (req, res) => {
  try {
    const config = appConfig.getConfig();
    res.json(config);
  } catch (error) {
    logger.error('Get settings error:', error);
    res.status(500).json({ error: error.message });
  }
});

app.put('/api/settings', requireAuth, async (req, res) => {
  try {
    const { preferredLocations, scheduler, classFetch, waitlistLimit } = req.body;

    const updatedConfig = await appConfig.updateConfig({
      preferredLocations,
      scheduler,
      classFetch,
      waitlistLimit
    });

    res.json({ success: true, config: updatedConfig });
  } catch (error) {
    logger.error('Update settings error:', error);
    res.status(500).json({ error: error.message });
  }
});

app.get('/api/credentials/status', requireAuth, async (req, res) => {
  try {
    const hasCredentials = await db.hasCredentials();
    const hasEnvCredentials = !!(process.env.YMCA_EMAIL && process.env.YMCA_PASSWORD);
    res.json({ 
      configured: hasCredentials || hasEnvCredentials,
      source: hasCredentials ? 'database' : (hasEnvCredentials ? 'environment' : 'none')
    });
  } catch (error) {
    logger.error('Get credentials status error:', error);
    res.status(500).json({ error: error.message });
  }
});

app.put('/api/credentials', requireAuth, async (req, res) => {
  try {
    const { email, password } = req.body;
    
    if (!email || !password) {
      return res.status(400).json({ error: 'Email and password are required' });
    }
    
    await db.saveCredentials({ email, password });
    
    sessionCookie = null;
    await db.clearSession();
    
    logger.info('Credentials updated successfully');
    res.json({ success: true });
  } catch (error) {
    logger.error('Update credentials error:', error);
    res.status(500).json({ error: error.message });
  }
});

app.get('/api/calendar-token', requireAuth, (req, res) => {
    res.json({ token: calendarToken });
  });

  app.post('/api/calendar-token/regenerate', requireAuth, async (req, res) => {
    try {
      calendarToken = crypto.randomUUID();
      await db.saveCalendarToken(calendarToken);
      logger.info('Calendar token regenerated');
      res.json({ token: calendarToken });
    } catch (error) {
      logger.error('Regenerate calendar token error:', error);
      res.status(500).json({ error: error.message });
    }
  });

  app.get('/api/class/:occurrenceId', requireAuth, async (req, res) => {
    try {
      if (!sessionCookie) {
        sessionCookie = await authService.login();
        await db.saveSession(sessionCookie);
        logger.info('Session saved to database');
      }

      const { occurrenceId } = req.params;
      const details = await classService.getOccurrenceDetails(sessionCookie, occurrenceId);

      if (!details || !details.occurrence) {
        return res.status(404).json({ error: 'Class not found' });
      }

      const occurrence = details.occurrence;
      const appConfig = require('./config').getConfig();
      const now = new Date();
      const startTime = occurrence.occurs_at || occurrence.start_time;
      const classStartTime = new Date(startTime);
      const duration = occurrence.duration_in_minutes || occurrence.duration || 0;
      const restrictHours = occurrence.restrict_to_book_in_advance_time_in_hours || 0;
      const bookingWindowOpen = restrictHours === 0 ||
        (classStartTime.getTime() - now.getTime()) <= (restrictHours * 60 * 60 * 1000);

      const spotsTotal = occurrence.service_group_size || 0;
      const attendedCount = occurrence.attended_clients_count || 0;
      const spotsAvailable = Math.max(0, spotsTotal - attendedCount);

      const canSignup = !occurrence.is_joined &&
                       !occurrence.full_group &&
                       bookingWindowOpen &&
                       now < classStartTime &&
                       (occurrence.status === 'Scheduled' || occurrence.status === 'Rescheduled');

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

      res.json({
        id: occurrence.id,
        serviceId: occurrence.service_id || occurrence.service?.id,
        serviceName: occurrence.service_title || occurrence.service?.name,
        trainerId: occurrence.trainer_id || occurrence.trainer?.id,
        trainerName: occurrence.trainer_name || occurrence.trainer?.name,
        locationId: occurrence.location_id || occurrence.location?.id,
        locationName: occurrence.location_name || occurrence.location?.name,
        startTime,
        duration,
        spotsAvailable,
        spotsTotal,
        status: occurrence.status,
        isJoined: occurrence.is_joined,
        isWaited: occurrence.is_waited,
        fullGroup: occurrence.full_group,
        waitingListEnabled: occurrence.waiting_list_enabled,
        positionOnWaitingList: occurrence.position_on_waiting_list,
        totalOnWaitingList: occurrence.total_on_waiting_list,
        canSignup,
        canJoinWaitlist,
        lock_version: occurrence.lock_version,
        restrictToBookInAdvanceHours: restrictHours
      });
    } catch (error) {
      logger.error('Get class details error:', error);
      if (error.message?.includes('401') || error.response?.status === 401) {
        sessionCookie = null;
        await db.clearSession();
      }
      res.status(500).json({ error: error.message });
    }
  });

  app.post('/api/class-profiles', requireAuth, async (req, res) => {
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

app.get('/api/class-profiles', requireAuth, (req, res) => {
  try {
    const profiles = db.getAllClassProfiles();
    res.json(profiles);
  } catch (error) {
    logger.error('Get class profiles error:', error);
    res.status(500).json({ error: error.message });
  }
});

app.delete('/api/class-profiles/:id', requireAuth, (req, res) => {
  try {
    const { id } = req.params;
    db.deleteClassProfile(id);
    res.json({ success: true });
  } catch (error) {
    logger.error('Delete class profile error:', error);
    res.status(500).json({ error: error.message });
  }
});

app.post('/api/auto-book/:profileId', requireAuth, async (req, res) => {
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

  // Generate a random offset (0-59 seconds) on startup to stagger signup attempts
  // across different instances of the app, reducing competition for popular classes
  const schedulerOffsetSeconds = Math.floor(Math.random() * 60);
  logger.info(`Scheduler configured with ${schedulerOffsetSeconds}s random offset to reduce signup competition`);

  // Setup cron schedule
  cron.schedule('*/5 * * * *', async () => {
    // Wait for the random offset before running
    if (schedulerOffsetSeconds > 0) {
      logger.debug(`Waiting ${schedulerOffsetSeconds}s (random offset)...`);
      await new Promise(resolve => setTimeout(resolve, schedulerOffsetSeconds * 1000));
    }
    logger.debug('Running scheduler check...');
    try {
      const hasCredentials = await db.hasCredentials();
      const hasEnvCredentials = !!(process.env.YMCA_EMAIL && process.env.YMCA_PASSWORD);
      
      if (!hasCredentials && !hasEnvCredentials) {
        logger.debug('Skipping scheduler: No YMCA credentials configured yet');
        return;
      }
      
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
}

startServer().then(() => {
  app.listen(PORT, '0.0.0.0', () => {
    logger.info(`YMCA Auto-Signup server running on port ${PORT}`);
    logger.info(`Environment: ${NODE_ENV}`);
    logger.info(`YMCA URL: ${process.env.YMCA_URL || 'https://ymca-triangle.fisikal.com'}`);
  });
}).catch(error => {
  logger.error('Failed to start server:', error);
  process.exit(1);
});
