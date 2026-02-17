import { Button } from '@/components/ui/controls/button';
import { ModalHeader } from '@/components/ui/containers/modal/modal-header';
import { ThemedText } from '@/components/ui/display/themed-text';
import { ThemedView } from '@/components/ui/display/themed-view';
import { FavoriteStar } from '@/features/live/favorite-star';
import { useChannelSchedule } from '@/features/live/hooks/use-channel-schedule';
import { ScheduleProgrammeItem } from '@/features/live/schedule-programme-item';
import { useThemeColor } from '@/hooks/use-theme-color';
import { getChannelId } from '@/lib/channel-utils';
import { THEME } from '@/lib/theme';
import type { Channel } from '@/types/playlist.types';
import type { EpgProgramme } from 'expo-m3u-parser';
import { useEffect, useState } from 'react';
import {
  ActivityIndicator,
  Image,
  Modal,
  ScrollView,
  StyleSheet,
  TouchableOpacity,
  View,
  useColorScheme,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

interface ChannelDetailModalProps {
  visible: boolean;
  onClose: () => void;
  channel: Channel | null;
  playlistId: string | null | undefined;
  onPlayPress: (channel: Channel) => void;
  currentProgramme?: EpgProgramme | null;
  nextProgramme?: EpgProgramme | null;
}

function formatDate(date: Date): string {
  return date.toLocaleDateString([], { weekday: 'short', day: 'numeric', month: 'short' });
}

function formatTime(unixSeconds: number): string {
  const d = new Date(unixSeconds * 1000);
  return d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
}

export function ChannelDetailModal({
  visible,
  onClose,
  channel,
  onPlayPress,
  currentProgramme,
  nextProgramme,
}: ChannelDetailModalProps) {
  const [imageError, setImageError] = useState(false);
  const insets = useSafeAreaInsets();
  const tintColor = useThemeColor({}, 'tint');
  const colorScheme = useColorScheme() ?? 'dark';
  const ringColor = THEME[colorScheme].ring;

  const channelTvgId = channel?.tvg?.id ?? null;

  const { schedule, isLoading: isScheduleLoading, selectedDate, setSelectedDate } =
    useChannelSchedule(channelTvgId, visible);

  useEffect(() => {
    setImageError(false);
  }, [channel?.name]);

  const now = Date.now() / 1000;

  const handlePrevDay = () => {
    const prev = new Date(selectedDate);
    prev.setDate(prev.getDate() - 1);
    setSelectedDate(prev);
  };

  const handleNextDay = () => {
    const next = new Date(selectedDate);
    next.setDate(next.getDate() + 1);
    setSelectedDate(next);
  };

  if (!channel) return null;

  const handlePlay = () => {
    onPlayPress(channel);
  };

  const posterUrl = channel.tvg.logo;
  const duration = currentProgramme ? currentProgramme.stop - currentProgramme.start : 0;
  const elapsed = currentProgramme ? now - currentProgramme.start : 0;
  const progressPercent = duration > 0 ? Math.min(Math.max((elapsed / duration) * 100, 0), 100) : 0;

  return (
    <Modal
      visible={visible}
      animationType="slide"
      presentationStyle="pageSheet"
      onRequestClose={onClose}
    >
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

        <ScrollView style={styles.scrollView} contentContainerStyle={styles.scrollContent}>
          {/* Channel Logo */}
          {posterUrl && !imageError ? (
            <Image
              source={{ uri: posterUrl }}
              style={styles.logo}
              resizeMode="contain"
              onError={() => setImageError(true)}
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
                <TouchableOpacity onPress={handlePrevDay} style={styles.dateButton}>
                  <ThemedText style={styles.dateArrow}>{'<'}</ThemedText>
                </TouchableOpacity>
                <ThemedText style={styles.dateText}>{formatDate(selectedDate)}</ThemedText>
                <TouchableOpacity onPress={handleNextDay} style={styles.dateButton}>
                  <ThemedText style={styles.dateArrow}>{'>'}</ThemedText>
                </TouchableOpacity>
              </View>

              {/* Schedule List */}
              {isScheduleLoading ? (
                <ActivityIndicator size="small" color={tintColor} style={styles.scheduleLoading} />
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
    </Modal>
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
