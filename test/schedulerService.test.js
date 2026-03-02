const test = require('node:test');
const assert = require('node:assert/strict');
const Module = require('node:module');

const schedulerServicePath = '/Users/willy/Developer/ymca-workspace/ymca-signup/server/services/schedulerService.js';

function loadSchedulerService({ loggerMock, classServiceMock, dbMock, autoRefreshMock }) {
  delete require.cache[require.resolve(schedulerServicePath)];

  const originalLoad = Module._load;
  Module._load = function mockLoad(request, parent, isMain) {
    if (request === '../logger') {
      return loggerMock;
    }
    if (request === './classService') {
      return classServiceMock;
    }
    if (request === '../database') {
      return dbMock;
    }
    if (request === './trackedClassAutoRefreshService') {
      return autoRefreshMock;
    }

    return originalLoad.call(this, request, parent, isMain);
  };

  try {
    return require(schedulerServicePath);
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

function getCurrentWeekdayAndTime(minutesAhead = 10) {
  const now = new Date();
  const target = new Date(now.getTime() + minutesAhead * 60 * 1000);
  const weekday = target.toLocaleDateString('en-US', { weekday: 'long' });
  const hours = String(target.getHours()).padStart(2, '0');
  const minutes = String(target.getMinutes()).padStart(2, '0');

  return {
    weekday,
    time: `${hours}:${minutes}`
  };
}

test('scheduler fallback fetch keeps location filtering enabled while broadening service scope', async () => {
  const fetchCalls = [];
  const { weekday, time } = getCurrentWeekdayAndTime(10);

  const tracked = {
    id: 11,
    service_id: '393',
    service_name: 'Yoga: Pilates Fusion (Hot)',
    trainer_id: '473',
    trainer_name: 'Cody T',
    location_id: '36',
    location_name: 'Poyner YMCA',
    day_of_week: weekday,
    start_time: time,
    match_trainer: 0,
    match_exact_time: 1,
    time_tolerance: 15,
    auto_signup: 1,
    signup_hours_before: 0
  };

  const fallbackMatch = {
    id: 576106,
    serviceId: 393,
    serviceName: 'Yoga: Pilates Fusion (Hot)',
    trainerId: 473,
    trainerName: 'Cody T',
    locationId: 36,
    locationName: 'Poyner YMCA',
    startTime: new Date(Date.now() + 60 * 60 * 1000).toISOString(),
    canSignup: false,
    canJoinWaitlist: false,
    isJoined: false,
    isWaited: false,
    fullGroup: false,
    waitingListEnabled: true,
    restrictToBookInAdvanceHours: 46
  };

  const classServiceMock = {
    fetchClasses: async (_sessionCookie, filters) => {
      fetchCalls.push(filters);
      return fetchCalls.length === 1 ? [] : [fallbackMatch];
    },
    signupForClass: async () => {
      throw new Error('signup should not be attempted in this test');
    }
  };

  let autoRefreshCalls = 0;
  const autoRefreshMock = {
    maybeAutoRefreshTrackedClass: async (trackedClass, classes) => {
      autoRefreshCalls += 1;
      return {
        tracked: trackedClass,
        refreshed: false,
        matches: autoRefreshCalls === 1 ? [] : classes
      };
    }
  };

  const dbMock = {
    getAllTrackedClasses: async () => [tracked],
    getSignupLogs: async () => [],
    addSignupLog: async () => {}
  };

  const schedulerService = loadSchedulerService({
    loggerMock: createLoggerMock(),
    classServiceMock,
    dbMock,
    autoRefreshMock
  });

  await schedulerService.checkAndSignup('session-a');

  assert.ok(fetchCalls.length >= 2);
  assert.deepEqual(fetchCalls[0].serviceIds, ['393']);
  assert.equal(fetchCalls[0].verifyBookings, false);
  assert.equal('skipLocationFilter' in fetchCalls[0], false);

  const broadFallbackCall = fetchCalls.find((filters, index) =>
    index > 0 && !('serviceIds' in filters)
  );
  assert.ok(broadFallbackCall, 'expected a broad fallback fetch without serviceIds');
  assert.equal(broadFallbackCall.verifyBookings, false);
  assert.equal('skipLocationFilter' in broadFallbackCall, false);
});
