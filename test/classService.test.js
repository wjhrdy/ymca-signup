const test = require('node:test');
const assert = require('node:assert/strict');
const Module = require('node:module');

const classServicePath = require('node:path').join(__dirname, '..', 'server', 'services', 'classService.js');

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

test('fetchClasses retries without upstream service filters when the optimized query returns no rows', async () => {
  let scheduleCalls = 0;
  const requestedUrls = [];
  const axiosMock = {
    get: async (url) => {
      if (url === 'https://ymca-triangle.fisikal.com') {
        return {
          data: '<meta name="csrf-token" content="csrf-token">'
        };
      }

      requestedUrls.push(url);
      scheduleCalls += 1;

      if (scheduleCalls === 1) {
        return {
          data: { data: [] }
        };
      }

      return {
        data: {
          data: [
            {
              id: 111,
              service_id: 393,
              service_title: 'Yoga Pilates Fusion',
              trainer_id: 473,
              trainer_name: 'Trainer A',
              location_id: 36,
              location_name: 'Poyner YMCA',
              occurs_at: '2026-03-09T16:00:00Z',
              duration_in_minutes: 60,
              attended_clients_count: 12,
              service_group_size: 12,
              status: 'Scheduled',
              is_joined: false,
              is_waited: false,
              is_readonly: false,
              full_group: true,
              waiting_list_enabled: true,
              total_on_waiting_list: 0,
              restrict_to_book_in_advance_time_in_hours: 48,
              lock_version: 3
            },
            {
              id: 222,
              service_id: 999,
              service_title: 'Different Service',
              trainer_id: 888,
              trainer_name: 'Other Trainer',
              location_id: 36,
              location_name: 'Poyner YMCA',
              occurs_at: '2026-03-09T17:00:00Z',
              duration_in_minutes: 60,
              attended_clients_count: 1,
              service_group_size: 12,
              status: 'Scheduled',
              is_joined: false,
              is_waited: false,
              is_readonly: false,
              full_group: false,
              waiting_list_enabled: false,
              total_on_waiting_list: 0,
              restrict_to_book_in_advance_time_in_hours: 48,
              lock_version: 1
            }
          ]
        }
      };
    }
  };

  const classService = loadClassService({
    axiosMock,
    loggerMock: createLoggerMock(),
    configMock: { getConfig: () => ({ waitlistLimit: 5 }) },
    dbMock: { getClientId: async () => null }
  });

  const classes = await classService.fetchClasses('session-a', {
    startDate: '2026-03-02',
    endDate: '2026-04-01',
    serviceIds: ['393'],
    verifyBookings: false,
    skipLocationFilter: true
  });

  assert.equal(scheduleCalls, 2);
  assert.match(requestedUrls[0], /service_id/);
  assert.doesNotMatch(requestedUrls[1], /service_id/);
  assert.equal(classes.length, 1);
  assert.equal(classes[0].serviceId, 393);
  assert.equal(classes[0].fullGroup, true);
});

test('matchTrackedClassToOccurrences prefers location name over mismatched location ids', async () => {
  const classService = loadClassService({
    axiosMock: {},
    loggerMock: createLoggerMock(),
    configMock: { getConfig: () => ({ waitlistLimit: 5 }) },
    dbMock: { getClientId: async () => null }
  });

  const tracked = {
    service_id: '254',
    trainer_id: '250',
    trainer_name: 'Byron J',
    location_id: '213',
    location_name: 'Alexander Family YMCA',
    day_of_week: 'Monday',
    start_time: '18:15',
    match_trainer: 1,
    match_exact_time: 1,
    time_tolerance: 15
  };

  const occurrences = [
    {
      id: 574909,
      serviceId: 254,
      trainerId: 250,
      trainerName: 'Byron J',
      locationId: 42,
      locationName: 'Alexander Family YMCA',
      startTime: '2026-03-02T23:15:00Z'
    }
  ];

  const matches = classService.matchTrackedClassToOccurrences(tracked, occurrences);

  assert.equal(matches.length, 1);
  assert.equal(matches[0].id, 574909);
});

