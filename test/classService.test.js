const test = require('node:test');
const assert = require('node:assert/strict');
const Module = require('node:module');

const classServicePath = '/Users/willy/Developer/ymca-workspace/ymca-signup/server/services/classService.js';

function loadClassService({ axiosMock, loggerMock, configMock, dbMock }) {
  delete require.cache[require.resolve(classServicePath)];

  const originalLoad = Module._load;
  Module._load = function mockLoad(request, parent, isMain) {
    if (request === 'axios') {
      return axiosMock;
    }
    if (request === '../logger') {
      return loggerMock;
    }
    if (request === '../config') {
      return configMock;
    }
    if (request === '../database') {
      return dbMock;
    }

    return originalLoad.call(this, request, parent, isMain);
  };

  try {
    return require(classServicePath);
  } finally {
    Module._load = originalLoad;
  }
}

function createLoggerMock() {
  return {
    info() {},
    warn() {},
    error() {},
    debug() {}
  };
}

function makeHtml422Error() {
  const error = new Error('Request failed with status code 422');
  error.response = {
    status: 422,
    headers: {
      'content-type': 'text/html; charset=utf-8'
    },
    data: '<!DOCTYPE html><html><body><h1>The change you wanted was rejected.</h1></body></html>'
  };
  return error;
}

function makeJson422Error(message) {
  const error = new Error('Request failed with status code 422');
  error.response = {
    status: 422,
    headers: {
      'content-type': 'application/json; charset=utf-8'
    },
    data: {
      error: message
    }
  };
  return error;
}

test('getCSRFToken reuses the token for the same session and refreshes for a new one', async () => {
  let getCalls = 0;
  const axiosMock = {
    get: async () => {
      getCalls += 1;
      return {
        data: `<meta name="csrf-token" content="csrf-${getCalls}">`
      };
    }
  };

  const classService = loadClassService({
    axiosMock,
    loggerMock: createLoggerMock(),
    configMock: { getConfig: () => ({ waitlistLimit: 5 }) },
    dbMock: { getClientId: async () => null }
  });

  const first = await classService.getCSRFToken('session-a');
  const second = await classService.getCSRFToken('session-a');
  const third = await classService.getCSRFToken('session-b');

  assert.equal(first, 'csrf-1');
  assert.equal(second, 'csrf-1');
  assert.equal(third, 'csrf-2');
  assert.equal(getCalls, 2);
});

test('signup retries once with a refreshed CSRF token when the upstream returns HTML 422', async () => {
  let getCalls = 0;
  let postCalls = 0;
  const csrfTokens = [];
  const axiosMock = {
    get: async () => ({
      data: `<meta name="csrf-token" content="csrf-${++getCalls}">`
    }),
    post: async (_url, _body, options) => {
      postCalls += 1;
      csrfTokens.push(options.headers['X-CSRF-Token']);
      if (postCalls === 1) {
        throw makeHtml422Error();
      }

      return {
        data: { ok: true }
      };
    },
    put: async () => {
      throw new Error('waitlist should not be called for HTML 422 auth rejection');
    }
  };

  const classService = loadClassService({
    axiosMock,
    loggerMock: createLoggerMock(),
    configMock: { getConfig: () => ({ waitlistLimit: 5 }) },
    dbMock: { getClientId: async () => null }
  });

  const result = await classService.signupForClass('session-a', 123, 22);

  assert.deepEqual(result, { ok: true });
  assert.equal(postCalls, 2);
  assert.deepEqual(csrfTokens, ['csrf-1', 'csrf-2']);
});

test('signup returns UPSTREAM_AUTH_REJECTED after two HTML 422 responses and does not fall through to waitlist', async () => {
  let putCalls = 0;
  const axiosMock = {
    get: async () => ({
      data: '<meta name="csrf-token" content="csrf-token">'
    }),
    post: async () => {
      throw makeHtml422Error();
    },
    put: async () => {
      putCalls += 1;
      return { data: {} };
    }
  };

  const classService = loadClassService({
    axiosMock,
    loggerMock: createLoggerMock(),
    configMock: { getConfig: () => ({ waitlistLimit: 5 }) },
    dbMock: { getClientId: async () => null }
  });

  await assert.rejects(
    () => classService.signupForClass('session-a', 456, 11),
    (error) => error.code === 'UPSTREAM_AUTH_REJECTED'
  );
  assert.equal(putCalls, 0);
});

test('signup still falls through to waitlist for a JSON 422 full-class response', async () => {
  let putCalls = 0;
  const axiosMock = {
    get: async () => ({
      data: '<meta name="csrf-token" content="csrf-token">'
    }),
    post: async () => {
      throw makeJson422Error('Class is full');
    },
    put: async () => {
      putCalls += 1;
      return {
        data: { joined: false }
      };
    }
  };

  const classService = loadClassService({
    axiosMock,
    loggerMock: createLoggerMock(),
    configMock: { getConfig: () => ({ waitlistLimit: 5 }) },
    dbMock: { getClientId: async () => null }
  });

  const result = await classService.signupForClass('session-a', 789, 12);

  assert.equal(putCalls, 1);
  assert.equal(result.waitlisted, true);
});

test('cancelBooking retries once with a refreshed CSRF token after an HTML 422 response', async () => {
  let getCalls = 0;
  let deleteCalls = 0;
  const csrfTokens = [];
  const axiosMock = {
    get: async () => ({
      data: `<meta name="csrf-token" content="csrf-${++getCalls}">`
    }),
    delete: async (_url, options) => {
      deleteCalls += 1;
      csrfTokens.push(options.headers['X-CSRF-Token']);
      if (deleteCalls === 1) {
        throw makeHtml422Error();
      }

      return { data: {} };
    }
  };

  const classService = loadClassService({
    axiosMock,
    loggerMock: createLoggerMock(),
    configMock: { getConfig: () => ({ waitlistLimit: 5 }) },
    dbMock: { getClientId: async () => null }
  });

  await classService.cancelBooking('session-a', 321);

  assert.equal(deleteCalls, 2);
  assert.deepEqual(csrfTokens, ['csrf-1', 'csrf-2']);
});

test('leaveWaitlist retries once with a refreshed CSRF token after an HTML 422 response', async () => {
  let getCalls = 0;
  let deleteCalls = 0;
  const csrfTokens = [];
  const axiosMock = {
    get: async () => ({
      data: `<meta name="csrf-token" content="csrf-${++getCalls}">`
    }),
    delete: async (_url, options) => {
      deleteCalls += 1;
      csrfTokens.push(options.headers['X-CSRF-Token']);
      if (deleteCalls === 1) {
        throw makeHtml422Error();
      }

      return { data: {} };
    }
  };

  const classService = loadClassService({
    axiosMock,
    loggerMock: createLoggerMock(),
    configMock: { getConfig: () => ({ waitlistLimit: 5 }) },
    dbMock: { getClientId: async () => null }
  });

  await classService.leaveWaitlist('session-a', 654);

  assert.equal(deleteCalls, 2);
  assert.deepEqual(csrfTokens, ['csrf-1', 'csrf-2']);
});
