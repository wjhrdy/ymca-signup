const ical = require('ical-generator').default;
const logger = require('../logger');

function generateCalendar(bookings) {
  const calendar = ical({
    name: 'YMCA Classes',
    timezone: 'America/New_York',
    ttl: 30 * 60 // 30 minutes
  });

  for (const booking of bookings) {
    if (!booking.is_joined && !booking.is_waited) continue;

    const start = new Date(booking.occurs_at);
    const durationMinutes = booking.duration_in_minutes || 60;
    const end = new Date(start.getTime() + durationMinutes * 60 * 1000);

    const isWaitlisted = booking.is_waited && !booking.is_joined;
    const summary = isWaitlisted
      ? `[Waitlist] ${booking.service_title}`
      : booking.service_title;

    const locationParts = [booking.location_name, booking.sub_location_name].filter(Boolean);
    const location = locationParts.join(' - ');

    const descriptionParts = [];
    if (booking.trainer_name) descriptionParts.push(`Trainer: ${booking.trainer_name}`);
    if (isWaitlisted) {
      descriptionParts.push('Status: Waitlisted');
      if (booking.position_on_waiting_list != null) {
        descriptionParts.push(`Waitlist position: ${booking.position_on_waiting_list}`);
      }
    } else {
      descriptionParts.push('Status: Booked');
    }

    calendar.createEvent({
      id: `ymca-${booking.id}@ymca-signup`,
      start,
      end,
      summary,
      location,
      description: descriptionParts.join('\n'),
      status: isWaitlisted ? 'TENTATIVE' : 'CONFIRMED'
    });
  }

  return calendar.toString();
}

module.exports = { generateCalendar };
