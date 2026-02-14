import { getChannelId } from '@/lib/channel-utils';
import { useUserStore } from '@/stores/user/user-store';
import type { Channel } from '@/types/playlist.types';
import { isPrivateModeActive } from '@/types/user.types';
import type { ContentType } from '@/types/user.types';
import { useEffect, useRef } from 'react';

interface UseViewingHistoryProps {
  userId: string | undefined;
  playlistId: string;
  channel: Channel;
  contentType: ContentType;
  currentTime: number;
  duration: number;
  isPlaying: boolean;
}

const SAVE_INTERVAL_SECONDS = 10;

export function useViewingHistory({
  userId,
  playlistId,
  channel,
  contentType,
  currentTime,
  duration,
  isPlaying,
}: UseViewingHistoryProps) {
  const sessionIdRef = useRef<string | null>(null);
  const lastSavedPositionRef = useRef(0);
  const accumulatedWatchTimeRef = useRef(0);
  const lastCurrentTimeRef = useRef(0);
  const isPlayingRef = useRef(false);

  const { startViewingSession, updateSessionProgress, endViewingSession } = useUserStore.getState();

  // Keep isPlaying ref in sync
  useEffect(() => {
    isPlayingRef.current = isPlaying;
  }, [isPlaying]);

  // Start session on mount (skip if private mode is enabled)
  useEffect(() => {
    if (!userId || !playlistId) return;
    if (isPrivateModeActive(useUserStore.getState().currentUser?.settings)) return;

    const channelId = getChannelId(channel);

    startViewingSession({
      userId,
      playlistId,
      channelId,
      channelName: channel.name,
      groupTitle: channel.group?.title,
      contentType,
      tvgLogo: channel.tvg?.logo,
      startPosition: 0,
      totalDuration: duration > 0 ? duration : undefined,
    }).then((id) => {
      sessionIdRef.current = id;
    }).catch((error) => {
      console.error('[ViewingHistory] Failed to start session:', error);
    });

    return () => {
      // End session on unmount
      const sid = sessionIdRef.current;
      if (!sid) return;

      const finalPosition = lastCurrentTimeRef.current;
      const watchedTime = accumulatedWatchTimeRef.current;
      const totalDur = duration;
      const completed = totalDur > 0 && finalPosition / totalDur >= 0.9;

      endViewingSession(sid, finalPosition, watchedTime, completed);
      sessionIdRef.current = null;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [userId, playlistId, channel, contentType]);

  // Track progress while playing
  useEffect(() => {
    if (!sessionIdRef.current || !isPlaying) return;

    // Calculate time delta since last update
    const delta = Math.abs(currentTime - lastCurrentTimeRef.current);
    // Only count reasonable deltas (skip seeks by capping at 2s per tick)
    if (delta > 0 && delta < 2) {
      accumulatedWatchTimeRef.current += delta;
    }
    lastCurrentTimeRef.current = currentTime;

    // Throttled save: only write when position moved >= SAVE_INTERVAL_SECONDS
    const positionDelta = Math.abs(currentTime - lastSavedPositionRef.current);
    if (positionDelta >= SAVE_INTERVAL_SECONDS && sessionIdRef.current) {
      lastSavedPositionRef.current = currentTime;
      updateSessionProgress(
        sessionIdRef.current,
        currentTime,
        accumulatedWatchTimeRef.current,
      );
    }
  }, [currentTime, isPlaying, updateSessionProgress]);

  // Update duration on session if it becomes known after start
  useEffect(() => {
    if (!sessionIdRef.current || duration <= 0) return;
    // Duration updates are included in the next progress save — no extra DB call needed
  }, [duration]);
}
