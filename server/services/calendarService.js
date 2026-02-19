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
