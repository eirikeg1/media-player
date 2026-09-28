import type { GroupCount } from 'expo-m3u-parser';

export const FAVORITES_GROUP_SENTINEL = '__favorites__';

export interface GroupOption {
  name: string;
  channelCount: number;
  firstPosition?: number;
}

/**
 * Keywords that indicate adult content (substring match)
 * Matches anywhere in the group name
 */
export const ADULT_GROUP_KEYWORDS = [
  '18+',
  'adult',
  'xxx',
  'nsfw',
  'porn',
  'erotic',
  'x-rated',
  'xrated',
] as const;

/**
 * Keywords that indicate adult content (word boundary match)
 * Matches at start of string, end of string, or surrounded by spaces
 * e.g., "18" matches "18 Sports", "Group 18", " 18 " but not "2018"
 */
export const ADULT_GROUP_STANDALONE_KEYWORDS = ['18'] as const;

function matchesStandaloneKeyword(text: string, keyword: string): boolean {
  return (
    text.startsWith(keyword + ' ') || // "18 Sports"
    text.endsWith(' ' + keyword) || // "Group 18"
    text.includes(' ' + keyword + ' ') || // "Group 18 Live"
    text === keyword // exact match
  );
}

export function isAdultGroup(groupName: string): boolean {
  const lowerName = groupName.toLowerCase();

  // Check substring keywords
  if (ADULT_GROUP_KEYWORDS.some((keyword) => lowerName.includes(keyword))) {
    return true;
  }

  // Check standalone keywords (word boundary)
  if (
    ADULT_GROUP_STANDALONE_KEYWORDS.some((keyword) =>
      matchesStandaloneKeyword(lowerName, keyword)
    )
  ) {
    return true;
  }

  return false;
}

export function sortGroupsWithAdultLast(groups: GroupOption[]): GroupOption[] {
  const nonAdult: GroupOption[] = [];
  const adult: GroupOption[] = [];

  for (const group of groups) {
    if (group.name === '') continue; // Skip "All Channels"
    if (isAdultGroup(group.name)) {
      adult.push(group);
    } else {
      nonAdult.push(group);
    }
  }

  nonAdult.sort((a, b) => a.name.localeCompare(b.name));
  adult.sort((a, b) => a.name.localeCompare(b.name));

  return [...nonAdult, ...adult];
}

/**
 * Process raw GroupCount results from the Rust backend into GroupOption[].
 * Calculates total count, converts to GroupOption format, sorts with adult last,
 * and prepends an "All" entry.
 */
export function processRawGroupCounts(groupCounts: GroupCount[]): GroupOption[] {
  const totalCount = groupCounts.reduce((sum, g) => sum + g.count, 0);
  const groupOptions = groupCounts.map((g) => ({
    name: g.name,
    channelCount: g.count,
    firstPosition: g.firstPosition,
  }));
  const sorted = sortGroupsWithAdultLast(groupOptions);
  return [{ name: '', channelCount: totalCount }, ...sorted];
}

/**
 * Intersect favorite groups with groups available for the current content type.
 *
 * Always returns the matched names, so an empty result means "none of your
 * favorite groups exist here" — a real filter that matches nothing. Callers must
 * keep that distinct from `undefined`, which means "no group filter at all".
 */
export function getEffectiveFavoriteGroups(
  favoriteGroups: string[],
  availableGroups: GroupOption[],
): string[] {
  const availableNames = new Set(
    availableGroups
      .filter((g) => g.name !== '' && g.name !== FAVORITES_GROUP_SENTINEL)
      .map((g) => g.name),
  );
  return favoriteGroups.filter((g) => availableNames.has(g));
}