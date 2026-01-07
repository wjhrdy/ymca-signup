const sqlite3 = require('sqlite3').verbose();
const logger = require('./logger');
const path = require('path');

const dbPath = path.join(__dirname, '..', 'data', 'database.db');
let db;

function initialize() {
  db = new sqlite3.Database(dbPath, (err) => {
    if (err) {
      logger.error('Error opening database:', err);
    } else {
      logger.info('Connected to SQLite database');
      createTables();
    }
  });
}

function createTables() {
  db.serialize(() => {
    db.run(`
      CREATE TABLE IF NOT EXISTS tracked_classes (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        service_id TEXT NOT NULL,
        service_name TEXT NOT NULL,
        trainer_id TEXT,
        trainer_name TEXT,
        location_id TEXT,
        location_name TEXT NOT NULL,
        day_of_week TEXT,
        start_time TEXT,
        match_trainer BOOLEAN DEFAULT 1,
        match_exact_time BOOLEAN DEFAULT 0,
        time_tolerance INTEGER DEFAULT 15,
        auto_signup BOOLEAN DEFAULT 0,
        signup_hours_before INTEGER DEFAULT 46,
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP
      )
    `);

    db.run(`
      CREATE TABLE IF NOT EXISTS _schema_version (
        version INTEGER PRIMARY KEY,
        applied_at DATETIME DEFAULT CURRENT_TIMESTAMP
      )
    `);

    db.get(`SELECT name FROM sqlite_master WHERE type='table' AND name='tracked_classes'`, (err, row) => {
      if (row) {
        db.all(`PRAGMA table_info(tracked_classes)`, (err, columns) => {
          if (!err) {
            const columnNames = columns.map(col => col.name);
            const locationIdColumn = columns.find(col => col.name === 'location_id');
            
            // Check if location_id has NOT NULL constraint (notnull === 1)
            if (locationIdColumn && locationIdColumn.notnull === 1) {
              logger.info('Migrating tracked_classes table to make location_id nullable...');
              
              // SQLite doesn't support DROP CONSTRAINT, so we need to recreate the table
              db.serialize(() => {
                db.run(`ALTER TABLE tracked_classes RENAME TO tracked_classes_old`);
                
                db.run(`
                  CREATE TABLE tracked_classes (
                    id INTEGER PRIMARY KEY AUTOINCREMENT,
                    service_id TEXT NOT NULL,
                    service_name TEXT NOT NULL,
                    trainer_id TEXT,
                    trainer_name TEXT,
                    location_id TEXT,
                    location_name TEXT NOT NULL,
                    day_of_week TEXT,
                    start_time TEXT,
                    match_trainer BOOLEAN DEFAULT 1,
                    match_exact_time BOOLEAN DEFAULT 0,
                    time_tolerance INTEGER DEFAULT 15,
                    auto_signup BOOLEAN DEFAULT 0,
                    signup_hours_before INTEGER DEFAULT 46,
                    created_at DATETIME DEFAULT CURRENT_TIMESTAMP
                  )
                `);
                
                db.run(`
                  INSERT INTO tracked_classes 
                  SELECT * FROM tracked_classes_old
                `);
                
                db.run(`DROP TABLE tracked_classes_old`, () => {
                  logger.info('Migration complete: location_id is now nullable');
                });
              });
            } else {
              // Add missing columns if needed
              const requiredColumns = ['match_trainer', 'match_exact_time', 'time_tolerance', 'auto_signup', 'signup_hours_before'];
              const missingColumns = requiredColumns.filter(col => !columnNames.includes(col));
              
              if (missingColumns.length > 0) {
                logger.info('Missing columns detected, adding them:', missingColumns);
                if (!columnNames.includes('match_trainer')) {
                  db.run(`ALTER TABLE tracked_classes ADD COLUMN match_trainer BOOLEAN DEFAULT 1`);
                }
                if (!columnNames.includes('match_exact_time')) {
                  db.run(`ALTER TABLE tracked_classes ADD COLUMN match_exact_time BOOLEAN DEFAULT 0`);
                }
                if (!columnNames.includes('time_tolerance')) {
                  db.run(`ALTER TABLE tracked_classes ADD COLUMN time_tolerance INTEGER DEFAULT 15`);
                }
                if (!columnNames.includes('auto_signup')) {
                  db.run(`ALTER TABLE tracked_classes ADD COLUMN auto_signup BOOLEAN DEFAULT 0`);
                }
                if (!columnNames.includes('signup_hours_before')) {
                  db.run(`ALTER TABLE tracked_classes ADD COLUMN signup_hours_before INTEGER DEFAULT 46`);
                }
              }
            }
          }
        });
      }
    });

    db.run(`
      CREATE TABLE IF NOT EXISTS signup_logs (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        occurrence_id TEXT NOT NULL,
        service_name TEXT NOT NULL,
        trainer_name TEXT,
        location_name TEXT,
        class_time DATETIME,
        signup_time DATETIME DEFAULT CURRENT_TIMESTAMP,
        status TEXT,
        error_message TEXT
      )
    `);

    db.run(`
      CREATE TABLE IF NOT EXISTS class_profiles (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        service_id TEXT NOT NULL,
        service_title TEXT NOT NULL,
        location_id TEXT NOT NULL,
        location_name TEXT NOT NULL,
        day_of_week INTEGER NOT NULL,
        time TEXT NOT NULL,
        duration_minutes INTEGER,
        match_trainer BOOLEAN DEFAULT 0,
        trainer_id TEXT,
        trainer_name TEXT,
        match_exact_time BOOLEAN DEFAULT 0,
        time_tolerance_minutes INTEGER DEFAULT 15,
        match_sub_location BOOLEAN DEFAULT 0,
        sub_location_name TEXT,
        auto_book BOOLEAN DEFAULT 1,
        enabled BOOLEAN DEFAULT 1,
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP
      )
    `);

    db.run(`
      CREATE TABLE IF NOT EXISTS session_data (
        id INTEGER PRIMARY KEY CHECK (id = 1),
        session_cookie TEXT,
        updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
      )
    `);
    
    db.run(`
      CREATE TABLE IF NOT EXISTS client_settings (
        id INTEGER PRIMARY KEY CHECK (id = 1),
        client_id INTEGER,
        updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
      )
    `);
    
    db.run(`
      CREATE TABLE IF NOT EXISTS app_settings (
        id INTEGER PRIMARY KEY CHECK (id = 1),
        preferred_locations TEXT,
        check_interval_minutes INTEGER,
        default_signup_hours_before INTEGER,
        default_days_ahead INTEGER,
        max_classes_per_fetch INTEGER,
        updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
      )
    `);
    
    db.run(`
      CREATE TABLE IF NOT EXISTS credentials (
        id INTEGER PRIMARY KEY CHECK (id = 1),
        ymca_email TEXT,
        ymca_password TEXT,
        updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
      )
    `);
    
    db.run(`
      CREATE TABLE IF NOT EXISTS users (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        username TEXT UNIQUE NOT NULL,
        password_hash TEXT NOT NULL,
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        last_login DATETIME
      )
    `);
  });
}

