import { ModalHeader } from '@/components/ui/containers/modal/modal-header';
import { Button } from '@/components/ui/controls/button';
import { Spinner } from '@/components/ui/display/state';
import { ThemedText } from '@/components/ui/display/themed-text';
import { ThemedView } from '@/components/ui/display/themed-view';
import { FavoriteStar } from '@/features/live/favorite-star';
import { useChannelSchedule } from '@/features/live/hooks/use-channel-schedule';
import { useNowNextProgrammes } from '@/features/live/hooks/use-now-next-programmes';
import { ScheduleProgrammeItem } from '@/features/live/schedule-programme-item';
import { useChromeInsets } from '@/hooks/use-chrome-insets';
import { useNowSeconds } from '@/hooks/use-now-seconds';
import { getChannelId } from '@/lib/channel-utils';
import { channelHref } from '@/lib/detail-hrefs';
import { hrefParam } from '@/lib/route-params';
import { formatTime } from '@/lib/format-time';
import { THEME } from '@/lib/theme';
import type { Channel } from '@/types/playlist.types';
import { useRouter } from 'expo-router';
import { useCallback, useState } from 'react';
import {
  Image,
  ScrollView,
  StyleSheet,
  TouchableOpacity,
  View,
  useColorScheme,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

interface ChannelDetailProps {
  channel: Channel;
  playlistId: string;
  /** Leave the detail surface — the route supplies `router.back()`. */
  onClose: () => void;
}

function formatDate(date: Date): string {
  return date.toLocaleDateString([], { weekday: 'short', day: 'numeric', month: 'short' });
}

/**
 * Everything a live channel's detail surface shows. Rendered by
 * `/(detail)/channel`, which owns the presentation; this component owns the
 * content and the step that follows it, pushing the player itself so that
 * backing out of playback returns here rather than to the grid.
 *
 * The queue the player navigates with is *not* staged here: the surrounding
 * channel list belongs to the screen that opened this surface, so it stages the
 * handover before pushing this route (see `usePlaybackQueueStore.stageQueue`).
 * That handover survives the hop because nothing consumes it until the player
 * starts its session.
 */
export function ChannelDetail({ channel, playlistId, onClose }: ChannelDetailProps) {
  const router = useRouter();
  const [failedPosterUrl, setFailedPosterUrl] = useState<string | null>(null);
  const insets = useSafeAreaInsets();
  const chromeInsets = useChromeInsets();
  const colorScheme = useColorScheme() ?? 'dark';
  const ringColor = THEME[colorScheme].ring;

  const channelTvgId = channel.tvg?.id ?? null;
  // `tvg-shift`: both reads apply it, so the "on now" strip and the schedule
  // under it agree about what this channel is showing.
  const channelShiftHours = channel.tvg?.shift ?? 0;

  const { schedule, isLoading: isScheduleLoading, selectedDate, setSelectedDate } =
    useChannelSchedule(channelTvgId, channelShiftHours);
  const { currentProgramme, nextProgramme } = useNowNextProgrammes(
    channelTvgId,
    channelShiftHours
  );

  // Shared clock: the progress bar and the "on now" highlight advance with it.
  const now = useNowSeconds();

  const handlePrevDay = useCallback(() => {
    const prev = new Date(selectedDate);
    prev.setDate(prev.getDate() - 1);
    setSelectedDate(prev);
  }, [selectedDate, setSelectedDate]);

  const handleNextDay = useCallback(() => {
    const next = new Date(selectedDate);
    next.setDate(next.getDate() + 1);
    setSelectedDate(next);
  }, [selectedDate, setSelectedDate]);

  const handlePlay = useCallback(() => {
    router.push({
      pathname: '/video-player',
      params: {
        channelId: getChannelId(channel),
        playlistId,
        contentType: 'live',
        // Remembered by the session, so expanding the mini bar later puts this
        // surface back underneath the player.
        origin: hrefParam.encode(channelHref(playlistId, channel)),
      },
    });
  }, [router, channel, playlistId]);

  const posterUrl = channel.tvg.logo;
  const showPoster = !!posterUrl && failedPosterUrl !== posterUrl;
  const duration = currentProgramme ? currentProgramme.stop - currentProgramme.start : 0;
  const elapsed = currentProgramme ? now - currentProgramme.start : 0;
  const progressPercent = duration > 0 ? Math.min(Math.max((elapsed / duration) * 100, 0), 100) : 0;

  return (
    <ThemedView style={[styles.container, { paddingTop: insets.top }]}>
      <ModalHeader
        title={channel.name}
        subtitle={channel.group.title}
        onClose={onClose}
        headerRight={
          <FavoriteStar
            channelId={getChannelId(channel)}
            channelName={channel.name}
            size={22}
          />
        }
      />

      <ScrollView
        style={styles.scrollView}
        contentContainerStyle={[
          styles.scrollContent,
          { paddingBottom: styles.scrollContent.paddingBottom + chromeInsets.bottom },
        ]}
      >
        {/* Channel Logo */}
        {showPoster ? (
          <Image
            source={{ uri: posterUrl }}
            style={styles.logo}
            resizeMode="contain"
            onError={() => setFailedPosterUrl(posterUrl)}
          />
        ) : (
          <ThemedView style={styles.fallbackLogo}>
            <ThemedText style={styles.fallbackText}>
              {channel.name.charAt(0).toUpperCase()}
            </ThemedText>
          </ThemedView>
        )}

        {/* Now Playing Section */}
        {currentProgramme && (
          <View style={styles.nowPlayingSection}>
            <ThemedText style={styles.sectionLabel}>Now Playing</ThemedText>
            <ThemedText style={styles.nowPlayingTitle}>{currentProgramme.title}</ThemedText>
            {currentProgramme.subTitle && (
              <ThemedText style={styles.nowPlayingSubtitle}>{currentProgramme.subTitle}</ThemedText>
            )}
            <ThemedText style={styles.nowPlayingTime}>
              {formatTime(currentProgramme.start)} - {formatTime(currentProgramme.stop)}
            </ThemedText>
            <View style={styles.progressTrack}>
              <View style={[styles.progressBar, { width: `${progressPercent}%`, backgroundColor: ringColor }]} />
            </View>
            {currentProgramme.description && (
              <ThemedText style={styles.nowPlayingDescription} numberOfLines={3}>
                {currentProgramme.description}
              </ThemedText>
            )}
            {nextProgramme && (
              <ThemedText style={styles.nextLabel}>
                Next: {nextProgramme.title} ({formatTime(nextProgramme.start)})
              </ThemedText>
            )}
          </View>
        )}

        {/* Play Button */}
        <View style={styles.playButtonContainer}>
          <Button
            title="Watch Now"
            icon="play.fill"
            variant="primary"
            size="large"
            fullWidth
            onPress={handlePlay}
          />
        </View>

        {/* Schedule Section (only if channel has tvg.id) */}
        {channelTvgId && (
          <>
            {/* Date Navigation */}
            <View style={styles.dateNav}>
              <TouchableOpacity
                onPress={handlePrevDay}
                style={styles.dateButton}
                accessibilityRole="button"
                accessibilityLabel="Previous day"
              >
                <ThemedText style={styles.dateArrow}>{'<'}</ThemedText>
              </TouchableOpacity>
              <ThemedText style={styles.dateText}>{formatDate(selectedDate)}</ThemedText>
              <TouchableOpacity
                onPress={handleNextDay}
                style={styles.dateButton}
                accessibilityRole="button"
                accessibilityLabel="Next day"
              >
                <ThemedText style={styles.dateArrow}>{'>'}</ThemedText>
              </TouchableOpacity>
            </View>

            {/* Schedule List */}
            {isScheduleLoading ? (
              <Spinner style={styles.scheduleLoading} />
            ) : schedule.length > 0 ? (
              <View style={styles.scheduleList}>
                {schedule.map((programme) => (
                  <ScheduleProgrammeItem
                    key={`${programme.channelId}-${programme.start}`}
                    programme={programme}
                    isCurrent={programme.start <= now && programme.stop > now}
                  />
                ))}
              </View>
            ) : (
              <ThemedText style={styles.noSchedule}>No schedule available for this day</ThemedText>
            )}
          </>
        )}
      </ScrollView>
    </ThemedView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  scrollView: {
    flex: 1,
  },
  scrollContent: {
    paddingBottom: 40,
  },
  logo: {
    width: 120,
    height: 120,
    borderRadius: 12,
    alignSelf: 'center',
    marginVertical: 16,
    backgroundColor: '#1a1a1a',
  },
  fallbackLogo: {
    width: 120,
    height: 120,
    borderRadius: 12,
    alignSelf: 'center',
    marginVertical: 16,
    justifyContent: 'center',
    alignItems: 'center',
  },
  fallbackText: {
    fontSize: 40,
    fontWeight: '600',
  },
  nowPlayingSection: {
    paddingHorizontal: 16,
    marginBottom: 8,
  },
  sectionLabel: {
    fontSize: 12,
    fontWeight: '600',
    textTransform: 'uppercase',
    opacity: 0.5,
    marginBottom: 6,
  },
  nowPlayingTitle: {
    fontSize: 18,
    fontWeight: '600',
  },
  nowPlayingSubtitle: {
    fontSize: 14,
    opacity: 0.7,
    marginTop: 2,
  },
  nowPlayingTime: {
    fontSize: 13,
    opacity: 0.6,
    marginTop: 4,
  },
  progressTrack: {
    height: 4,
    backgroundColor: 'rgba(128, 128, 128, 0.2)',
    borderRadius: 2,
    marginTop: 8,
    overflow: 'hidden',
  },
  progressBar: {
    height: '100%',
    borderRadius: 2,
  },
  nowPlayingDescription: {
    fontSize: 13,
    opacity: 0.7,
    marginTop: 8,
    lineHeight: 19,
  },
  nextLabel: {
    fontSize: 13,
    opacity: 0.6,
    marginTop: 8,
    fontStyle: 'italic',
  },
  playButtonContainer: {
    paddingHorizontal: 16,
    marginTop: 16,
    marginBottom: 24,
  },
  dateNav: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 16,
    paddingVertical: 8,
    gap: 16,
  },
  dateButton: {
    padding: 8,
  },
  dateArrow: {
    fontSize: 18,
    fontWeight: '600',
  },
  dateText: {
    fontSize: 15,
    fontWeight: '500',
  },
  scheduleList: {
    marginTop: 4,
  },
  scheduleLoading: {
    marginTop: 24,
  },
  noSchedule: {
    textAlign: 'center',
    fontSize: 14,
    opacity: 0.5,
    marginTop: 24,
  },
});
