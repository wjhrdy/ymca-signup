const bcrypt = require('bcrypt');
const logger = require('../logger');
const db = require('../database');

const SALT_ROUNDS = 10;

async function setupFirstUser(username, password) {
  const hasUsers = await db.hasUsers();
  if (hasUsers) {
    throw new Error('Users already exist. Cannot run setup again.');
  }
  
  if (!username || username.length < 3) {
    throw new Error('Username must be at least 3 characters long');
  }
  
  if (!password || password.length < 8) {
    throw new Error('Password must be at least 8 characters long');
  }
  
  const passwordHash = await bcrypt.hash(password, SALT_ROUNDS);
  const userId = await db.createUser(username, passwordHash);
  logger.info(`First user created: ${username} (ID: ${userId})`);
  
  return userId;
}

async function authenticateUser(username, password) {
  const user = await db.getUserByUsername(username);
  
  if (!user) {
    throw new Error('Invalid username or password');
  }
  
  const isValid = await bcrypt.compare(password, user.password_hash);
  
  if (!isValid) {
    throw new Error('Invalid username or password');
  }
  
  await db.updateUserLogin(user.id);
  logger.info(`User authenticated: ${username}`);
  
  return {
    id: user.id,
    username: user.username,
    lastLogin: user.last_login
  };
}

async function isSetupRequired() {
  const hasUsers = await db.hasUsers();
  return !hasUsers;
}

module.exports = {
  setupFirstUser,
  authenticateUser,
  isSetupRequired
};
