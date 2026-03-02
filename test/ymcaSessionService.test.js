const test = require('node:test');
const assert = require('node:assert/strict');

const { createYmcaSessionManager } = require('/Users/willy/Developer/ymca-workspace/ymca-signup/server/services/ymcaSessionService.js');

test('persistSession and clearSession always invalidate cached YMCA session state', async () => {
  let currentSessionCookie = null;
  let invalidations = 0;
  const saves = [];
  let clears = 0;

  const manager = createYmcaSessionManager({
    authService: {
      login: async () => 'fresh-cookie'
    },
    db: {
      saveSession: async (sessionCookie) => {
        saves.push(sessionCookie);
      },
      clearSession: async () => {
        clears += 1;
      }
    },
    classService: {
      invalidateCachedSessionState: () => {
        invalidations += 1;
      }
    },
    logger: {
      info() {}
    },
    getSessionCookie: () => currentSessionCookie,
    setSessionCookie: (nextSessionCookie) => {
      currentSessionCookie = nextSessionCookie;
    }
  });

  await manager.persistSession('cookie-a');
  assert.equal(currentSessionCookie, 'cookie-a');
  assert.deepEqual(saves, ['cookie-a']);
  assert.equal(invalidations, 1);

  await manager.clearSession();
  assert.equal(currentSessionCookie, null);
  assert.equal(clears, 1);
  assert.equal(invalidations, 2);
});

test('ensureSession reuses the current session cookie and logs in only when needed', async () => {
  let currentSessionCookie = 'existing-cookie';
  let loginCalls = 0;

  const manager = createYmcaSessionManager({
    authService: {
      login: async () => {
        loginCalls += 1;
        return `fresh-cookie-${loginCalls}`;
      }
    },
    db: {
      saveSession: async () => {},
      clearSession: async () => {}
    },
    classService: {
      invalidateCachedSessionState() {}
    },
    logger: {
      info() {}
    },
    getSessionCookie: () => currentSessionCookie,
    setSessionCookie: (nextSessionCookie) => {
      currentSessionCookie = nextSessionCookie;
    }
  });

  const existing = await manager.ensureSession();
  assert.equal(existing, 'existing-cookie');
  assert.equal(loginCalls, 0);

  currentSessionCookie = null;
  const fresh = await manager.ensureSession();
  assert.equal(fresh, 'fresh-cookie-1');
  assert.equal(currentSessionCookie, 'fresh-cookie-1');
  assert.equal(loginCalls, 1);
});
