const test = require('node:test');
const assert = require('node:assert/strict');

const calendarService = require(require('node:path').join(__dirname, '..', 'server', 'services', 'calendarService.js'));

const NOW = new Date('2026-06-01T12:00:00Z');

function countOccurrences(haystack, needle) {
  return haystack.split(needle).length - 1;
}

test('booked upcoming class with a cancel window gets a cancel-deadline reminder', () => {
  const ics = calendarService.generateCalendar(
    [
      {
        id: 1,
        serviceName: 'Yoga',
        startTime: '2026-06-02T12:00:00Z',
        duration: 60,
        locationName: 'Poyner YMCA',
        isJoined: true,
        isWaited: false,
        cancelWindowMinutes: 120
      }
    ],
    'https://app.example.com',
    NOW
  );

  assert.ok(ics.includes('UID:ymca-1@ymca-signup'));
  assert.ok(ics.includes('SUMMARY:[Booked] Yoga'));

  assert.equal(countOccurrences(ics, 'SUMMARY:[Cancel Deadline] Yoga'), 1);
  assert.ok(ics.includes('UID:ymca-1-cancel-deadline@ymca-signup'));
  // Deadline = start - 120m = 10:00Z; reminder is the 15 min before it.
  assert.ok(ics.includes('DTSTART:20260602T094500Z'));
  assert.ok(ics.includes('DTEND:20260602T100000Z'));
  assert.ok(ics.includes('TRANSP:TRANSPARENT'));
});

test('a sub-hour window positions the reminder correctly', () => {
  const ics = calendarService.generateCalendar(
    [
      {
        id: 5,
        serviceName: 'Swim',
        startTime: '2026-06-02T12:00:00Z',
        duration: 60,
        isJoined: true,
        isWaited: false,
        cancelWindowMinutes: 30
      }
    ],
    'https://app.example.com',
    NOW
  );

  // Deadline = start - 30m = 11:30Z; reminder runs 11:15Z -> 11:30Z.
  assert.ok(ics.includes('UID:ymca-5-cancel-deadline@ymca-signup'));
  assert.ok(ics.includes('DTSTART:20260602T111500Z'));
  assert.ok(ics.includes('DTEND:20260602T113000Z'));
});

test('no reminder when late cancel does not apply (window = 0)', () => {
  const ics = calendarService.generateCalendar(
    [
      {
        id: 4,
        serviceName: 'Cycle: Force',
        startTime: '2026-06-02T12:00:00Z',
        duration: 60,
        isJoined: true,
        isWaited: false,
        cancelWindowMinutes: 0
      }
    ],
    'https://app.example.com',
    NOW
  );

  assert.ok(ics.includes('SUMMARY:[Booked] Cycle: Force'));
  assert.ok(!ics.includes('ymca-4-cancel-deadline@ymca-signup'));
  assert.equal(countOccurrences(ics, '[Cancel Deadline]'), 0);
});

test('no reminder once the cancel deadline has already passed', () => {
  const ics = calendarService.generateCalendar(
    [
      {
        id: 2,
        serviceName: 'Spin',
        // Starts 1h after NOW; with a 120m window the deadline is already in the past.
        startTime: '2026-06-01T13:00:00Z',
        duration: 60,
        isJoined: true,
        isWaited: false,
        cancelWindowMinutes: 120
      }
    ],
    'https://app.example.com',
    NOW
  );

  assert.ok(ics.includes('UID:ymca-2@ymca-signup'));
  assert.ok(!ics.includes('ymca-2-cancel-deadline@ymca-signup'));
  assert.equal(countOccurrences(ics, '[Cancel Deadline]'), 0);
});

test('waitlisted (not booked) classes do not get a cancel-deadline reminder', () => {
  const ics = calendarService.generateCalendar(
    [
      {
        id: 3,
        serviceName: 'Pilates',
        startTime: '2026-06-05T12:00:00Z',
        duration: 60,
        isJoined: false,
        isWaited: true,
        cancelWindowMinutes: 120
      }
    ],
    'https://app.example.com',
    NOW
  );

  assert.ok(ics.includes('SUMMARY:[Waitlist] Pilates'));
  assert.ok(!ics.includes('ymca-3-cancel-deadline@ymca-signup'));
  assert.equal(countOccurrences(ics, '[Cancel Deadline]'), 0);
});

test('pending (tracked, not booked) class gets skip + book links', () => {
  const ics = calendarService.generateCalendar(
    [
      {
        id: 10,
        serviceName: 'Spin',
        startTime: '2026-06-10T12:00:00Z',
        duration: 60,
        isJoined: false,
        isWaited: false,
        isCancelled: false,
        isSkipped: false
      }
    ],
    'https://app.example.com',
    NOW
  );

  assert.ok(ics.includes('SUMMARY:Spin'));
  assert.ok(!ics.includes('[Skipped]'));
  // ical-generator escapes the URL line; assert on the path fragment.
  assert.ok(ics.includes('skip=10'));
  assert.ok(ics.includes('book=10'));
});

test('skipped class is relabeled [Skipped], transparent, and offers an unskip link', () => {
  const ics = calendarService.generateCalendar(
    [
      {
        id: 11,
        serviceName: 'Spin',
        startTime: '2026-06-10T12:00:00Z',
        duration: 60,
        isJoined: false,
        isWaited: false,
        isCancelled: false,
        isSkipped: true
      }
    ],
    'https://app.example.com',
    NOW
  );

  assert.ok(ics.includes('SUMMARY:[Skipped] Spin'));
  assert.ok(ics.includes('TRANSP:TRANSPARENT'));
  assert.ok(ics.includes('unskip=11'));
  // A skipped event should not advertise the plain "skip again" link
  // (?unskip=11 legitimately contains the substring skip=11, so anchor on ?skip=).
  assert.ok(!ics.includes('?skip=11'));
});