function getAllTrackedClasses() {
  return new Promise((resolve, reject) => {
    db.all('SELECT * FROM tracked_classes ORDER BY day_of_week, start_time', (err, rows) => {
      if (err) reject(err);
      else resolve(rows);
    });
  });
}

function addTrackedClass(classData) {
  return new Promise((resolve, reject) => {
    if (!db) {
      return reject(new Error('Database not initialized'));
    }

    logger.debug('Database addTrackedClass called with:', classData);

    const stmt = db.prepare(`
      INSERT INTO tracked_classes 
      (service_id, service_name, trainer_id, trainer_name, location_id, location_name, day_of_week, start_time, match_trainer, match_exact_time, time_tolerance, auto_signup, signup_hours_before)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `);

    stmt.run(
      classData.serviceId,
      classData.serviceName,
      classData.trainerId,
      classData.trainerName,
      classData.locationId,
      classData.locationName,
      classData.dayOfWeek,
      classData.startTime,
      classData.matchTrainer ? 1 : 0,
      classData.matchExactTime ? 1 : 0,
      classData.timeTolerance || 15,
      classData.autoSignup ? 1 : 0,
      classData.signupHoursBefore
    , function(err) {
      if (err) {
        logger.error('Database insert error:', err);
        stmt.finalize();
        reject(err);
      } else {
        const lastID = this.lastID;
        logger.debug('Successfully inserted tracked class with ID:', lastID);
        stmt.finalize();
        resolve(lastID);
      }
    });
  });
}

