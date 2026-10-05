import { useEffect, useState } from 'react';

import { EpgService } from '@/services/epg-service';
import type { EpgProgramme } from 'expo-m3u-parser';

interface NowNextProgrammes {
  /** What is airing on this channel right now, if the EPG knows. */
  currentProgramme: EpgProgramme | null;
  /** What follows it, if the EPG knows. */
  nextProgramme: EpgProgramme | null;
}

/**
 * What is on a single channel now and next.
 *
 * The channel's detail surface is a route of its own, so it can no longer read
 * "now playing" out of the grid's bulk map — it asks for its one channel, which
 * is a single indexed lookup either way. One shot per channel is enough: the
 * surface is opened to be read and left, and a programme boundary crossed while
 * it is open changes nothing the user is acting on.
 *
 * @param channelId The channel's EPG (`tvg.id`) id; `null` for a channel the
 *   EPG cannot match at all.
 * @param shiftHours The channel's `tvg-shift`. It decides which programme is
 *   current as well as the times shown, so the strip this feeds agrees with the
 *   schedule under it.
 */
export function useNowNextProgrammes(
  channelId: string | null,
  shiftHours: number = 0
): NowNextProgrammes {
  const [programmes, setProgrammes] = useState<NowNextProgrammes>({
    currentProgramme: null,
    nextProgramme: null,
  });

  useEffect(() => {
    setProgrammes({ currentProgramme: null, nextProgramme: null });
    if (!channelId) return;

    let cancelled = false;
    Promise.all([
      EpgService.getCurrentProgramme(channelId, shiftHours),
      EpgService.getNextProgramme(channelId, shiftHours),
    ])
      .then(([currentProgramme, nextProgramme]) => {
        if (!cancelled) setProgrammes({ currentProgramme, nextProgramme });
      })
      .catch((err) => {
        // Nothing to recover: the surface simply shows no schedule strip.
        console.warn('[useNowNextProgrammes] Failed to fetch programmes:', err);
      });

    return () => {
      cancelled = true;
    };
  }, [channelId, shiftHours]);

  return programmes;
}
