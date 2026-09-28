import { ModalHeader } from '@/components/ui/containers/modal/modal-header';
import { Button } from '@/components/ui/controls/button';
import { ThemedText } from '@/components/ui/display/themed-text';
import { ThemedView } from '@/components/ui/display/themed-view';
import { resolvePlayableChannel } from '@/features/live/resolve-channel';
import { useChromeInsets } from '@/hooks/use-chrome-insets';
import { useThemeColor } from '@/hooks/use-theme-color';
import { channelHref } from '@/lib/detail-hrefs';
import type { Channel } from '@/types/playlist.types';
import { Image } from 'expo-image';
import type { EpgProgramme } from 'expo-m3u-parser';
import { useRouter } from 'expo-router';
import { useCallback } from 'react';
import { ScrollView, StyleSheet, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

interface EpgProgrammeDetailProps {
  programme: EpgProgramme;
  playlistId: string;
  /** The channel this programme airs on, when the guide knew it. */
  channel: Channel | null;
  /** Leave the detail surface — the route supplies `router.back()`. */
  onClose: () => void;
}

function formatTime(unixSeconds: number): string {
  const date = new Date(unixSeconds * 1000);
  return date.toLocaleTimeString(undefined, {
    hour: '2-digit',
    minute: '2-digit',
    hour12: false,
  });
}

function formatDuration(startSeconds: number, stopSeconds: number): string {
  const minutes = Math.round((stopSeconds - startSeconds) / 60);
  if (minutes < 60) return `${minutes} min`;
  const hours = Math.floor(minutes / 60);
  const remainingMinutes = minutes % 60;
  return remainingMinutes > 0 ? `${hours}h ${remainingMinutes}m` : `${hours}h`;
}

/**
 * Everything a guide programme's detail surface shows. Rendered by
 * `/(detail)/programme`, which owns the presentation; this component owns the
 * content and the step that follows it, pushing the channel surface itself so
 * that back walks player → channel → programme → guide.
 */
export function EpgProgrammeDetail({
  programme,
  playlistId,
  channel,
  onClose,
}: EpgProgrammeDetailProps) {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const chromeInsets = useChromeInsets();
  const tintColor = useThemeColor({}, 'tint');

  // A guide row can name a channel pagination never loaded, so the playable row
  // is fetched at press time rather than when the guide rendered the cell.
  const handleWatchChannel = useCallback(() => {
    if (!channel) return;

    void resolvePlayableChannel(playlistId, channel).then((resolved) => {
      if (!resolved) return;
      router.push(channelHref(playlistId, resolved));
    });
  }, [router, playlistId, channel]);

  return (
    <ThemedView style={[styles.container, { paddingTop: insets.top }]}>
      <ModalHeader title="Programme Info" onClose={onClose} />

      <ScrollView
        style={styles.scrollView}
        showsVerticalScrollIndicator={false}
        contentContainerStyle={{ paddingBottom: insets.bottom + chromeInsets.bottom }}
      >
        <View style={styles.content}>
          {/* Programme icon */}
          {programme.icon ? (
            <Image
              source={{ uri: programme.icon }}
              style={styles.icon}
              contentFit="cover"
            />
          ) : null}

          {/* Title */}
          <ThemedText style={styles.title}>{programme.title}</ThemedText>

          {/* Subtitle */}
          {programme.subTitle ? (
            <ThemedText style={styles.subtitle}>{programme.subTitle}</ThemedText>
          ) : null}

          {/* Time info */}
          <View style={styles.timeRow}>
            <ThemedText style={styles.timeText}>
              {formatTime(programme.start)} - {formatTime(programme.stop)}
            </ThemedText>
            <ThemedText style={styles.durationText}>
              {formatDuration(programme.start, programme.stop)}
            </ThemedText>
          </View>

          {/* Category + Episode */}
          <View style={styles.metaRow}>
            {programme.category ? (
              <View style={[styles.categoryPill, { backgroundColor: tintColor + '30' }]}>
                <ThemedText style={[styles.categoryText, { color: tintColor }]}>
                  {programme.category}
                </ThemedText>
              </View>
            ) : null}
            {programme.episodeNum ? (
              <ThemedText style={styles.episodeText}>
                {programme.episodeNum}
              </ThemedText>
            ) : null}
          </View>

          {/* Description */}
          {programme.description ? (
            <ThemedText style={styles.description}>
              {programme.description}
            </ThemedText>
          ) : null}

          {/* Watch Channel button */}
          {channel ? (
            <View style={styles.actionRow}>
              <Button
                title="Watch Channel"
                variant="primary"
                icon="play.fill"
                onPress={handleWatchChannel}
                fullWidth
              />
            </View>
          ) : null}
        </View>
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
  content: {
    padding: 16,
    gap: 8,
  },
  icon: {
    width: '100%',
    height: 150,
    borderRadius: 8,
    marginBottom: 4,
  },
  title: {
    fontSize: 20,
    fontWeight: '700',
  },
  subtitle: {
    fontSize: 15,
    opacity: 0.7,
  },
  timeRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
  },
  timeText: {
    fontSize: 14,
    fontWeight: '500',
  },
  durationText: {
    fontSize: 13,
    opacity: 0.6,
  },
  metaRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  categoryPill: {
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 4,
  },
  categoryText: {
    fontSize: 12,
    fontWeight: '600',
  },
  episodeText: {
    fontSize: 12,
    opacity: 0.6,
  },
  description: {
    fontSize: 14,
    lineHeight: 20,
    opacity: 0.8,
    marginTop: 4,
  },
  actionRow: {
    marginTop: 12,
  },
});
