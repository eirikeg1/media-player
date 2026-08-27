import type { Fixture } from 'expo-m3u-parser';
import type { VideoPlayer } from 'expo-video';
import { TouchableOpacity, View } from 'react-native';
import { CastButton } from 'react-native-google-cast';
import type { SharedValue } from 'react-native-reanimated';

import { IconSymbol } from '@/components/ui/display/icon-symbol';
import { ThemedText } from '@/components/ui/display/themed-text';
import { getFixtureScoreDisplay } from '@/features/sports/match-widgets';
import { useThemeColor } from '@/hooks/use-theme-color';
import type { Channel } from '@/types/playlist.types';
import { VIDEO_CONSTANTS } from '../constants';
import { VideoSeekBar } from './video-seek-bar';

interface VideoControlsProps {
  channel: Channel;
  player: VideoPlayer;
  isLoading: boolean;
  isPlaying: boolean;
  currentTime?: number;
  duration?: number;
  isLive?: boolean;
  onBack?: () => void;
  onTogglePlayPause: () => void;
  onClearTimeout: () => void;
  onSeekStart?: () => void;
  onSeekEnd?: (time: number) => void;
  onSeek?: (time: number) => void;
  isGestureSeeking?: SharedValue<boolean>;
  seekTargetDisplay?: SharedValue<number>;
  onNext?: () => void;
  onPrevious?: () => void;
  hasNavigation?: boolean;
  /** Sports fixture associated with this stream, if launched from the sports tab. */
  fixture?: Fixture | null;
  /** Open the SofaScore match widget overlay. */
  onShowMatchInfo?: () => void;
  /** Reload a live stream at the live edge (only passed for live streams). */
  onResync?: () => void;
}

