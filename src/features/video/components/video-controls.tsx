import type { Fixture } from 'expo-m3u-parser';
import { memo, useMemo } from 'react';
import { TouchableOpacity, View } from 'react-native';
import { CastButton } from 'react-native-google-cast';
import type { SharedValue } from 'react-native-reanimated';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { IconSymbol } from '@/components/ui/display/icon-symbol';
import { ThemedText } from '@/components/ui/display/themed-text';
import { useLiveTick } from '@/features/sports/hooks/use-live-tick';
import { getFixtureScoreDisplay, isMatchLive } from '@/features/sports/match-widgets';
import type { Channel } from '@/types/playlist.types';
import { VIDEO_COLORS, VIDEO_CONSTANTS } from '../constants';
import { VideoSeekBar } from './video-seek-bar';

interface VideoControlsProps {
  channel: Channel;
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

function VideoControlsComponent({
  channel,
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
  // The minute on the score button is counted from the device clock, so time
  // has to be an input or it freezes at whatever it read when the controls last
  // rendered — which, on a stream left playing, is the whole match.
  const tick = useLiveTick(!!fixture && isMatchLive(fixture));
  const score = useMemo(
    () => (fixture ? getFixtureScoreDisplay(fixture, new Date()) : null),
    // eslint-disable-next-line react-hooks/exhaustive-deps -- `tick` is the clock
    [fixture, tick]
  );
  // The screen is landscape and edge-to-edge: without these the back button
  // sits under the notch and the seek bar under the navigation bar.
  const insets = useSafeAreaInsets();

  return (
    <View className="absolute inset-0" pointerEvents="box-none">
      <View
        className="absolute inset-0 justify-between"
        pointerEvents="box-none"
        style={{
          backgroundColor: VIDEO_COLORS.overlay,
          paddingTop: VIDEO_CONSTANTS.OVERLAY_PADDING_TOP + insets.top,
          paddingBottom: VIDEO_CONSTANTS.OVERLAY_PADDING_BOTTOM + insets.bottom,
          paddingLeft: VIDEO_CONSTANTS.OVERLAY_PADDING_HORIZONTAL + insets.left,
          paddingRight: VIDEO_CONSTANTS.OVERLAY_PADDING_HORIZONTAL + insets.right,
        }}
      >
        <View className="flex-row items-center" pointerEvents="box-none">
          <TouchableOpacity
            className="flex-row items-center"
            style={{
              paddingVertical: VIDEO_CONSTANTS.BACK_BUTTON_PADDING_VERTICAL,
              paddingHorizontal: VIDEO_CONSTANTS.BACK_BUTTON_PADDING_HORIZONTAL,
              backgroundColor: VIDEO_COLORS.button,
              borderRadius: VIDEO_CONSTANTS.BACK_BUTTON_BORDER_RADIUS,
            }}
            onPress={() => {
              onClearTimeout();
              onBack?.();
            }}
            accessibilityRole="button"
            accessibilityLabel="Go back"
          >
            <IconSymbol name="chevron.left" size={VIDEO_CONSTANTS.BACK_ICON_SIZE} color={VIDEO_COLORS.text} />
            <ThemedText
              style={{
                marginLeft: VIDEO_CONSTANTS.BACK_TEXT_MARGIN_LEFT,
                fontSize: VIDEO_CONSTANTS.BACK_TEXT_SIZE,
                fontWeight: '600',
                color: VIDEO_COLORS.text,
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
                    backgroundColor: VIDEO_COLORS.button,
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
                    color={VIDEO_COLORS.text}
                  />
                </TouchableOpacity>
              )}

              <TouchableOpacity
                className="justify-center items-center"
                style={{
                  width: VIDEO_CONSTANTS.PLAY_BUTTON_SIZE,
                  height: VIDEO_CONSTANTS.PLAY_BUTTON_SIZE,
                  borderRadius: VIDEO_CONSTANTS.PLAY_BUTTON_RADIUS,
                  backgroundColor: VIDEO_COLORS.button,
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
                  color={VIDEO_COLORS.text}
                />
              </TouchableOpacity>

              {hasNavigation && (
                <TouchableOpacity
                  className="justify-center items-center"
                  style={{
                    width: VIDEO_CONSTANTS.NAV_BUTTON_SIZE,
                    height: VIDEO_CONSTANTS.NAV_BUTTON_SIZE,
                    borderRadius: VIDEO_CONSTANTS.NAV_BUTTON_RADIUS,
                    backgroundColor: VIDEO_COLORS.button,
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
                    color={VIDEO_COLORS.text}
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
                  backgroundColor: VIDEO_COLORS.button,
                  borderRadius: 20,
                }}
                onPress={() => {
                  onClearTimeout();
                  onShowMatchInfo();
                }}
                accessibilityRole="button"
                accessibilityLabel="Show match info and stats"
              >
                <IconSymbol name="sportscourt.fill" size={18} color={VIDEO_COLORS.text} />
                <ThemedText style={{ color: VIDEO_COLORS.text, fontWeight: '600', fontSize: 14 }} numberOfLines={1}>
                  {score.home}
                </ThemedText>
                <ThemedText style={{ color: score.statusColor, fontWeight: '700', fontSize: 15 }}>
                  {score.score ?? 'vs'}
                </ThemedText>
                <ThemedText style={{ color: VIDEO_COLORS.text, fontWeight: '600', fontSize: 14 }} numberOfLines={1}>
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
                <IconSymbol name="chevron.up" size={16} color={VIDEO_COLORS.text} />
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
                  backgroundColor: VIDEO_COLORS.button,
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
                  style={{ width: 7, height: 7, borderRadius: 3.5, backgroundColor: VIDEO_COLORS.live }}
                />
                <ThemedText style={{ color: VIDEO_COLORS.text, fontWeight: '600', fontSize: 13 }}>
                  Resync to live
                </ThemedText>
                <IconSymbol name="arrow.clockwise" size={15} color={VIDEO_COLORS.text} />
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
              color: VIDEO_COLORS.text,
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
          top: VIDEO_CONSTANTS.OVERLAY_PADDING_TOP + insets.top,
          right: VIDEO_CONSTANTS.OVERLAY_PADDING_HORIZONTAL + insets.right,
          backgroundColor: VIDEO_COLORS.button,
          borderRadius: VIDEO_CONSTANTS.BACK_BUTTON_BORDER_RADIUS,
          padding: VIDEO_CONSTANTS.BACK_BUTTON_PADDING_VERTICAL,
        }}
      >
        <CastButton
          style={{ width: 28, height: 28, tintColor: VIDEO_COLORS.text }}
        />
      </View>
    </View>
  );
}

/**
 * Memoised so the overlay only re-renders when what it displays actually
 * changes — not on every unrelated store write in the player tree.
 */
export const VideoControls = memo(VideoControlsComponent);
