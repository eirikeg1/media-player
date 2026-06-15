import type { Fixture } from 'expo-m3u-parser';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import { BackHandler, StatusBar } from 'react-native';

import { ConfirmDialog } from '@/components/ui/containers/modal/confirm-dialog';
import { VideoPlayer } from '@/features/video/components/video-player';
import { IconSymbol } from '@/components/ui/display/icon-symbol';
import { ThemedText } from '@/components/ui/display/themed-text';
import { ThemedView } from '@/components/ui/display/themed-view';
import { useThemeColor } from '@/hooks/use-theme-color';
import { getChannelId } from '@/lib/channel-utils';
import { RustChannelService } from '@/services/rust-channel-service';
import { useCastMiniPlayerStore } from '@/stores/video/cast-mini-player-store';
import { useUserStore } from '@/stores/user/user-store';
import { useGestureStore } from '@/stores/video/gesture-store';
import { useVideoNetworkStore } from '@/stores/video/network-store';
import { useVideoPlayerStore } from '@/stores/video/player-store';
import { usePlaybackQueueStore, type PlaybackQueueItem } from '@/stores/video/queue-store';
import type { Channel } from '@/types/playlist.types';
import type { ContentType } from '@/types/user.types';

function formatPosition(seconds: number): string {
  const h = Math.floor(seconds / 3600);
  const m = Math.floor((seconds % 3600) / 60);
  const s = Math.floor(seconds % 60);
  const pad = (n: number) => n.toString().padStart(2, '0');
  return h > 0 ? `${h}:${pad(m)}:${pad(s)}` : `${m}:${pad(s)}`;
}

