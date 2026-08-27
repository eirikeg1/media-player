import { useEffect, useState } from 'react';

import { getChannelId } from '@/lib/channel-utils';
import { useUserStore } from '@/stores/user/user-store';
import {
  usePlaybackSessionStore,
  type PlaybackSession,
} from '@/stores/video/playback-session-store';
import { useViewingHistory } from '../hooks/specialized/use-viewing-history';

/**
 * Always-mounted (in the root layout) companion of the playback session.
 * It hosts the bookkeeping that must outlive the video screen — viewing
 * history and resume positions keep recording while the session plays in the
 * mini bar. Screen-only concerns (controls, gestures, error UI) stay in the
 * video screen's orchestrator.
 */
export function PlaybackSessionHost() {
  const session = usePlaybackSessionStore((s) => s.session);
  if (!session) return null;
  // Keyed per channel so a channel switch cleanly ends one history session
  // and starts the next.
  return (
    <SessionHistoryTracker
      key={`${session.playlistId}:${getChannelId(session.channel)}`}
      session={session}
    />
  );
}

function SessionHistoryTracker({ session }: { session: PlaybackSession }) {
  const userId = useUserStore((s) => s.currentUser?.id);
  const { player } = session;

  const [currentTime, setCurrentTime] = useState(0);
  const [duration, setDuration] = useState(0);
  const [isPlaying, setIsPlaying] = useState(player.playing);

  useEffect(() => {
    setIsPlaying(player.playing);
    const playingSubscription = player.addListener('playingChange', ({ isPlaying: playing }) => {
      setIsPlaying(playing);
    });
    const timeSubscription = player.addListener('timeUpdate', ({ currentTime: time }) => {
      setCurrentTime(time);
      const d = player.duration;
      if (isFinite(d) && d > 0) setDuration(d);
    });
    return () => {
      playingSubscription.remove();
      timeSubscription.remove();
    };
  }, [player]);

  useViewingHistory({
    userId,
    playlistId: session.playlistId,
    channel: session.channel,
    contentType: session.contentType,
    startPosition: session.startPosition,
    currentTime,
    duration,
    isPlaying,
  });

  return null;
}
