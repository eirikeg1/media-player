import { getChannelId } from '@/lib/channel-utils';
import { sortEpisodes, type ParsedEpisode } from '@/lib/series-utils';
import { isCompleted } from '@/lib/viewing-progress';
import { useUserStore } from '@/stores/user/user-store';
import type { Channel } from '@/types/playlist.types';
import { useEffect, useMemo, useState } from 'react';

interface SeriesContinueResult {
  continueEpisode: ParsedEpisode | null;
  isLoading: boolean;
}

/**
 * The episode a "Continue" button should start: the most recently watched one
 * unless it was finished, in which case the one after it.
 */
export function useSeriesContinueEpisode(
  playlistId: string | null | undefined,
  episodes: Channel[]
): SeriesContinueResult {
  const [continueEpisode, setContinueEpisode] = useState<ParsedEpisode | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const userId = useUserStore((s) => s.currentUser?.id);
  const getWatchStatsForChannels = useUserStore((s) => s.getWatchStatsForChannels);

  // Playback order, shared with the series detail list and the next-episode
  // pointer written during playback, so "next" means the same thing everywhere.
  const sortedEpisodes = useMemo(() => sortEpisodes(episodes), [episodes]);

  useEffect(() => {
    if (!playlistId || !userId || !sortedEpisodes.length) {
      setContinueEpisode(null);
      return;
    }

    let cancelled = false;

    (async () => {
      setIsLoading(true);
      try {
        // Ask about this series' episodes directly: paging through the recent
        // history instead would miss a series last watched long enough ago to
        // have fallen off the end of it.
        const matched = await getWatchStatsForChannels(
          userId,
          playlistId,
          sortedEpisodes.map((episode) => getChannelId(episode.channel))
        );

        if (cancelled) return;

        if (!matched) {
          setContinueEpisode(null);
          return;
        }

        const matchedIndex = sortedEpisodes.findIndex(
          (ep) => getChannelId(ep.channel) === matched.channelId
        );

        if (matchedIndex === -1) {
          setContinueEpisode(null);
          return;
        }

        // Only a *finished* episode moves the pointer on (null past the last
        // one). Anything short of that — in progress, or barely started — offers
        // the episode itself: a mis-tap must not skip the episode it landed on,
        // which asking `isInProgress` did (it reads under the resume floor as
        // "not in progress", the same answer it gives for a finished one).
        setContinueEpisode(
          isCompleted(matched.lastPosition ?? 0, matched.totalDuration)
            ? sortedEpisodes[matchedIndex + 1] ?? null
            : sortedEpisodes[matchedIndex]
        );
      } catch (error) {
        console.error('[useSeriesContinueEpisode] Error:', error);
        if (!cancelled) setContinueEpisode(null);
      } finally {
        if (!cancelled) setIsLoading(false);
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [playlistId, userId, sortedEpisodes, getWatchStatsForChannels]);

  return { continueEpisode, isLoading };
}
