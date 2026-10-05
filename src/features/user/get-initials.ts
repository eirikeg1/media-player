/** How many letters an avatar shows. */
const MAX_INITIALS = 2;

/**
 * The avatar initials for a username: the first letter of its first two words.
 *
 * @param name The username to abbreviate
 * @returns Up to two uppercase letters, empty for a blank name
 * @example getInitials('Ada Lovelace') => 'AL'
 */
export function getInitials(name: string): string {
  return name
    .trim()
    .split(/\s+/)
    .map((word) => word[0] ?? '')
    .join('')
    .toUpperCase()
    .slice(0, MAX_INITIALS);
}
