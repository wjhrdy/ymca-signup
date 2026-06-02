/**
 * Late-cancellation window helper.
 *
 * The server annotates each booking/occurrence with `cancelWindowMinutes`: the
 * effective window (in minutes before start) during which a normal cancel is no
 * longer free and the late-cancel endpoint must be used instead. A late cancel
 * removes you from the attendee list but is NOT refunded. The value already
 * folds in the club's `enable_late_cancelling` flag and the Fisikal
 * appointment_cancel_time / appointment_billing_time fallback rule — so a value
 * of 0 means late cancel does not apply to that class.
 */

/**
 * Whether a booked class is inside its late-cancellation window (i.e. a normal
 * cancel is no longer available and the late-cancel endpoint is required).
 *
 * @param {string|number|Date} startTime - Class start time (anything `new Date()` accepts)
 * @param {number} cancelWindowMinutes - Effective window from the server (0 = late cancel N/A)
 * @param {Date} [now] - Reference time, defaults to the current moment
 * @returns {boolean} true only when a window applies and now is inside it
 */
export function isLateCancelRequired(startTime, cancelWindowMinutes, now = new Date()) {
  if (!startTime) return false;

  const windowMinutes = Number(cancelWindowMinutes) || 0;
  if (windowMinutes <= 0) return false; // late cancel does not apply to this class

  const start = new Date(startTime);
  if (Number.isNaN(start.getTime())) return false;

  const deadline = new Date(start.getTime() - windowMinutes * 60 * 1000);
  return now >= deadline && now < start;
}

export default { isLateCancelRequired };
