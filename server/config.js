const fs = require('fs');
const path = require('path');
const yaml = require('js-yaml');
const logger = require('./logger');

let config = null;

function loadConfig() {
  try {
    const dataConfigPath = path.join(__dirname, '../data/config.yaml');
    const rootConfigPath = path.join(__dirname, '../config.yaml');
    
    let configPath = rootConfigPath;
    if (fs.existsSync(dataConfigPath)) {
      configPath = dataConfigPath;
      logger.info('Loading config from data directory');
    } else if (fs.existsSync(rootConfigPath)) {
      logger.info('Loading config from root directory');
    } else {
      const examplePath = path.join(__dirname, '../config.yaml.example');
      if (fs.existsSync(examplePath)) {
        fs.copyFileSync(examplePath, dataConfigPath);
        configPath = dataConfigPath;
        logger.info('Created config.yaml from config.yaml.example in data directory');
      } else {
        throw new Error('No config file found. Please copy config.yaml.example to data/config.yaml');
      }
    }
    
    const fileContents = fs.readFileSync(configPath, 'utf8');
    config = yaml.load(fileContents);
    logger.info('Configuration loaded successfully');
    
    if (config.preferredLocations && config.preferredLocations.length > 0) {
      logger.info(`Preferred locations: ${config.preferredLocations.join(', ')}`);
    } else {
      logger.debug('No preferred locations configured - fetching from all locations');
    }
    
    return config;
  } catch (error) {
    logger.error('Error loading config.yaml:', error.message);
    logger.info('Using default configuration');
    
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

function reloadConfig() {
  return loadConfig();
}

module.exports = {
  loadConfig,
  getConfig,
  reloadConfig
};
