const logger = require('../logger');
const db = require('../database');
const classService = require('./classService');

function summarizeTrackedClassRefresh(updates) {
  return Object.entries(updates)
    .map(([field, value]) => `${field}=${value ?? 'null'}`)
    .join(', ');
}

async function maybeAutoRefreshTrackedClass(tracked, occurrences, options = {}) {
  const { source = 'unknown' } = options;
  const matches = classService.matchTrackedClassToOccurrences(tracked, occurrences);

  if (matches.length > 0 || !tracked.id) {
    return {
      tracked,
      matches,
      refreshed: false
    };
  }

  const refreshPlan = classService.planTrackedClassAutoRefresh(tracked, occurrences);
  if (!refreshPlan) {
    return {
      tracked,
      matches,
      refreshed: false
    };
  }

  await db.updateTrackedClass(tracked.id, refreshPlan.updates);

  const refreshedTracked = {
    ...tracked,
    ...refreshPlan.updates
  };
  const refreshedMatches = classService.matchTrackedClassToOccurrences(refreshedTracked, occurrences);

  logger.info(
    `Auto-refreshed tracked class ${tracked.id} from ${source}: ${summarizeTrackedClassRefresh(refreshPlan.updates)}`
  );

  return {
    tracked: refreshedTracked,
    matches: refreshedMatches,
    refreshed: true,
    refreshPlan
  };
}

module.exports = {
  maybeAutoRefreshTrackedClass
};