export function VideoControls({
  channel,
  player,
  isLoading,
  isPlaying,
  currentTime = 0,
  duration = 0,
  isLive = false,
  onBack,
  onTogglePlayPause,
  onClearTimeout,
  onSeekStart,
  onSeekEnd,
  onSeek,
  isGestureSeeking,
  seekTargetDisplay,
  onNext,
  onPrevious,
  hasNavigation = false,
  fixture,
  onShowMatchInfo,
  onResync,
}: VideoControlsProps) {
  const score = fixture ? getFixtureScoreDisplay(fixture) : null;
  const iconColor = useThemeColor({}, 'icon');
  const overlayColor = useThemeColor({ light: 'rgba(0, 0, 0, 0.3)', dark: 'rgba(0, 0, 0, 0.3)' }, 'background');
  const buttonBackground = useThemeColor({ light: 'rgba(0, 0, 0, 0.6)', dark: 'rgba(0, 0, 0, 0.6)' }, 'background');
  const textColor = useThemeColor({ light: '#fff', dark: '#fff' }, 'background');

  return (
    <View className="absolute inset-0" pointerEvents="box-none">
      <View
        className="absolute inset-0 justify-between"
        pointerEvents="box-none"
        style={{
          backgroundColor: overlayColor,
          paddingTop: VIDEO_CONSTANTS.OVERLAY_PADDING_TOP,
          paddingBottom: VIDEO_CONSTANTS.OVERLAY_PADDING_BOTTOM,
          paddingHorizontal: VIDEO_CONSTANTS.OVERLAY_PADDING_HORIZONTAL,
        }}
      >
        <View className="flex-row items-center" pointerEvents="box-none">
          <TouchableOpacity
            className="flex-row items-center"
            style={{
              paddingVertical: VIDEO_CONSTANTS.BACK_BUTTON_PADDING_VERTICAL,
              paddingHorizontal: VIDEO_CONSTANTS.BACK_BUTTON_PADDING_HORIZONTAL,
              backgroundColor: buttonBackground,
              borderRadius: VIDEO_CONSTANTS.BACK_BUTTON_BORDER_RADIUS,
            }}
            onPress={() => {
              onClearTimeout();
              onBack?.();
            }}
            accessibilityRole="button"
            accessibilityLabel="Go back"
          >
            <IconSymbol name="chevron.left" size={VIDEO_CONSTANTS.BACK_ICON_SIZE} color={iconColor} />
            <ThemedText
              style={{
                marginLeft: VIDEO_CONSTANTS.BACK_TEXT_MARGIN_LEFT,
                fontSize: VIDEO_CONSTANTS.BACK_TEXT_SIZE,
                fontWeight: '600',
                color: textColor,
              }}
            >
              Back
            </ThemedText>
          </TouchableOpacity>
        </View>

        <View className="flex-1 justify-center items-center" pointerEvents="box-none">
          {!isLoading && (
            <View className="flex-row items-center" style={{ gap: VIDEO_CONSTANTS.NAV_BUTTON_GAP }}>
              {hasNavigation && (
                <TouchableOpacity
                  className="justify-center items-center"
                  style={{
                    width: VIDEO_CONSTANTS.NAV_BUTTON_SIZE,
                    height: VIDEO_CONSTANTS.NAV_BUTTON_SIZE,
                    borderRadius: VIDEO_CONSTANTS.NAV_BUTTON_RADIUS,
                    backgroundColor: buttonBackground,
                  }}
                  onPress={() => {
                    onClearTimeout();
                    onPrevious?.();
                  }}
                  accessibilityRole="button"
                  accessibilityLabel="Previous"
                >
                  <IconSymbol
                    name="backward.end.fill"
                    size={VIDEO_CONSTANTS.NAV_ICON_SIZE}
                    color={iconColor}
                  />
                </TouchableOpacity>
              )}

              <TouchableOpacity
                className="justify-center items-center"
                style={{
                  width: VIDEO_CONSTANTS.PLAY_BUTTON_SIZE,
                  height: VIDEO_CONSTANTS.PLAY_BUTTON_SIZE,
                  borderRadius: VIDEO_CONSTANTS.PLAY_BUTTON_RADIUS,
                  backgroundColor: buttonBackground,
                }}
                onPress={() => {
                  onClearTimeout();
                  onTogglePlayPause();
                }}
                accessibilityRole="button"
                accessibilityLabel={isPlaying ? 'Pause' : 'Play'}
              >
                <IconSymbol
                  name={isPlaying ? 'pause.fill' : 'play.fill'}
                  size={VIDEO_CONSTANTS.PLAY_ICON_SIZE}
                  color={iconColor}
                />
              </TouchableOpacity>

              {hasNavigation && (
                <TouchableOpacity
                  className="justify-center items-center"
                  style={{
                    width: VIDEO_CONSTANTS.NAV_BUTTON_SIZE,
                    height: VIDEO_CONSTANTS.NAV_BUTTON_SIZE,
                    borderRadius: VIDEO_CONSTANTS.NAV_BUTTON_RADIUS,
                    backgroundColor: buttonBackground,
                  }}
                  onPress={() => {
                    onClearTimeout();
                    onNext?.();
                  }}
                  accessibilityRole="button"
                  accessibilityLabel="Next"
                >
                  <IconSymbol
                    name="forward.end.fill"
                    size={VIDEO_CONSTANTS.NAV_ICON_SIZE}
                    color={iconColor}
                  />
                </TouchableOpacity>
              )}
            </View>
          )}
        </View>

        <View className="bg-transparent" pointerEvents="box-none">
          {score && onShowMatchInfo && (
            <View className="items-center" style={{ marginBottom: 12 }} pointerEvents="box-none">
              <TouchableOpacity
                className="flex-row items-center"
                style={{
                  gap: 10,
                  paddingVertical: 8,
                  paddingHorizontal: 14,
                  backgroundColor: buttonBackground,
                  borderRadius: 20,
                }}
                onPress={() => {
                  onClearTimeout();
                  onShowMatchInfo();
                }}
                accessibilityRole="button"
                accessibilityLabel="Show match info and stats"
              >
                <IconSymbol name="sportscourt.fill" size={18} color={textColor} />
                <ThemedText style={{ color: textColor, fontWeight: '600', fontSize: 14 }} numberOfLines={1}>
                  {score.home}
                </ThemedText>
                <ThemedText style={{ color: score.statusColor, fontWeight: '700', fontSize: 15 }}>
                  {score.score ?? 'vs'}
                </ThemedText>
                <ThemedText style={{ color: textColor, fontWeight: '600', fontSize: 14 }} numberOfLines={1}>
                  {score.away}
                </ThemedText>
                <View className="flex-row items-center" style={{ gap: 4, marginLeft: 2 }}>
                  {score.isLive && (
                    <View style={{ width: 7, height: 7, borderRadius: 3.5, backgroundColor: score.statusColor }} />
                  )}
                  <ThemedText style={{ color: score.statusColor, fontWeight: '600', fontSize: 12 }}>
                    {score.status}
                  </ThemedText>
                </View>
                <IconSymbol name="chevron.up" size={16} color={textColor} />
              </TouchableOpacity>
            </View>
          )}
          {isLive && onResync && !isLoading && (
            // Live streams have no seek bar; offer a resync that reconnects
            // the stream at the live edge instead.
            <View className="items-center" style={{ marginBottom: 8 }} pointerEvents="box-none">
              <TouchableOpacity
                className="flex-row items-center"
                style={{
                  gap: 8,
                  paddingVertical: 7,
                  paddingHorizontal: 14,
                  backgroundColor: buttonBackground,
                  borderRadius: 18,
                }}
                onPress={() => {
                  onClearTimeout();
                  onResync();
                }}
                accessibilityRole="button"
                accessibilityLabel="Resync to live"
              >
                <View
                  style={{ width: 7, height: 7, borderRadius: 3.5, backgroundColor: '#FF3B30' }}
                />
                <ThemedText style={{ color: textColor, fontWeight: '600', fontSize: 13 }}>
                  Resync to live
                </ThemedText>
                <IconSymbol name="arrow.clockwise" size={15} color={textColor} />
              </TouchableOpacity>
            </View>
          )}
          {!isLive && duration > 0 && onSeekStart && onSeekEnd && (
            <VideoSeekBar
              currentTime={currentTime}
              duration={duration}
              onSeekStart={onSeekStart}
              onSeekEnd={onSeekEnd}
              onSeek={onSeek}
              isGestureSeeking={isGestureSeeking}
              seekTargetDisplay={seekTargetDisplay}
            />
          )}
          <ThemedText
            pointerEvents="none"
            style={{
              fontSize: VIDEO_CONSTANTS.CHANNEL_NAME_SIZE,
              fontWeight: '600',
              color: textColor,
              textAlign: 'center',
              marginTop: !isLive && duration > 0 ? 8 : 0,
            }}
            numberOfLines={1}
          >
            {channel.name}
          </ThemedText>
        </View>
      </View>

      {/* CastButton outside overlay — receives native touches */}
      <View
        style={{
          position: 'absolute',
          top: VIDEO_CONSTANTS.OVERLAY_PADDING_TOP,
          right: VIDEO_CONSTANTS.OVERLAY_PADDING_HORIZONTAL,
          backgroundColor: buttonBackground,
          borderRadius: VIDEO_CONSTANTS.BACK_BUTTON_BORDER_RADIUS,
          padding: VIDEO_CONSTANTS.BACK_BUTTON_PADDING_VERTICAL,
        }}
      >
        <CastButton
          style={{ width: 28, height: 28, tintColor: iconColor }}
        />
      </View>
    </View>
  );
}

interface VideoTapOverlayProps {
  onTap: () => void;
}

export function VideoTapOverlay({ onTap }: VideoTapOverlayProps) {
  return (
    <TouchableOpacity
      className="absolute inset-0 bg-transparent"
      onPress={onTap}
      activeOpacity={1}
      accessibilityRole="button"
      accessibilityLabel="Show video controls"
    />
  );
}