test('planTrackedClassAutoRefresh refreshes stale location metadata when the weekly pattern is otherwise consistent', async () => {
  const classService = loadClassService({
    axiosMock: {},
    loggerMock: createLoggerMock(),
    configMock: { getConfig: () => ({ waitlistLimit: 5 }) },
    dbMock: { getClientId: async () => null }
  });

  const tracked = {
    id: 17,
    service_id: '254',
    service_name: 'Dance: Dance',
    trainer_id: '250',
    trainer_name: 'Byron J',
    location_id: '213',
    location_name: 'Alexander Family YMCA',
    day_of_week: 'Monday',
    start_time: '18:15',
    match_trainer: 1,
    match_exact_time: 1,
    time_tolerance: 15
  };

  const occurrences = [
    {
      id: 574909,
      serviceId: 254,
      serviceName: 'Dance: Dance',
      trainerId: 250,
      trainerName: 'Byron J',
      locationId: 42,
      locationName: 'Southeast Raleigh YMCA',
      startTime: '2026-03-09T22:15:00Z'
    },
    {
      id: 575909,
      serviceId: 254,
      serviceName: 'Dance: Dance',
      trainerId: 250,
      trainerName: 'Byron J',
      locationId: 42,
      locationName: 'Southeast Raleigh YMCA',
      startTime: '2026-03-16T22:15:00Z'
    }
  ];

  const refreshPlan = classService.planTrackedClassAutoRefresh(tracked, occurrences);

  assert.deepEqual(refreshPlan?.updates, {
    location_id: '42',
    location_name: 'Southeast Raleigh YMCA'
  });
  assert.equal(refreshPlan?.candidate.id, 574909);
  assert.equal(refreshPlan?.candidateCount, 2);
});

test('planTrackedClassAutoRefresh refuses to refresh when the current schedule points to multiple different locations', async () => {
  const classService = loadClassService({
    axiosMock: {},
    loggerMock: createLoggerMock(),
    configMock: { getConfig: () => ({ waitlistLimit: 5 }) },
    dbMock: { getClientId: async () => null }
  });

  const tracked = {
    id: 17,
    service_id: '254',
    service_name: 'Dance: Dance',
    trainer_id: '250',
    trainer_name: 'Byron J',
    location_id: '213',
    location_name: 'Alexander Family YMCA',
    day_of_week: 'Monday',
    start_time: '18:15',
    match_trainer: 1,
    match_exact_time: 1,
    time_tolerance: 15
  };

  const occurrences = [
    {
      id: 574909,
      serviceId: 254,
      serviceName: 'Dance: Dance',
      trainerId: 250,
      trainerName: 'Byron J',
      locationId: 42,
      locationName: 'Southeast Raleigh YMCA',
      startTime: '2026-03-09T22:15:00Z'
    },
    {
      id: 575909,
      serviceId: 254,
      serviceName: 'Dance: Dance',
      trainerId: 250,
      trainerName: 'Byron J',
      locationId: 36,
      locationName: 'Poyner YMCA',
      startTime: '2026-03-16T22:15:00Z'
    }
  ];

  const refreshPlan = classService.planTrackedClassAutoRefresh(tracked, occurrences);

  assert.equal(refreshPlan, null);
});

test('lateCancelBooking targets the late_cancel endpoint and retries once after an HTML 422', async () => {
  let getCalls = 0;
  let deleteCalls = 0;
  const deleteUrls = [];
  const csrfTokens = [];
  const axiosMock = {
    get: async () => ({
      data: `<meta name="csrf-token" content="csrf-${++getCalls}">`
    }),
    delete: async (url, options) => {
      deleteCalls += 1;
      deleteUrls.push(url);
      csrfTokens.push(options.headers['X-CSRF-Token']);
      if (deleteCalls === 1) {
        throw makeHtml422Error();
      }
      return { data: { ok: true } };
    }
  };

  const classService = loadClassService({
    axiosMock,
    loggerMock: createLoggerMock(),
    configMock: { getConfig: () => ({ waitlistLimit: 5 }) },
    dbMock: { getClientId: async () => null }
  });

  const result = await classService.lateCancelBooking('session-a', 987);

  assert.equal(deleteCalls, 2);
  assert.deepEqual(csrfTokens, ['csrf-1', 'csrf-2']);
  assert.ok(deleteUrls.every((url) => url.endsWith('/schedule/occurrences/987/late_cancel')));
  assert.deepEqual(result, { ok: true });
});

