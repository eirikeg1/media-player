import { TouchableOpacity, View } from 'react-native';

import { IconSymbol } from '@/components/ui/display/icon-symbol';
import { ThemedText } from '@/components/ui/display/themed-text';
import { useThemeColor } from '@/hooks/use-theme-color';
import type { Channel } from '@/types/playlist.types';
import { VIDEO_CONSTANTS } from '../constants';
import type { VideoError } from '../types/video-error.types';

interface VideoLoadingStateProps {
  channel: Channel;
}

export function VideoLoadingState({ channel }: VideoLoadingStateProps) {
  const iconColor = useThemeColor({}, 'icon');
  const overlayBackground = useThemeColor({ light: 'rgba(0, 0, 0, 0.8)', dark: 'rgba(0, 0, 0, 0.8)' }, 'background');
  const titleColor = useThemeColor({ light: '#fff', dark: '#fff' }, 'background');
  const subtitleColor = useThemeColor({ light: '#ccc', dark: '#ccc' }, 'background');

  return (
    <View
      className="absolute inset-0 justify-center items-center"
      style={{
        backgroundColor: overlayBackground,
        padding: VIDEO_CONSTANTS.STATE_CONTAINER_PADDING,
      }}
    >
      <IconSymbol name="tv" size={VIDEO_CONSTANTS.STATE_ICON_SIZE} color={iconColor} />
      <ThemedText
        style={{
          fontSize: VIDEO_CONSTANTS.LOADING_TITLE_SIZE,
          fontWeight: '600',
          marginTop: VIDEO_CONSTANTS.STATE_TITLE_MARGIN_TOP,
          marginBottom: VIDEO_CONSTANTS.STATE_TITLE_MARGIN_BOTTOM,
          color: titleColor,
          textAlign: 'center',
        }}
      >
        Loading Channel
      </ThemedText>
      <ThemedText
        type="subtitle"
        style={{
          fontSize: VIDEO_CONSTANTS.SUBTITLE_SIZE,
          color: subtitleColor,
          textAlign: 'center',
          lineHeight: VIDEO_CONSTANTS.SUBTITLE_LINE_HEIGHT,
        }}
      >
        {channel.name}
      </ThemedText>
    </View>
  );
}

interface VideoCastingStateProps {
  channel: Channel;
}

export function VideoCastingState({ channel }: VideoCastingStateProps) {
  const iconColor = useThemeColor({}, 'icon');
  const overlayBackground = useThemeColor({ light: 'rgba(0, 0, 0, 0.8)', dark: 'rgba(0, 0, 0, 0.8)' }, 'background');
  const titleColor = useThemeColor({ light: '#fff', dark: '#fff' }, 'background');
  const subtitleColor = useThemeColor({ light: '#ccc', dark: '#ccc' }, 'background');

  return (
    <View
      className="absolute inset-0 justify-center items-center"
      style={{
        backgroundColor: overlayBackground,
        padding: VIDEO_CONSTANTS.STATE_CONTAINER_PADDING,
      }}
    >
      <View className="absolute inset-0 justify-center items-center" pointerEvents="none">
        <IconSymbol name="play.tv.fill" size={160} color="#fff" style={{ opacity: 0.08 }} />
      </View>
      <IconSymbol name="airplayvideo" size={VIDEO_CONSTANTS.STATE_ICON_SIZE} color={iconColor} />
      <ThemedText
        style={{
          fontSize: VIDEO_CONSTANTS.LOADING_TITLE_SIZE,
          fontWeight: '600',
          marginTop: VIDEO_CONSTANTS.STATE_TITLE_MARGIN_TOP,
          marginBottom: VIDEO_CONSTANTS.STATE_TITLE_MARGIN_BOTTOM,
          color: titleColor,
          textAlign: 'center',
        }}
      >
        Casting to TV
      </ThemedText>
      <ThemedText
        type="subtitle"
        style={{
          fontSize: VIDEO_CONSTANTS.SUBTITLE_SIZE,
          color: subtitleColor,
          textAlign: 'center',
          lineHeight: VIDEO_CONSTANTS.SUBTITLE_LINE_HEIGHT,
        }}
      >
        {channel.name}
      </ThemedText>
    </View>
  );
}

