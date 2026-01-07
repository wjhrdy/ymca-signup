const logger = require('../logger');

function requireAuth(req, res, next) {
  if (!req.session || !req.session.userId) {
    return res.status(401).json({ 
      error: 'Authentication required',
      needsLogin: true 
    });
  }
  next();
}

function checkSetup(req, res, next) {
  if (req.path === '/api/auth/setup-status' || 
      req.path === '/api/auth/setup' ||
      req.path === '/api/auth/login') {
    return next();
  }
  
  next();
}

module.exports = {
  requireAuth,
  checkSetup
};
