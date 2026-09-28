import { TouchableOpacity, View } from 'react-native';

import { IconSymbol } from '@/components/ui/display/icon-symbol';
import { ThemedText } from '@/components/ui/display/themed-text';
import { VIDEO_COLORS, VIDEO_CONSTANTS } from '../constants';
import type { VideoError } from '../types/video-error.types';

export function VideoCastingState() {
  return (
    <View
      className="absolute inset-0 justify-start items-center"
      style={{
        backgroundColor: VIDEO_COLORS.scrim,
        paddingTop: 60,
      }}
    >
      <View className="absolute inset-0 justify-center items-center" pointerEvents="none">
        <IconSymbol name="airplayvideo" size={200} color={VIDEO_COLORS.text} style={{ opacity: 0.08 }} />
      </View>
      <ThemedText
        style={{
          fontSize: VIDEO_CONSTANTS.LOADING_TITLE_SIZE,
          fontWeight: '600',
          color: VIDEO_COLORS.text,
          textAlign: 'center',
        }}
      >
        Casting to TV
      </ThemedText>
    </View>
  );
}

interface VideoErrorStateProps {
  error: VideoError;
  onRetry: () => void;
  /** Always offered: the error card covers the controls, so this is the only way out. */
  onBack?: () => void;
  isRetrying?: boolean;
}

export function VideoErrorState({ error, onRetry, onBack, isRetrying = false }: VideoErrorStateProps) {
  return (
    <View
      className="absolute inset-0 justify-center items-center"
      style={{
        backgroundColor: VIDEO_COLORS.scrim,
        padding: VIDEO_CONSTANTS.STATE_CONTAINER_PADDING,
      }}
    >
      <IconSymbol
        name="exclamationmark.triangle"
        size={VIDEO_CONSTANTS.STATE_ICON_SIZE}
        color={VIDEO_COLORS.text}
      />

      <ThemedText
        style={{
          fontSize: VIDEO_CONSTANTS.ERROR_TITLE_SIZE,
          fontWeight: '600',
          marginTop: VIDEO_CONSTANTS.STATE_TITLE_MARGIN_TOP,
          marginBottom: VIDEO_CONSTANTS.STATE_TITLE_MARGIN_BOTTOM,
          color: VIDEO_COLORS.text,
          textAlign: 'center',
        }}
      >
        {error.title}
      </ThemedText>

      <ThemedText
        type="subtitle"
        style={{
          fontSize: VIDEO_CONSTANTS.SUBTITLE_SIZE,
          color: VIDEO_COLORS.subtitle,
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
          color: VIDEO_COLORS.hint,
          textAlign: 'center',
          lineHeight: 16,
          marginBottom: VIDEO_CONSTANTS.ERROR_RETRY_MARGIN_BOTTOM,
          fontStyle: 'italic',
        }}
      >
        {error.suggestion}
      </ThemedText>

      <View className="flex-row items-center" style={{ gap: 12 }}>
        {onBack && (
          <VideoStateButton label="Go Back" onPress={onBack} accessibilityLabel="Go back" />
        )}
        {error.canRetry && (
          <VideoStateButton
            label={isRetrying ? 'Retrying...' : 'Try Again'}
            onPress={onRetry}
            disabled={isRetrying}
            accessibilityLabel="Retry playback"
          />
        )}
      </View>
    </View>
  );
}

interface VideoStateButtonProps {
  label: string;
  onPress: () => void;
  disabled?: boolean;
  accessibilityLabel: string;
}

/** The pill button the error and unavailable states offer their ways out with. */
export function VideoStateButton({
  label,
  onPress,
  disabled = false,
  accessibilityLabel,
}: VideoStateButtonProps) {
  return (
    <TouchableOpacity
      style={{
        backgroundColor: VIDEO_COLORS.actionButton,
        paddingHorizontal: VIDEO_CONSTANTS.RETRY_BUTTON_PADDING_HORIZONTAL,
        paddingVertical: VIDEO_CONSTANTS.RETRY_BUTTON_PADDING_VERTICAL,
        borderRadius: VIDEO_CONSTANTS.BACK_BUTTON_BORDER_RADIUS,
        opacity: disabled ? 0.6 : 1,
      }}
      onPress={onPress}
      disabled={disabled}
      accessibilityRole="button"
      accessibilityLabel={accessibilityLabel}
    >
      <ThemedText
        style={{
          fontSize: VIDEO_CONSTANTS.RETRY_BUTTON_TEXT_SIZE,
          fontWeight: '600',
          color: VIDEO_COLORS.text,
        }}
      >
        {label}
      </ThemedText>
    </TouchableOpacity>
  );
}
