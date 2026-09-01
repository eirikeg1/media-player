import type { Fixture } from 'expo-m3u-parser';

import { dayLabel, localDateKey } from './date-utils';
import { byKickoff } from './match-grouping';

export interface DaySection {
  /** Local `YYYY-MM-DD` — stable key for the section. */
  key: string;
  /** "Today" / "Tomorrow" / "Mon 7 Sep". */
  label: string;
  fixtures: Fixture[];
}

/**
 * Split a team's schedule into one section per local calendar day, soonest day
 * first and sorted by kickoff inside each one.
 *
 * The day is the device's, not the provider's: a late kickoff belongs to the
 * evening the user watches it on, which is what {@link localDateKey} keys on.
 */
export function groupFixturesByDay(
  fixtures: readonly Fixture[],
  now: Date = new Date()
): DaySection[] {
  const sections = new Map<string, DaySection>();
  // Sorted first, so the map's insertion order is already chronological.
  for (const fixture of [...fixtures].sort(byKickoff)) {
    const date = new Date(fixture.kickoffTime * 1000);
    const key = localDateKey(date);
    let section = sections.get(key);
    if (!section) {
      section = { key, label: dayLabel(date, now), fixtures: [] };
      sections.set(key, section);
    }
    section.fixtures.push(fixture);
  }
  return [...sections.values()];
}