export default function VideoPlayerScreen() {
  const router = useRouter();
  const params = useLocalSearchParams<{ channelId: string; playlistId: string; contentType: string; fixture?: string }>();
  const contentType = (params.contentType as ContentType) || 'live';

  // Sports launches pass the associated fixture (serialized) so the player can
  // surface SofaScore match widgets. Parse defensively — a bad value just means
  // no widgets, never a crashed screen.
  const fixture = useMemo<Fixture | null>(() => {
    if (!params.fixture) return null;
    try {
      return JSON.parse(params.fixture) as Fixture;
    } catch {
      return null;
    }
  }, [params.fixture]);
  const iconColor = useThemeColor({}, 'icon');
  const stopVideoRef = useRef<(() => void) | null>(null);

  // Look up channel from route params
  const [channel, setChannel] = useState<Channel | null>(null);
  const [isLoadingChannel, setIsLoadingChannel] = useState(true);

  // Resume playback state
  const [startPosition, setStartPosition] = useState(0);
  const [isResumeResolved, setIsResumeResolved] = useState(false);
  const [resumeDialogData, setResumeDialogData] = useState<{ position: number } | null>(null);

  // Dismiss mini-player when this screen mounts (expanding from bar or new channel)
  useEffect(() => {
    useCastMiniPlayerStore.getState().dismiss();
  }, []);

  // Reset stores not covered by the orchestrator's unmount cleanup.
  useEffect(() => {
    useVideoNetworkStore.getState().reset();
    useGestureStore.getState().reset();
    return () => {
      usePlaybackQueueStore.getState().reset();
    };
  }, []);

  // Playback queue navigation
  const queueHasNavigation = usePlaybackQueueStore(s => s.items.length > 1);
  const hasNavigation = queueHasNavigation && contentType !== 'movie';

  const handleChannelSwitch = useCallback((newItem: PlaybackQueueItem | null) => {
    if (!newItem) return;
    stopVideoRef.current?.();
    setStartPosition(0);
    setIsResumeResolved(false);
    setResumeDialogData(null);
    setChannel(newItem.channel);
    setIsLoadingChannel(false);
  }, []);

  const handleNext = useCallback(() => {
    const nextItem = usePlaybackQueueStore.getState().goNext();
    handleChannelSwitch(nextItem);
  }, [handleChannelSwitch]);

  const handlePrevious = useCallback(() => {
    const prevItem = usePlaybackQueueStore.getState().goPrevious();
    handleChannelSwitch(prevItem);
  }, [handleChannelSwitch]);

  useEffect(() => {
    if (!params.channelId || !params.playlistId) {
      setIsLoadingChannel(false);
      return;
    }

    RustChannelService.getChannelById(params.playlistId, params.channelId)
      .then(setChannel)
      .catch((error) => {
        console.error('Failed to load channel:', error);
      })
      .finally(() => setIsLoadingChannel(false));
  }, [params.channelId, params.playlistId]);

  // Check for saved position to prompt resume
  useEffect(() => {
    if (!channel || isLoadingChannel) return;

    if (contentType === 'live') {
      setIsResumeResolved(true);
      return;
    }

    const userId = useUserStore.getState().currentUser?.id;
    if (!userId || !params.playlistId) {
      setIsResumeResolved(true);
      return;
    }

    const channelId = getChannelId(channel);
    useUserStore.getState().getSavedPosition(userId, params.playlistId, channelId)
      .then((saved) => {
        if (!saved) {
          setIsResumeResolved(true);
          return;
        }

        setResumeDialogData({ position: saved.lastPosition });
      })
      .catch(() => {
        setIsResumeResolved(true);
      });
  }, [channel, isLoadingChannel, contentType, params.playlistId]);

  useLayoutEffect(() => {
    const backHandler = BackHandler.addEventListener('hardwareBackPress', () => {
      const isCasting = useVideoPlayerStore.getState().isCasting;
      if (isCasting && channel && params.playlistId) {
        useCastMiniPlayerStore.getState().activate(channel, params.playlistId, contentType);
      } else {
        stopVideoRef.current?.();
      }
      router.back();
      return true;
    });

    return () => backHandler.remove();
  }, [router, channel, params.playlistId, contentType]);

  const handleGoBack = () => {
    const isCasting = useVideoPlayerStore.getState().isCasting;
    if (isCasting && channel && params.playlistId) {
      useCastMiniPlayerStore.getState().activate(channel, params.playlistId, contentType);
    } else {
      stopVideoRef.current?.();
    }
    router.back();
  };

  const handleStopVideo = () => {
    // This will be called when video stops
  };

  const handleRegisterStopFunction = (stopFn: () => void) => {
    stopVideoRef.current = stopFn;
  };

  if (isLoadingChannel || !isResumeResolved) {
    return (
      <ThemedView style={styles.errorContainer}>
        <StatusBar hidden />
        {resumeDialogData && (
          <ConfirmDialog
            visible
            title="Resume Playback"
            message={`You were at ${formatPosition(resumeDialogData.position)}. Continue where you left off?`}
            actions={[
              {
                title: 'From Beginning',
                onPress: () => {
                  setResumeDialogData(null);
                  setIsResumeResolved(true);
                },
              },
              {
                title: 'Continue',
                variant: 'primary',
                onPress: () => {
                  setStartPosition(resumeDialogData.position);
                  setResumeDialogData(null);
                  setIsResumeResolved(true);
                },
              },
            ]}
          />
        )}
      </ThemedView>
    );
  }

  if (!channel) {
    return (
      <ThemedView style={styles.errorContainer}>
        <StatusBar hidden />
        <IconSymbol name="exclamationmark.triangle" size={64} color={iconColor} />
        <ThemedText style={styles.errorTitle}>Invalid Channel</ThemedText>
        <ThemedText style={styles.errorSubtitle} type="subtitle">
          No channel data was provided
        </ThemedText>
      </ThemedView>
    );
  }

  return (
    <ThemedView style={styles.container}>
      <StatusBar hidden />
      <VideoPlayer
        channel={channel}
        playlistId={params.playlistId}
        contentType={contentType}
        startPosition={startPosition}
        onBack={handleGoBack}
        onStopVideo={handleStopVideo}
        onRegisterStopFunction={handleRegisterStopFunction}
        onNext={handleNext}
        onPrevious={handlePrevious}
        hasNavigation={hasNavigation}
        fixture={fixture}
      />
    </ThemedView>
  );
}

const styles = {
  container: {
    flex: 1,
    backgroundColor: '#000',
  },
  errorContainer: {
    flex: 1,
    justifyContent: 'center' as const,
    alignItems: 'center' as const,
    padding: 32,
    backgroundColor: '#000',
  },
  errorTitle: {
    fontSize: 20,
    fontWeight: '600' as const,
    marginTop: 16,
    marginBottom: 8,
    textAlign: 'center' as const,
  },
  errorSubtitle: {
    fontSize: 14,
    textAlign: 'center' as const,
    lineHeight: 20,
  },
};