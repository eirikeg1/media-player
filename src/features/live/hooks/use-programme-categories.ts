import { useMemo } from 'react';
import type { EpgProgramme } from 'expo-m3u-parser';

/**
 * Extracts unique category strings from a Map of programmes grouped by channel.
 * Returns sorted array of unique categories.
 */
export function useProgrammeCategories(
  programmesByChannel: Map<string, EpgProgramme[]>
): string[] {
  return useMemo(() => {
    const categories = new Set<string>();
    for (const programmes of programmesByChannel.values()) {
      for (const p of programmes) {
        if (p.category) {
          categories.add(p.category);
        }
      }
    }
    return Array.from(categories).sort();
  }, [programmesByChannel]);
}
