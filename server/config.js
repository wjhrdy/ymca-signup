const fs = require('fs');
const path = require('path');
const yaml = require('js-yaml');
const logger = require('./logger');

let config = null;
let db = null;

function setDatabase(database) {
  db = database;
}

function loadDefaultsFromExample() {
  const examplePath = path.join(__dirname, '../config.yaml.example');
  
  if (fs.existsSync(examplePath)) {
    try {
      const fileContents = fs.readFileSync(examplePath, 'utf8');
      const exampleConfig = yaml.load(fileContents);
      logger.info('Loaded defaults from config.yaml.example');
      return exampleConfig;
    } catch (error) {
      logger.error('Error loading config.yaml.example:', error.message);
    }
  }
  
  return {
    preferredLocations: [],
    scheduler: {
      checkIntervalMinutes: 5,
      defaultSignupHoursBefore: 46
    },
    classFetch: {
      defaultDaysAhead: 7,
      maxClassesPerFetch: 5000
    }
  };
}

async function loadConfig() {
  try {
    if (db) {
      const dbSettings = await db.loadSettings();
      if (dbSettings) {
        logger.info('Configuration loaded from database');
        config = {
          preferredLocations: dbSettings.preferredLocations || [],
          scheduler: {
            checkIntervalMinutes: dbSettings.checkIntervalMinutes || 5,
            defaultSignupHoursBefore: dbSettings.defaultSignupHoursBefore || 46
          },
          classFetch: {
            defaultDaysAhead: dbSettings.defaultDaysAhead || 7,
            maxClassesPerFetch: dbSettings.maxClassesPerFetch || 5000
          }
        };
        
        if (config.preferredLocations && config.preferredLocations.length > 0) {
          logger.info(`Preferred locations: ${config.preferredLocations.join(', ')}`);
        } else {
          logger.debug('No preferred locations configured - fetching from all locations');
        }
        
        return config;
      } else {
        logger.info('No settings found in database, loading defaults from config.yaml.example');
        config = loadDefaultsFromExample();
        
        await db.saveSettings({
          preferredLocations: config.preferredLocations,
          checkIntervalMinutes: config.scheduler.checkIntervalMinutes,
          defaultSignupHoursBefore: config.scheduler.defaultSignupHoursBefore,
          defaultDaysAhead: config.classFetch.defaultDaysAhead,
          maxClassesPerFetch: config.classFetch.maxClassesPerFetch
        });
        logger.info('Saved default settings to database');
        
        return config;
      }
    } else {
      logger.warn('Database not available, loading from config.yaml.example');
      config = loadDefaultsFromExample();
      return config;
    }
  } catch (error) {
    logger.error('Error loading config:', error.message);
    logger.info('Using fallback default configuration');
    
    config = {
      preferredLocations: [],
      scheduler: {
        checkIntervalMinutes: 5,
        defaultSignupHoursBefore: 46
      },
      classFetch: {
        defaultDaysAhead: 7,
        maxClassesPerFetch: 5000
      }
    };
    
    return config;
  }
}

function getConfig() {
  if (!config) {
    loadConfig();
  }
  return config;
}

async function reloadConfig() {
  return await loadConfig();
}

async function updateConfig(newSettings) {
  if (!db) {
    throw new Error('Database not available for updating config');
  }
  
  await db.saveSettings({
    preferredLocations: newSettings.preferredLocations,
    checkIntervalMinutes: newSettings.scheduler.checkIntervalMinutes,
    defaultSignupHoursBefore: newSettings.scheduler.defaultSignupHoursBefore,
    defaultDaysAhead: newSettings.classFetch.defaultDaysAhead,
    maxClassesPerFetch: newSettings.classFetch.maxClassesPerFetch
  });
  
  await loadConfig();
  logger.info('Configuration updated successfully');
  
  return config;
}

module.exports = {
  setDatabase,
  loadConfig,
  getConfig,
  reloadConfig,
  updateConfig
};