interface VideoErrorStateProps {
  channel: Channel;
  error: VideoError;
  onRetry: () => void;
  isRetrying?: boolean;
}

export function VideoErrorState({ error, onRetry, isRetrying = false }: VideoErrorStateProps) {
  const iconColor = useThemeColor({}, 'icon');
  const overlayBackground = useThemeColor({ light: 'rgba(0, 0, 0, 0.8)', dark: 'rgba(0, 0, 0, 0.8)' }, 'background');
  const titleColor = useThemeColor({ light: '#fff', dark: '#fff' }, 'background');
  const subtitleColor = useThemeColor({ light: '#ccc', dark: '#ccc' }, 'background');
  const suggestionColor = useThemeColor({ light: '#e5e7eb', dark: '#e5e7eb' }, 'background');
  const retryButtonBackground = useThemeColor({ light: 'rgba(255, 255, 255, 0.2)', dark: 'rgba(255, 255, 255, 0.2)' }, 'background');
  const retryButtonText = useThemeColor({ light: '#fff', dark: '#fff' }, 'background');

  return (
    <View
      className="absolute inset-0 justify-center items-center"
      style={{
        backgroundColor: overlayBackground,
        padding: VIDEO_CONSTANTS.STATE_CONTAINER_PADDING,
      }}
    >
      <IconSymbol name="exclamationmark.triangle" size={VIDEO_CONSTANTS.STATE_ICON_SIZE} color={iconColor} />

      <ThemedText
        style={{
          fontSize: VIDEO_CONSTANTS.ERROR_TITLE_SIZE,
          fontWeight: '600',
          marginTop: VIDEO_CONSTANTS.STATE_TITLE_MARGIN_TOP,
          marginBottom: VIDEO_CONSTANTS.STATE_TITLE_MARGIN_BOTTOM,
          color: titleColor,
          textAlign: 'center',
        }}
      >
        {error.title}
      </ThemedText>

      <ThemedText
        type="subtitle"
        style={{
          fontSize: VIDEO_CONSTANTS.SUBTITLE_SIZE,
          color: subtitleColor,
          textAlign: 'center',
          lineHeight: VIDEO_CONSTANTS.SUBTITLE_LINE_HEIGHT,
          marginBottom: 12,
        }}
      >
        {error.message}
      </ThemedText>

      <ThemedText
        style={{
          fontSize: 12,
          color: suggestionColor,
          textAlign: 'center',
          lineHeight: 16,
          marginBottom: VIDEO_CONSTANTS.ERROR_RETRY_MARGIN_BOTTOM,
          fontStyle: 'italic',
        }}
      >
        {error.suggestion}
      </ThemedText>

      {error.canRetry && (
        <TouchableOpacity
          style={{
            backgroundColor: retryButtonBackground,
            paddingHorizontal: VIDEO_CONSTANTS.RETRY_BUTTON_PADDING_HORIZONTAL,
            paddingVertical: VIDEO_CONSTANTS.RETRY_BUTTON_PADDING_VERTICAL,
            borderRadius: VIDEO_CONSTANTS.BACK_BUTTON_BORDER_RADIUS,
            opacity: isRetrying ? 0.6 : 1,
          }}
          onPress={onRetry}
          disabled={isRetrying}
          accessibilityRole="button"
          accessibilityLabel="Retry playback"
        >
          <ThemedText
            style={{
              fontSize: VIDEO_CONSTANTS.RETRY_BUTTON_TEXT_SIZE,
              fontWeight: '600',
              color: retryButtonText,
            }}
          >
            {isRetrying ? 'Retrying...' : 'Try Again'}
          </ThemedText>
        </TouchableOpacity>
      )}
    </View>
  );
}