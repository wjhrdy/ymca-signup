function createYmcaSessionManager({ authService, db, classService, logger, getSessionCookie, setSessionCookie }) {
  async function persistSession(sessionCookie) {
    setSessionCookie(sessionCookie);
    classService.invalidateCachedSessionState();
    await db.saveSession(sessionCookie);
    logger.info('Session saved to database');
    return sessionCookie;
  }

  async function clearSession() {
    setSessionCookie(null);
    classService.invalidateCachedSessionState();
    await db.clearSession();
    logger.info('Session cleared from database');
  }

  async function loginAndPersistSession() {
    const sessionCookie = await authService.login();
    return persistSession(sessionCookie);
  }

  async function ensureSession() {
    const sessionCookie = getSessionCookie();
    if (sessionCookie) {
      return sessionCookie;
    }

    return loginAndPersistSession();
  }

  return {
    persistSession,
    clearSession,
    loginAndPersistSession,
    ensureSession
  };
}

module.exports = {
  createYmcaSessionManager
};
