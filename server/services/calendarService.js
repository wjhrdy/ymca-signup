// ical-generator uses global crypto.randomUUID() which isn't available in Node 18
if (typeof globalThis.crypto === 'undefined') {
  globalThis.crypto = require('crypto');
}

const ical = require('ical-generator').default;

const LOCATION_ADDRESSES = {
  'A.E. Finley YMCA': '9216 Baileywick Rd., Raleigh, NC 27615',
  'Alexander Family YMCA': '1603 Hillsborough St., Raleigh, NC 27605',
  'Chapel Hill-Carrboro YMCA': '980 Martin Luther King Jr. Blvd., Chapel Hill, NC 27514',
  'Chatham Park YMCA': '120 Parkland Dr., Pittsboro, NC 27312',
  'Downtown Durham YMCA': '218 W. Morgan St., Durham, NC 27701',
  'East Triangle YMCA': '120 Flowers Pkwy, Clayton, NC 27527',
  'Hope Valley Farms YMCA': '4818 S. Roxboro St., Durham, NC 27713',
  'Ingram Family YMCA': '1907 K M Wicker Memorial Drive, Sanford, NC 27330',
  'Kerr Family YMCA': '2500 Wakefield Pines Dr., Raleigh, NC 27614',
  'Kraft Family YMCA': '8921 Holly Springs Rd., Apex, NC 27539',
  'Lakewood YMCA': '2119 Chapel Hill Rd., Durham, NC 27707',
  'Northwest Cary YMCA': '6903 Carpenter Fire Station Road, Cary, NC 27519',
  'Poole Family YMCA': '2110 Aversboro Road, Garner, NC 27529',
  'Poyner YMCA': '227 Fayetteville Street, Raleigh, NC 27601',
  'Southeast Raleigh YMCA': '1436 Rock Quarry Road, Raleigh, NC 27610',
  'Taylor Family YMCA': '101 YMCA Dr., Cary, NC 27513',
  'YMCA at American Tobacco': '410 Blackwell Street, Durham, NC 27701',
  'Knightdale Station YMCA': '494 Knightdale Station Run, Knightdale, NC 27545',
  'YMCA at Meadowmont': '301 Old Barn Lane, Chapel Hill, NC 27517',
};

// Each occurrence carries `cancelWindowMinutes`: the effective (non-refundable)
// late-cancel window, precomputed server-side from the Fisikal rule + the club's
// late-cancel flag (server/services/classService.js#effectiveCancelWindowMinutes).
// A window of 0 means late cancel doesn't apply to that class, so no reminder is
// emitted. Mirrors client/src/services/lateCancel.js.
const CANCEL_REMINDER_LEAD_MINUTES = 15;

function formatCancelWindow(minutes) {
  const h = Math.floor(minutes / 60);
  const m = minutes % 60;
  const parts = [];
  if (h > 0) parts.push(`${h} hour${h === 1 ? '' : 's'}`);
  if (m > 0) parts.push(`${m} minute${m === 1 ? '' : 's'}`);
  return parts.join(' ') || '0 minutes';
}

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
 *   isSkipped              → [Skipped]   TENTATIVE  + unskip/book link
 *   otherwise              → (no prefix) TENTATIVE  + skip/book link
 *
 * `isSkipped` marks a pending (not-yet-booked) occurrence that the member
 * preemptively excluded from auto-signup via the calendar. The scheduler will
 * not book it, and the event is relabeled `[Skipped]` with an Unskip link.
 *
 * Booked classes whose occurrence defines a cancellation window also get a
 * short, free/transparent "[Cancel Deadline]" reminder event ending exactly
 * when the fee-free cancellation window closes (that window before start),
 * emitted only while that deadline is still in the future relative to `now`.
 */
function generateCalendar(occurrences, appUrl, now = new Date()) {
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
    let showSkipLink = false;
    let showUnskipLink = false;
    let markTransparent = false;

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
    } else if (cls.isSkipped) {
      // Pending occurrence the member opted out of auto-signup for.
      prefix = '[Skipped] ';
      icalStatus = 'TENTATIVE';
      showUnskipLink = true;
      markTransparent = true;
    } else {
      // Pending occurrence eligible for auto-signup.
      showSkipLink = true;
    }

    const summary = `${prefix}${cls.serviceName}`;

    const address = LOCATION_ADDRESSES[cls.locationName];
    const locationParts = [
      cls.locationName,
      cls.subLocationName
    ].filter(Boolean);
    // Append address so calendar apps can link to maps
    if (address) {
      locationParts.push(address);
    }
    const location = locationParts.join(', ');

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
    } else if (cls.isSkipped) {
      descriptionParts.push('Status: Skipped (auto-signup disabled for this class)');
    }

    if (appUrl) {
      if (showCancelLink) {
        descriptionParts.push(`\nCancel: ${appUrl}/?cancel=${cls.id}`);
      } else if (showUnskipLink) {
        descriptionParts.push(`\nUnskip (re-enable auto-signup): ${appUrl}/?unskip=${cls.id}`);
        descriptionParts.push(`Book now: ${appUrl}/?book=${cls.id}`);
      } else if (showSkipLink) {
        descriptionParts.push(`\nSkip auto-signup: ${appUrl}/?skip=${cls.id}`);
        descriptionParts.push(`Book now: ${appUrl}/?book=${cls.id}`);
      } else if (cls.isCancelled) {
        descriptionParts.push(`\nBook: ${appUrl}/?book=${cls.id}`);
      }
    }

    const event = calendar.createEvent({
      id: `ymca-${cls.id}@ymca-signup`,
      start,
      end,
      summary,
      location,
      description: descriptionParts.join('\n'),
      status: icalStatus
    });
    // A skipped class won't be attended, so don't show the member as busy.
    if (markTransparent) {
      event.transparency('TRANSPARENT');
    }

    // Booked classes: add a short heads-up reminder ending right when the
    // free-cancel window closes, so the member can drop the class while a refund
    // is still possible. Skip once that deadline has passed.
    const windowMinutes = Number(cls.cancelWindowMinutes) || 0;
    if (cls.isJoined && !cls.isWaited && windowMinutes > 0) {
      const cancelDeadline = new Date(start.getTime() - windowMinutes * 60 * 1000);
      if (cancelDeadline.getTime() > now.getTime()) {
        const reminderStart = new Date(cancelDeadline.getTime() - CANCEL_REMINDER_LEAD_MINUTES * 60 * 1000);
        const reminderDescription = [
          `Last chance to cancel "${cls.serviceName}" and still be refunded.`,
          `This window closes ${formatCancelWindow(windowMinutes)} before the class starts; cancelling after that is a late cancel — you'll be removed from the list but will NOT be refunded.`
        ];
        if (appUrl) {
          reminderDescription.push(`\nCancel: ${appUrl}/?cancel=${cls.id}`);
        }
        const reminder = calendar.createEvent({
          id: `ymca-${cls.id}-cancel-deadline@ymca-signup`,
          start: reminderStart,
          end: cancelDeadline,
          summary: `[Cancel Deadline] ${cls.serviceName}`,
          description: reminderDescription.join('\n'),
          status: 'TENTATIVE'
        });
        // Don't mark the member busy for a reminder.
        reminder.transparency('TRANSPARENT');
      }
    }
  }

  return calendar.toString();
}

module.exports = { generateCalendar };