function updateTrackedClass(id, updates) {
  return new Promise((resolve, reject) => {
    const fields = [];
    const values = [];

    if (updates.autoSignup !== undefined) {
      fields.push('auto_signup = ?');
      values.push(updates.autoSignup ? 1 : 0);
    }
    if (updates.signupHoursBefore !== undefined) {
      fields.push('signup_hours_before = ?');
      values.push(updates.signupHoursBefore);
    }

    values.push(id);

    const sql = `UPDATE tracked_classes SET ${fields.join(', ')} WHERE id = ?`;
    
    db.run(sql, values, (err) => {
      if (err) reject(err);
      else resolve();
    });
  });
}

function deleteTrackedClass(id) {
  return new Promise((resolve, reject) => {
    db.run('DELETE FROM tracked_classes WHERE id = ?', [id], (err) => {
      if (err) reject(err);
      else resolve();
    });
  });
}

function addSignupLog(logData) {
  return new Promise((resolve, reject) => {
    const stmt = db.prepare(`
      INSERT INTO signup_logs 
      (occurrence_id, service_name, trainer_name, location_name, class_time, status, error_message)
      VALUES (?, ?, ?, ?, ?, ?, ?)
    `);

    stmt.run(
      logData.occurrenceId,
      logData.serviceName,
      logData.trainerName,
      logData.locationName,
      logData.classTime,
      logData.status,
      logData.errorMessage
    , function(err) {
      if (err) reject(err);
      else resolve(this.lastID);
    });

    stmt.finalize();
  });
}

function getSignupLogs(limit = 50) {
  return new Promise((resolve, reject) => {
    db.all(
      'SELECT * FROM signup_logs ORDER BY signup_time DESC LIMIT ?',
      [limit],
      (err, rows) => {
        if (err) reject(err);
        else resolve(rows);
      }
    );
  });
}

function addClassProfile(profile) {
  return new Promise((resolve, reject) => {
    const stmt = db.prepare(`
      INSERT INTO class_profiles 
      (service_id, service_title, location_id, location_name, day_of_week, time, duration_minutes,
       match_trainer, trainer_id, trainer_name, match_exact_time, time_tolerance_minutes,
       match_sub_location, sub_location_name, auto_book, enabled)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `);

    stmt.run(
      profile.serviceId,
      profile.serviceTitle,
      profile.locationId,
      profile.locationName,
      profile.dayOfWeek,
      profile.time,
      profile.durationMinutes,
      profile.matchTrainer ? 1 : 0,
      profile.trainerId,
      profile.trainerName,
      profile.matchExactTime ? 1 : 0,
      profile.timeToleranceMinutes,
      profile.matchSubLocation ? 1 : 0,
      profile.subLocationName,
      1,
      1
    , function(err) {
      if (err) reject(err);
      else resolve(this.lastID);
    });

    stmt.finalize();
  });
}

function getAllClassProfiles() {
  return new Promise((resolve, reject) => {
    db.all('SELECT * FROM class_profiles WHERE enabled = 1 ORDER BY day_of_week, time', (err, rows) => {
      if (err) reject(err);
      else resolve(rows ? rows.map(row => ({
        id: row.id,
        serviceId: row.service_id,
        serviceTitle: row.service_title,
        locationId: row.location_id,
        locationName: row.location_name,
        dayOfWeek: row.day_of_week,
        time: row.time,
        durationMinutes: row.duration_minutes,
        matchTrainer: !!row.match_trainer,
        trainerId: row.trainer_id,
        trainerName: row.trainer_name,
        matchExactTime: !!row.match_exact_time,
        timeToleranceMinutes: row.time_tolerance_minutes,
        matchSubLocation: !!row.match_sub_location,
        subLocationName: row.sub_location_name,
        autoBook: !!row.auto_book,
        enabled: !!row.enabled,
        createdAt: row.created_at
      })) : []);
    });
  });
}

