const test = require('node:test');
const assert = require('node:assert/strict');
const Module = require('node:module');

const servicePath = '/Users/willy/Developer/ymca-workspace/ymca-signup/server/services/trackedClassAutoRefreshService.js';

function loadService({ dbMock, loggerMock, classServiceMock }) {
  delete require.cache[require.resolve(servicePath)];

  const originalLoad = Module._load;
  Module._load = function mockLoad(request, parent, isMain) {
    if (request === '../database') {
      return dbMock;
    }
    if (request === '../logger') {
      return loggerMock;
    }
    if (request === './classService') {
      return classServiceMock;
    }

    return originalLoad.call(this, request, parent, isMain);
  };

  try {
    return require(servicePath);
  } finally {
    Module._load = originalLoad;
  }
}

test('maybeAutoRefreshTrackedClass persists a unique refresh plan and returns refreshed matches', async () => {
  const updatesApplied = [];
  const tracked = {
    id: 17,
    location_name: 'Alexander Family YMCA'
  };
  const refreshedTracked = {
    ...tracked,
    location_name: 'Southeast Raleigh YMCA',
    location_id: '42'
  };
  const refreshedMatches = [{ id: 574909 }];

  const { maybeAutoRefreshTrackedClass } = loadService({
    dbMock: {
      updateTrackedClass: async (id, updates) => {
        updatesApplied.push({ id, updates });
      }
    },
    loggerMock: {
      info() {}
    },
    classServiceMock: {
      matchTrackedClassToOccurrences: (candidateTracked) =>
        candidateTracked.location_name === 'Southeast Raleigh YMCA' ? refreshedMatches : [],
      planTrackedClassAutoRefresh: () => ({
        candidate: { id: 574909 },
        updates: {
          location_name: 'Southeast Raleigh YMCA',
          location_id: '42'
        },
        candidateCount: 2
      })
    }
  });

  const result = await maybeAutoRefreshTrackedClass(tracked, []);

  assert.deepEqual(updatesApplied, [{
    id: 17,
    updates: {
      location_name: 'Southeast Raleigh YMCA',
      location_id: '42'
    }
  }]);
  assert.equal(result.refreshed, true);
  assert.deepEqual(result.tracked, refreshedTracked);
  assert.deepEqual(result.matches, refreshedMatches);
});
