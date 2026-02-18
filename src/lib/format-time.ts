/**
 * Format a Unix timestamp (seconds) as a locale-aware HH:MM string.
 */
export function formatTime(unixSeconds: number): string {
  const date = new Date(unixSeconds * 1000);
  return date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
}