function getClassProfile(id) {
  return new Promise((resolve, reject) => {
    db.get('SELECT * FROM class_profiles WHERE id = ?', [id], (err, row) => {
      if (err) reject(err);
      else if (!row) resolve(null);
      else resolve({
        id: row.id,
        serviceId: row.service_id,
        serviceTitle: row.service_title,
        locationId: row.location_id,
        locationName: row.location_name,
        dayOfWeek: row.day_of_week,
        time: row.time,
        durationMinutes: row.duration_minutes,
        matchTrainer: !!row.match_trainer,
        trainerId: row.trainer_id,
        trainerName: row.trainer_name,
        matchExactTime: !!row.match_exact_time,
        timeToleranceMinutes: row.time_tolerance_minutes,
        matchSubLocation: !!row.match_sub_location,
        subLocationName: row.sub_location_name,
        autoBook: !!row.auto_book,
        enabled: !!row.enabled,
        createdAt: row.created_at
      });
    });
  });
}

function deleteClassProfile(id) {
  return new Promise((resolve, reject) => {
    db.run('UPDATE class_profiles SET enabled = 0 WHERE id = ?', [id], (err) => {
      if (err) reject(err);
      else resolve();
    });
  });
}

function updateClassProfile(id, updates) {
  return new Promise((resolve, reject) => {
    const fields = [];
    const values = [];

    if (updates.autoBook !== undefined) {
      fields.push('auto_book = ?');
      values.push(updates.autoBook ? 1 : 0);
    }
    if (updates.enabled !== undefined) {
      fields.push('enabled = ?');
      values.push(updates.enabled ? 1 : 0);
    }
    if (updates.timeToleranceMinutes !== undefined) {
      fields.push('time_tolerance_minutes = ?');
      values.push(updates.timeToleranceMinutes);
    }

    if (fields.length === 0) {
      return resolve();
    }

    values.push(id);

    const sql = `UPDATE class_profiles SET ${fields.join(', ')} WHERE id = ?`;
    
    db.run(sql, values, (err) => {
      if (err) reject(err);
      else resolve();
    });
  });
}

function saveSession(sessionCookie) {
  return new Promise((resolve, reject) => {
    db.run(
      `INSERT OR REPLACE INTO session_data (id, session_cookie, updated_at) VALUES (1, ?, CURRENT_TIMESTAMP)`,
      [sessionCookie],
      (err) => {
        if (err) reject(err);
        else resolve();
      }
    );
  });
}

function loadSession() {
  return new Promise((resolve, reject) => {
    db.get('SELECT session_cookie FROM session_data WHERE id = 1', (err, row) => {
      if (err) reject(err);
      else resolve(row?.session_cookie || null);
    });
  });
}

function clearSession() {
  return new Promise((resolve, reject) => {
    db.run('DELETE FROM session_data WHERE id = 1', (err) => {
      if (err) reject(err);
      else resolve();
    });
  });
}

function saveClientId(clientId) {
  return new Promise((resolve, reject) => {
    db.run(
      `INSERT INTO client_settings (id, client_id, updated_at)
       VALUES (1, ?, datetime('now'))
       ON CONFLICT(id) DO UPDATE SET
         client_id = excluded.client_id,
         updated_at = datetime('now')`,
      [clientId],
      (err) => {
        if (err) reject(err);
        else {
          logger.debug(`Saved client_id ${clientId} to database`);
          resolve();
        }
      }
    );
  });
}

function getClientId() {
  return new Promise((resolve, reject) => {
    db.get('SELECT client_id FROM client_settings WHERE id = 1', (err, row) => {
      if (err) reject(err);
      else resolve(row?.client_id || null);
    });
  });
}

