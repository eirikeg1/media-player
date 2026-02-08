import { IconSymbol } from '@/components/ui/display/icon-symbol';
import { ThemedText } from '@/components/ui/display/themed-text';
import { ThemedView } from '@/components/ui/display/themed-view';
import { useThemeColor } from '@/hooks/use-theme-color';
import type { ParsedEpisode } from '@/lib/series-utils';
import type { Channel } from '@/types/playlist.types';
import { useState } from 'react';
import { StyleSheet, TouchableOpacity } from 'react-native';

interface SeasonAccordionProps {
  seasonNumber: number;
  episodes: ParsedEpisode[];
  onEpisodePress: (channel: Channel) => void;
}

export function SeasonAccordion({
  seasonNumber,
  episodes,
  onEpisodePress,
}: SeasonAccordionProps) {
  const [isOpen, setIsOpen] = useState(false);
  const iconColor = useThemeColor({}, 'icon');
  const borderColor = useThemeColor({ light: '#eee', dark: '#2a2a2a' }, 'icon');
  const tintColor = useThemeColor({}, 'tint');

  return (
    <ThemedView style={styles.container}>
      <TouchableOpacity
        style={[styles.header, { borderBottomColor: borderColor }]}
        onPress={() => setIsOpen((v) => !v)}
        activeOpacity={0.8}
      >
        <IconSymbol
          name="chevron.right"
          size={16}
          weight="medium"
          color={iconColor}
          style={{ transform: [{ rotate: isOpen ? '90deg' : '0deg' }] }}
        />
        <ThemedText type="defaultSemiBold" style={styles.headerText}>
          Season {seasonNumber}
        </ThemedText>
        <ThemedText style={[styles.episodeCountText, { color: iconColor }]}>
          {episodes.length} {episodes.length === 1 ? 'episode' : 'episodes'}
        </ThemedText>
      </TouchableOpacity>

      {isOpen && (
        <ThemedView style={styles.episodeList}>
          {episodes.map((ep) => (
            <TouchableOpacity
              key={`${ep.season}-${ep.episode}`}
              style={[styles.episodeRow, { borderBottomColor: borderColor }]}
              onPress={() => onEpisodePress(ep.channel)}
              activeOpacity={0.7}
            >
              <ThemedText style={[styles.episodeNumber, { color: tintColor }]}>
                E{ep.episode}
              </ThemedText>
              <ThemedText style={styles.episodeTitle} numberOfLines={1}>
                {ep.episodeTitle}
              </ThemedText>
              <IconSymbol name="play.fill" size={16} color={tintColor} />
            </TouchableOpacity>
          ))}
        </ThemedView>
      )}
    </ThemedView>
  );
}

const styles = StyleSheet.create({
  container: {
    marginBottom: 4,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 12,
    paddingHorizontal: 16,
    borderBottomWidth: 1,
    gap: 8,
  },
  headerText: {
    flex: 1,
    fontSize: 16,
  },
  episodeCountText: {
    fontSize: 13,
  },
  episodeList: {
    paddingLeft: 16,
  },
  episodeRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 10,
    paddingHorizontal: 16,
    borderBottomWidth: StyleSheet.hairlineWidth,
    gap: 12,
  },
  episodeNumber: {
    fontSize: 14,
    fontWeight: '600',
    width: 36,
  },
  episodeTitle: {
    flex: 1,
    fontSize: 14,
  },
});
