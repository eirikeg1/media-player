import { Dropdown } from '@/components/ui/controls/inputs/dropdown';
import { IconSymbol } from '@/components/ui/display/icon-symbol';
import { COUNTRY_NAMES, COUNTRY_OPTIONS, getEffectiveSportsCountry } from '@/lib/country-utils';
import { useUserStore } from '@/stores/user/user-store';
import { Image } from 'expo-image';
import type { RankedBroadcast } from 'expo-m3u-parser';
import { memo, useCallback } from 'react';
import { ActivityIndicator, StyleSheet, Text, TouchableOpacity, View } from 'react-native';

import { FAINT, MUTED, SectionMessage } from './match-detail-shared';

interface MatchWatchTabProps {
  broadcasts: RankedBroadcast[];
  isLoading: boolean;
  onPlay: (channelId: string) => void;
}

function sourceLabel(source: string): string {
  switch (source) {
    case 'sofascore+epg':
      return 'Broadcaster + EPG';
    case 'sofascore':
      return 'Broadcaster';
    case 'epg':
      return 'EPG';
    case 'title':
      return 'Event channel';
    case 'time':
      return 'EPG (time)';
    default:
      return source;
  }
}

/** Channels carrying the match, best match first, with a country picker. */
export const MatchWatchTab = memo(function MatchWatchTab({ broadcasts, isLoading, onPlay }: MatchWatchTabProps) {
  const currentUser = useUserStore((s) => s.currentUser);
  const updateSettings = useUserStore((s) => s.updateSettings);
  const sportsCountry = currentUser?.settings?.sportsCountry ?? '';
  const country = getEffectiveSportsCountry(sportsCountry || undefined);

  const handleCountryChange = useCallback(
    (value: string) => {
      if (!currentUser) return;
      void updateSettings(currentUser.id, { sportsCountry: value || undefined });
    },
    [currentUser, updateSettings]
  );

  return (
    <View style={styles.container}>
      <View style={styles.headerRow}>
        <Text style={styles.sectionTitle}>Channels · {COUNTRY_NAMES[country] ?? country}</Text>
      </View>
      <Dropdown<string>
        label="Country"
        options={COUNTRY_OPTIONS}
        value={sportsCountry}
        onSelect={handleCountryChange}
        accessibilityLabel="TV channel country"
      />

      {isLoading ? (
        <View style={styles.loading}>
          <ActivityIndicator size="small" color="#FFFFFF" />
          <Text style={styles.loadingText}>Finding channels…</Text>
        </View>
      ) : broadcasts.length === 0 ? (
        <SectionMessage text="No channels in your playlist carry this match." />
      ) : (
        broadcasts.map((broadcast, index) => (
          <BroadcastRow key={broadcast.channelId} broadcast={broadcast} isBest={index === 0} onPlay={onPlay} />
        ))
      )}
    </View>
  );
});

const BroadcastRow = memo(function BroadcastRow({
  broadcast,
  isBest,
  onPlay,
}: {
  broadcast: RankedBroadcast;
  isBest: boolean;
  onPlay: (channelId: string) => void;
}) {
  const start = broadcast.programmeStart
    ? new Date(broadcast.programmeStart * 1000).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
    : null;
  const confidence = Math.round(broadcast.confidence * 100);

  return (
    <TouchableOpacity
      style={[styles.channelRow, isBest && styles.channelRowBest]}
      onPress={() => onPlay(broadcast.channelId)}
      activeOpacity={0.7}
      accessibilityRole="button"
      accessibilityLabel={`Watch on ${broadcast.tvgName || broadcast.title}`}
    >
      {broadcast.tvgLogo ? (
        <Image source={{ uri: broadcast.tvgLogo }} style={styles.channelLogo} contentFit="contain" />
      ) : (
        <View style={styles.channelLogoFallback}>
          <IconSymbol name="tv.fill" size={16} color="#FFFFFF" />
        </View>
      )}
      <View style={styles.channelInfo}>
        <Text style={styles.channelName} numberOfLines={1}>
          {broadcast.tvgName || broadcast.title}
        </Text>
        <Text style={styles.channelMeta} numberOfLines={1}>
          {broadcast.programmeTitle
            ? `${broadcast.programmeTitle}${start ? ` · ${start}` : ''}`
            : `${sourceLabel(broadcast.source)} · ${confidence}%`}
        </Text>
      </View>
      {isBest && (
        <View style={styles.bestPill}>
          <Text style={styles.bestText}>BEST</Text>
        </View>
      )}
      <IconSymbol name="play.circle.fill" size={26} color="#34C759" />
    </TouchableOpacity>
  );
});

const styles = StyleSheet.create({
  container: {
    gap: 10,
    padding: 16,
  },
  headerRow: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  sectionTitle: {
    color: '#FFFFFF',
    fontSize: 15,
    fontWeight: '700',
  },
  loading: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    padding: 24,
  },
  loadingText: {
    color: MUTED,
    fontSize: 14,
  },
  channelRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    padding: 12,
    borderRadius: 12,
    backgroundColor: FAINT,
  },
  channelRowBest: {
    borderWidth: 1,
    borderColor: 'rgba(52, 199, 89, 0.5)',
  },
  channelLogo: {
    width: 32,
    height: 32,
    borderRadius: 6,
  },
  channelLogoFallback: {
    width: 32,
    height: 32,
    borderRadius: 6,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: 'rgba(255,255,255,0.12)',
  },
  channelInfo: {
    flex: 1,
    gap: 2,
  },
  channelName: {
    color: '#FFFFFF',
    fontSize: 15,
    fontWeight: '600',
  },
  channelMeta: {
    color: MUTED,
    fontSize: 12,
  },
  bestPill: {
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: 6,
    backgroundColor: 'rgba(52, 199, 89, 0.2)',
  },
  bestText: {
    color: '#34C759',
    fontSize: 10,
    fontWeight: '800',
    letterSpacing: 0.5,
  },
});