test('lateCancelBooking surfaces the upstream exception message on a JSON 400', async () => {
  const axiosMock = {
    get: async () => ({ data: '<meta name="csrf-token" content="csrf-1">' }),
    delete: async () => {
      const error = new Error('Request failed with status code 400');
      error.response = {
        status: 400,
        headers: { 'content-type': 'application/json; charset=utf-8' },
        data: { exception: 'Too late to cancel' }
      };
      throw error;
    }
  };

  const classService = loadClassService({
    axiosMock,
    loggerMock: createLoggerMock(),
    configMock: { getConfig: () => ({ waitlistLimit: 5 }) },
    dbMock: { getClientId: async () => null }
  });

  await assert.rejects(
    () => classService.lateCancelBooking('session-a', 987),
    (err) => {
      assert.equal(err.status, 400);
      assert.match(err.message, /Too late to cancel/);
      return true;
    }
  );
});

test('effectiveCancelWindowMinutes mirrors the Fisikal window rule', () => {
  const classService = loadClassService({
    axiosMock: { get: async () => ({ data: '' }) },
    loggerMock: createLoggerMock(),
    configMock: { getConfig: () => ({ waitlistLimit: 5 }) },
    dbMock: { getClientId: async () => null }
  });

  const club = { enableLateCancelling: true, appointmentBillingTimeHours: 3 };

  // Both fields present -> hours*60 + minutes (0 is "present" -> a real 0 window).
  assert.equal(classService.effectiveCancelWindowMinutes(2, 0, club), 120);
  assert.equal(classService.effectiveCancelWindowMinutes(0, 30, club), 30);
  assert.equal(classService.effectiveCancelWindowMinutes(0, 0, club), 0);
  // Either field null -> appointment_cancel_time is unset -> club default (3h).
  assert.equal(classService.effectiveCancelWindowMinutes(0, null, club), 180);
  assert.equal(classService.effectiveCancelWindowMinutes(null, null, club), 180);
  // Late cancelling disabled club-wide -> always 0 (feature off everywhere).
  assert.equal(
    classService.effectiveCancelWindowMinutes(0, null, { enableLateCancelling: false, appointmentBillingTimeHours: 3 }),
    0
  );
  // Missing club config -> 0 (cannot late cancel).
  assert.equal(classService.effectiveCancelWindowMinutes(0, 0, null), 0);
});

test('extractBootstrapConfig pulls club settings out of the SPA bootstrap script', () => {
  const classService = loadClassService({
    axiosMock: { get: async () => ({ data: '' }) },
    loggerMock: createLoggerMock(),
    configMock: { getConfig: () => ({ waitlistLimit: 5 }) },
    dbMock: { getClientId: async () => null }
  });

  const cfg = {
    time_zone_name: 'US/Eastern',
    appointment_billing_time: 3,
    current_club_settings: { enable_late_cancelling: true, booking_minutes_interval: 15 }
  };
  // Reproduce the page's embedding: an escaped-JSON string literal argument.
  const literal = JSON.stringify(JSON.stringify(cfg));
  const html =
    '<html><body><script>(function($opal){return $scope.Platform._scope.Components' +
    '.$component("configuration").$klass().$instance()["$configure!"](' + literal + ');})(Opal);' +
    '</script></body></html>';

  const parsed = classService.extractBootstrapConfig(html);
  assert.equal(parsed.appointment_billing_time, 3);
  assert.equal(parsed.current_club_settings.enable_late_cancelling, true);
  assert.equal(parsed.time_zone_name, 'US/Eastern');

  // Robust to absence / bad input: returns null instead of throwing.
  assert.equal(classService.extractBootstrapConfig('<html>no bootstrap here</html>'), null);
  assert.equal(classService.extractBootstrapConfig(null), null);
});
