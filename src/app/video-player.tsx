import { useLocalSearchParams, useRouter } from 'expo-router';
import { useEffect, useLayoutEffect, useRef, useState } from 'react';
import { BackHandler, StatusBar } from 'react-native';

import { VideoPlayer } from '@/components/domain/video/video-player';
import { IconSymbol } from '@/components/ui/display/icon-symbol';
import { ThemedText } from '@/components/ui/display/themed-text';
import { ThemedView } from '@/components/ui/display/themed-view';
import { useThemeColor } from '@/hooks/use-theme-color';
import { RustChannelService } from '@/services/rust-channel-service';
import type { Channel } from '@/types/playlist.types';

export default function VideoPlayerScreen() {
  const router = useRouter();
  const params = useLocalSearchParams<{ channelId: string; playlistId: string }>();
  const iconColor = useThemeColor({}, 'icon');
  const stopVideoRef = useRef<(() => void) | null>(null);

  // Look up channel from route params
  const [channel, setChannel] = useState<Channel | null>(null);
  const [isLoadingChannel, setIsLoadingChannel] = useState(true);

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

  useLayoutEffect(() => {
    const backHandler = BackHandler.addEventListener('hardwareBackPress', () => {
      // Stop video before navigating back
      stopVideoRef.current?.();
      router.back();
      return true;
    });

    return () => backHandler.remove();
  }, [router]);

  const handleGoBack = () => {
    // Stop video before navigating back
    stopVideoRef.current?.();
    router.back();
  };

  const handleStopVideo = () => {
    // This will be called when video stops
  };

  const handleRegisterStopFunction = (stopFn: () => void) => {
    stopVideoRef.current = stopFn;
  };

  if (isLoadingChannel) {
    return (
      <ThemedView style={styles.errorContainer}>
        <StatusBar hidden />
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
        onBack={handleGoBack}
        onStopVideo={handleStopVideo}
        onRegisterStopFunction={handleRegisterStopFunction}
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