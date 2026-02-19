// ical-generator uses global crypto.randomUUID() which isn't available in Node 18
if (typeof globalThis.crypto === 'undefined') {
  globalThis.crypto = require('crypto');
}

const ical = require('ical-generator').default;

/**
 * Generate an iCal feed from normalized class occurrences.
 *
 * Each occurrence should have:
 *   - id, serviceName, startTime, duration, locationName, trainerName
 *   - isJoined, isWaited, isCancelled (booleans)
 *   - positionOnWaitingList (optional)
 *
 * Status logic:
 *   isJoined && !isWaited  → [Booked]   CONFIRMED  + cancel link
 *   isWaited               → [Waitlist]  TENTATIVE  + cancel link
 *   isCancelled            → [Cancelled] CANCELLED  no cancel link
 *   otherwise              → (no prefix) TENTATIVE  no cancel link
 */
function generateCalendar(occurrences, appUrl) {
  const calendar = ical({
    name: 'YMCA Classes',
    ttl: 30 * 60 // 30 minutes
  });

  for (const cls of occurrences) {
    const start = new Date(cls.startTime);
    const durationMinutes = cls.duration || 60;
    const end = new Date(start.getTime() + durationMinutes * 60 * 1000);

    let prefix = '';
    let icalStatus = 'TENTATIVE';
    let showCancelLink = false;

    if (cls.isJoined && !cls.isWaited) {
      prefix = '[Booked] ';
      icalStatus = 'CONFIRMED';
      showCancelLink = true;
    } else if (cls.isWaited) {
      prefix = '[Waitlist] ';
      icalStatus = 'TENTATIVE';
      showCancelLink = true;
    } else if (cls.isCancelled) {
      prefix = '[Cancelled] ';
      icalStatus = 'CANCELLED';
    }

    const summary = `${prefix}${cls.serviceName}`;

    const locationParts = [cls.locationName, cls.subLocationName].filter(Boolean);
    const location = locationParts.join(' - ');

    const descriptionParts = [];
    if (cls.trainerName) descriptionParts.push(`Trainer: ${cls.trainerName}`);

    if (cls.isJoined && !cls.isWaited) {
      descriptionParts.push('Status: Booked');
    } else if (cls.isWaited) {
      descriptionParts.push('Status: Waitlisted');
      if (cls.positionOnWaitingList != null) {
        descriptionParts.push(`Waitlist position: ${cls.positionOnWaitingList}`);
      }
    } else if (cls.isCancelled) {
      descriptionParts.push('Status: Cancelled');
    }

    if (showCancelLink && appUrl) {
      descriptionParts.push(`\nCancel: ${appUrl}/?cancel=${cls.id}`);
    } else if (appUrl && (cls.isCancelled || (!cls.isJoined && !cls.isWaited))) {
      descriptionParts.push(`\nBook: ${appUrl}/?book=${cls.id}`);
    }

    calendar.createEvent({
      id: `ymca-${cls.id}@ymca-signup`,
      start,
      end,
      summary,
      location,
      description: descriptionParts.join('\n'),
      status: icalStatus
    });
  }

  return calendar.toString();
}

module.exports = { generateCalendar };
