import { getChannelId } from '@/lib/channel-utils';
import { parseEpisodeInfo, type ParsedEpisode } from '@/lib/series-utils';
import { useUserStore } from '@/stores/user/user-store';
import type { Channel } from '@/types/playlist.types';
import { useEffect, useMemo, useState } from 'react';

interface SeriesContinueResult {
  continueEpisode: ParsedEpisode | null;
  isLoading: boolean;
}

export function useSeriesContinueEpisode(
  playlistId: string | null | undefined,
  episodes: Channel[]
): SeriesContinueResult {
  const [continueEpisode, setContinueEpisode] = useState<ParsedEpisode | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const currentUser = useUserStore((s) => s.currentUser);
  const getRecentlyWatched = useUserStore((s) => s.getRecentlyWatched);

  // Build a flat sorted list of parsed episodes
  const sortedEpisodes = useMemo(() => {
    if (!episodes.length) return [];
    return episodes
      .map((ch, i) => parseEpisodeInfo(ch, i))
      .sort((a, b) => a.season - b.season || a.episode - b.episode);
  }, [episodes]);

  useEffect(() => {
    if (!playlistId || !currentUser || !sortedEpisodes.length) {
      setContinueEpisode(null);
      return;
    }

    let cancelled = false;

    (async () => {
      setIsLoading(true);
      try {
        const history = await getRecentlyWatched(currentUser.id, playlistId, 200);

        // Build a set of episode channel IDs for fast lookup
        const episodeIds = new Set(episodes.map((ch) => getChannelId(ch)));

        // Find the most recently watched episode in this series
        const matched = history.find((item) => episodeIds.has(item.channelId));

        if (cancelled) return;

        if (!matched) {
          setContinueEpisode(null);
          return;
        }

        // Find the matched episode in the sorted list
        const matchedIndex = sortedEpisodes.findIndex(
          (ep) => getChannelId(ep.channel) === matched.channelId
        );

        if (matchedIndex === -1) {
          setContinueEpisode(null);
          return;
        }

        const matchedEp = sortedEpisodes[matchedIndex];
        const lastPosition = matched.lastPosition ?? 0;
        const totalDuration = matched.totalDuration;

        // Check if in-progress (has position and not near the end)
        const isInProgress =
          lastPosition > 0 &&
          (!totalDuration || lastPosition < totalDuration * 0.9);

        if (isInProgress) {
          setContinueEpisode(matchedEp);
        } else {
          // Completed — point to the next episode if available
          const nextEp = sortedEpisodes[matchedIndex + 1] ?? null;
          setContinueEpisode(nextEp);
        }
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
  }, [playlistId, currentUser, sortedEpisodes, episodes, getRecentlyWatched]);

  return { continueEpisode, isLoading };
}