function saveSettings(settings) {
  return new Promise((resolve, reject) => {
    const preferredLocations = Array.isArray(settings.preferredLocations) 
      ? JSON.stringify(settings.preferredLocations) 
      : settings.preferredLocations;
    
    db.run(
      `INSERT OR REPLACE INTO app_settings 
       (id, preferred_locations, check_interval_minutes, default_signup_hours_before, 
        default_days_ahead, max_classes_per_fetch, updated_at) 
       VALUES (1, ?, ?, ?, ?, ?, CURRENT_TIMESTAMP)`,
      [
        preferredLocations,
        settings.checkIntervalMinutes,
        settings.defaultSignupHoursBefore,
        settings.defaultDaysAhead,
        settings.maxClassesPerFetch
      ],
      (err) => {
        if (err) reject(err);
        else resolve();
      }
    );
  });
}

function loadSettings() {
  return new Promise((resolve, reject) => {
    db.get('SELECT * FROM app_settings WHERE id = 1', (err, row) => {
      if (err) reject(err);
      else if (!row) resolve(null);
      else {
        const settings = {
          preferredLocations: row.preferred_locations ? JSON.parse(row.preferred_locations) : [],
          checkIntervalMinutes: row.check_interval_minutes,
          defaultSignupHoursBefore: row.default_signup_hours_before,
          defaultDaysAhead: row.default_days_ahead,
          maxClassesPerFetch: row.max_classes_per_fetch
        };
        resolve(settings);
      }
    });
  });
}

function saveCredentials(credentials) {
  return new Promise((resolve, reject) => {
    db.run(
      `INSERT OR REPLACE INTO credentials 
       (id, ymca_email, ymca_password, updated_at) 
       VALUES (1, ?, ?, CURRENT_TIMESTAMP)`,
      [credentials.email, credentials.password],
      (err) => {
        if (err) reject(err);
        else resolve();
      }
    );
  });
}

function loadCredentials() {
  return new Promise((resolve, reject) => {
    db.get('SELECT ymca_email, ymca_password FROM credentials WHERE id = 1', (err, row) => {
      if (err) reject(err);
      else if (!row) resolve(null);
      else resolve({
        email: row.ymca_email,
        password: row.ymca_password
      });
    });
  });
}

function hasCredentials() {
  return new Promise((resolve, reject) => {
    db.get('SELECT ymca_email FROM credentials WHERE id = 1', (err, row) => {
      if (err) reject(err);
      else resolve(!!row && !!row.ymca_email);
    });
  });
}

function hasUsers() {
  return new Promise((resolve, reject) => {
    db.get('SELECT COUNT(*) as count FROM users', (err, row) => {
      if (err) reject(err);
      else resolve(row.count > 0);
    });
  });
}

function createUser(username, passwordHash) {
  return new Promise((resolve, reject) => {
    db.run(
      'INSERT INTO users (username, password_hash) VALUES (?, ?)',
      [username, passwordHash],
      function(err) {
        if (err) {
          if (err.message.includes('UNIQUE constraint')) {
            reject(new Error('Username already exists'));
          } else {
            reject(err);
          }
        } else {
          resolve(this.lastID);
        }
      }
    );
  });
}

function getUserByUsername(username) {
  return new Promise((resolve, reject) => {
    db.get('SELECT * FROM users WHERE username = ?', [username], (err, row) => {
      if (err) reject(err);
      else resolve(row || null);
    });
  });
}

function updateUserLogin(userId) {
  return new Promise((resolve, reject) => {
    db.run(
      'UPDATE users SET last_login = CURRENT_TIMESTAMP WHERE id = ?',
      [userId],
      (err) => {
        if (err) reject(err);
        else resolve();
      }
    );
  });
}

module.exports = {
  initialize,
  getAllTrackedClasses,
  addTrackedClass,
  updateTrackedClass,
  deleteTrackedClass,
  addSignupLog,
  getSignupLogs,
  addClassProfile,
  getAllClassProfiles,
  getClassProfile,
  deleteClassProfile,
  updateClassProfile,
  saveSession,
  loadSession,
  clearSession,
  saveClientId,
  getClientId,
  saveSettings,
  loadSettings,
  saveCredentials,
  loadCredentials,
  hasCredentials,
  hasUsers,
  createUser,
  getUserByUsername,
  updateUserLogin
};
