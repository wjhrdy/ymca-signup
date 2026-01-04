const fs = require('fs');
const path = require('path');
const yaml = require('js-yaml');

let config = null;

function loadConfig() {
  try {
    const dataConfigPath = path.join(__dirname, '../data/config.yaml');
    const rootConfigPath = path.join(__dirname, '../config.yaml');
    
    let configPath = rootConfigPath;
    if (fs.existsSync(dataConfigPath)) {
      configPath = dataConfigPath;
      console.log('Loading config from data directory');
    } else if (fs.existsSync(rootConfigPath)) {
      console.log('Loading config from root directory');
    } else {
      const examplePath = path.join(__dirname, '../data/config.yaml.example');
      if (fs.existsSync(examplePath)) {
        fs.copyFileSync(examplePath, dataConfigPath);
        configPath = dataConfigPath;
        console.log('Created config.yaml from config.yaml.example in data directory');
      } else {
        throw new Error('No config file found');
      }
    }
    
    const fileContents = fs.readFileSync(configPath, 'utf8');
    config = yaml.load(fileContents);
    console.log('Configuration loaded successfully');
    
    if (config.preferredLocations && config.preferredLocations.length > 0) {
      console.log(`Preferred locations: ${config.preferredLocations.join(', ')}`);
    } else {
      console.log('No preferred locations configured - fetching from all locations');
    }
    
    if (config.clientId) {
      console.log(`Client ID configured: ${config.clientId}`);
    }
    
    return config;
  } catch (error) {
    console.error('Error loading config.yaml:', error.message);
    console.log('Using default configuration');
    
    config = {
      preferredLocations: [],
      clientId: null,
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

function getClientId() {
  if (!config) {
    loadConfig();
  }
  return config.clientId || null;
}

function reloadConfig() {
  return loadConfig();
}

module.exports = {
  loadConfig,
  getConfig,
  getClientId,
  reloadConfig
};
