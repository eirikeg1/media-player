import { AnimatedModal } from '@/components/ui/containers/modal/animated-modal';
import { ModalHeader } from '@/components/ui/containers/modal/modal-header';
import { Button } from '@/components/ui/controls/button';
import { ThemedText } from '@/components/ui/display/themed-text';
import { useThemeColor } from '@/hooks/use-theme-color';
import type { EpgProgramme } from 'expo-m3u-parser';
import { Image } from 'expo-image';
import { ScrollView, StyleSheet, View } from 'react-native';

interface EpgProgrammeDetailModalProps {
  visible: boolean;
  onClose: () => void;
  programme: EpgProgramme | null;
  onWatchChannel?: () => void;
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

export function EpgProgrammeDetailModal({
  visible,
  onClose,
  programme,
  onWatchChannel,
}: EpgProgrammeDetailModalProps) {
  const tintColor = useThemeColor({}, 'tint');

  if (!programme) return null;

  return (
    <AnimatedModal visible={visible} onClose={onClose}>
      <ModalHeader title="Programme Info" onClose={onClose} />

      <ScrollView style={styles.scrollContent} showsVerticalScrollIndicator={false}>
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
          {onWatchChannel ? (
            <View style={styles.actionRow}>
              <Button
                title="Watch Channel"
                variant="primary"
                icon="play.fill"
                onPress={onWatchChannel}
                fullWidth
              />
            </View>
          ) : null}
        </View>
      </ScrollView>
    </AnimatedModal>
  );
}

const styles = StyleSheet.create({
  scrollContent: {
    flexGrow: 0,
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
