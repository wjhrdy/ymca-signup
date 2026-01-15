/**
 * Unified service for all class booking/waitlist actions.
 * Consolidates API calls that were previously scattered across components.
 */
import api from '../api';

/**
 * Sign up for a class
 * @param {number|string} occurrenceId - The class occurrence ID
 * @param {number} [lockVersion] - Optional lock version for optimistic concurrency
 * @returns {Promise<Object>} API response data
 */
export async function signupForClass(occurrenceId, lockVersion = null) {
  const payload = lockVersion !== null ? { lock_version: lockVersion } : {};
  const response = await api.post(`/api/signup/${occurrenceId}`, payload);
  return response.data;
}

/**
 * Join the waitlist for a class
 * @param {number|string} occurrenceId - The class occurrence ID
 * @returns {Promise<Object>} API response data
 */
export async function joinWaitlist(occurrenceId) {
  const response = await api.post(`/api/waitlist/${occurrenceId}`);
  return response.data;
}

/**
 * Cancel a class booking (regular cancellation)
 * @param {number|string} occurrenceId - The class occurrence ID
 * @returns {Promise<Object>} API response data
 */
export async function cancelBooking(occurrenceId) {
  const response = await api.delete(`/api/bookings/${occurrenceId}`);
  return response.data;
}

/**
 * Late cancel a class booking (after cancellation deadline)
 * @param {number|string} occurrenceId - The class occurrence ID
 * @returns {Promise<Object>} API response data
 */
export async function lateCancelBooking(occurrenceId) {
  const response = await api.delete(`/api/bookings/${occurrenceId}/late-cancel`);
  return response.data;
}

/**
 * Leave the waitlist for a class
 * @param {number|string} occurrenceId - The class occurrence ID
 * @returns {Promise<Object>} API response data
 */
export async function leaveWaitlist(occurrenceId) {
  const response = await api.delete(`/api/waitlist/${occurrenceId}`);
  return response.data;
}

export default {
  signupForClass,
  joinWaitlist,
  cancelBooking,
  lateCancelBooking,
  leaveWaitlist,
};
