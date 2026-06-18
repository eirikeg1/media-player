import { Dropdown } from '@/components/ui/controls/inputs/dropdown';
import { ModalHeader } from '@/components/ui/containers/modal/modal-header';
import { IconSymbol } from '@/components/ui/display/icon-symbol';
import { ThemedText } from '@/components/ui/display/themed-text';
import { ThemedView } from '@/components/ui/display/themed-view';
import { useColorScheme } from '@/hooks/use-color-scheme';
import { COUNTRY_NAMES, COUNTRY_OPTIONS, getEffectiveSportsCountry } from '@/lib/country-utils';
import { GlassColors } from '@/lib/theme';
import { useUserStore } from '@/stores/user/user-store';
import { Image } from 'expo-image';
import type { Fixture, RankedBroadcast } from 'expo-m3u-parser';
import { memo, useCallback } from 'react';
import {
  ActivityIndicator,
  Modal,
  ScrollView,
  StyleSheet,
  TouchableOpacity,
  View,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { useFixtureBroadcasts } from './hooks/use-fixture-broadcasts';

interface FixtureDetailModalProps {
  visible: boolean;
  fixture: Fixture | null;
  onClose: () => void;
  onPlayChannel?: (channelId: string) => void;
}

function formatKickoffTime(ts: number): string {
  const date = new Date(ts * 1000);
  return date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
}

function formatKickoffDate(ts: number): string {
  const date = new Date(ts * 1000);
  return date.toLocaleDateString([], { weekday: 'short', month: 'short', day: 'numeric' });
}

function getStatusInfo(status: string, kickoffTime: number) {
  switch (status.toUpperCase()) {
    case 'IN_PLAY':
    case 'LIVE':
      return { text: 'LIVE', color: '#FF3B30' };
    case 'FINISHED':
      return { text: 'FT', color: '#8E8E93' };
    case 'PAUSED':
    case 'HALFTIME':
      return { text: 'HT', color: '#FF9500' };
    default:
      return { text: formatKickoffTime(kickoffTime), color: '#007AFF' };
  }
}

function sourceLabel(source: string): string {
  switch (source) {
    case 'sofascore+epg': return 'SofaScore + EPG';
    case 'sofascore': return 'SofaScore';
    case 'epg': return 'EPG';
    case 'title': return 'Channel name';
    case 'time': return 'EPG (time)';
    default: return source;
  }
}

export const FixtureDetailModal = memo(function FixtureDetailModal({
  visible,
  fixture,
  onClose,
  onPlayChannel,
}: FixtureDetailModalProps) {
  const insets = useSafeAreaInsets();
  const colorScheme = useColorScheme();
  const isDark = colorScheme === 'dark';
  const currentUser = useUserStore((s) => s.currentUser);
  const updateSettings = useUserStore((s) => s.updateSettings);
  const sportsCountry = currentUser?.settings?.sportsCountry ?? '';
  const country = getEffectiveSportsCountry(sportsCountry || undefined);

  const { broadcasts, isLoading } = useFixtureBroadcasts(visible ? fixture : null);

  const handleCountryChange = useCallback(
    (value: string) => {
      if (!currentUser) return;
      updateSettings(currentUser.id, { sportsCountry: value || undefined });
    },
    [currentUser, updateSettings]
  );

  if (!fixture) return null;

  const status = getStatusInfo(fixture.status, fixture.kickoffTime);
  const normalizedStatus = fixture.status.toUpperCase();
  const showScore = normalizedStatus !== 'SCHEDULED' && normalizedStatus !== 'TIMED';

  const surfaceColor = isDark ? GlassColors.dark.surface : GlassColors.light.surface;
  const borderColor = isDark ? GlassColors.dark.border : GlassColors.light.border;

  return (
    <Modal
      visible={visible}
      animationType="slide"
      presentationStyle="pageSheet"
      onRequestClose={onClose}
    >
      <ThemedView style={[styles.container, { paddingTop: insets.top }]}>
        <ModalHeader title="Match Details" onClose={onClose} />

        <ScrollView style={styles.scroll} contentContainerStyle={styles.scrollContent}>
          {/* Match header */}
          <View style={[styles.matchCard, { backgroundColor: surfaceColor, borderColor }]}>
            <ThemedText style={styles.competition}>{fixture.competitionName}</ThemedText>

            <View style={styles.matchRow}>
              <View style={styles.teamCol}>
                {fixture.homeTeamCrest && (
                  <Image source={{ uri: fixture.homeTeamCrest }} style={styles.crest} contentFit="contain" />
                )}
                <ThemedText style={styles.teamName} numberOfLines={2}>
                  {fixture.homeTeamShort || fixture.homeTeam}
                </ThemedText>
              </View>

              <View style={styles.scoreCol}>
                {showScore ? (
                  <>
                    <ThemedText style={[styles.score, { color: status.color }]}>
                      {fixture.homeScore ?? '-'} - {fixture.awayScore ?? '-'}
                    </ThemedText>
                    <ThemedText style={[styles.statusText, { color: status.color }]}>
                      {status.text}
                    </ThemedText>
                  </>
                ) : (
                  <>
                    <ThemedText style={[styles.kickoffTime, { color: status.color }]}>
                      {formatKickoffTime(fixture.kickoffTime)}
                    </ThemedText>
                    <ThemedText style={styles.kickoffDate}>
                      {formatKickoffDate(fixture.kickoffTime)}
                    </ThemedText>
                  </>
                )}
              </View>

              <View style={styles.teamCol}>
                {fixture.awayTeamCrest && (
                  <Image source={{ uri: fixture.awayTeamCrest }} style={styles.crest} contentFit="contain" />
                )}
                <ThemedText style={styles.teamName} numberOfLines={2}>
                  {fixture.awayTeamShort || fixture.awayTeam}
                </ThemedText>
              </View>
            </View>

            {(fixture.venue || fixture.matchday) && (
              <View style={styles.infoRow}>
                {fixture.venue && (
                  <ThemedText style={styles.infoText}>{fixture.venue}</ThemedText>
                )}
                {fixture.matchday && (
                  <ThemedText style={styles.infoText}>Matchday {fixture.matchday}</ThemedText>
                )}
              </View>
            )}
          </View>

          {/* TV Channels section */}
          <View style={styles.section}>
            <View style={styles.sectionHeader}>
              <IconSymbol name="tv" size={18} color={isDark ? '#fff' : '#000'} />
              <ThemedText style={styles.sectionTitle}>
                TV Channels ({COUNTRY_NAMES[country] ?? country})
              </ThemedText>
            </View>

            <View style={styles.countryPicker}>
              <Dropdown<string>
                label="Country"
                options={COUNTRY_OPTIONS}
                value={sportsCountry}
                onSelect={handleCountryChange}
                accessibilityLabel="TV channel country"
              />
            </View>

            {isLoading ? (
              <View style={styles.loadingContainer}>
                <ActivityIndicator size="small" color="#007AFF" />
                <ThemedText style={styles.loadingText}>Finding channels...</ThemedText>
              </View>
            ) : broadcasts.length === 0 ? (
              <View style={styles.emptyContainer}>
                <ThemedText style={styles.emptyText}>
                  No channels found for this match
                </ThemedText>
              </View>
            ) : (
              broadcasts.map((broadcast) => (
                <BroadcastRow
                  key={broadcast.channelId}
                  broadcast={broadcast}
                  isDark={isDark}
                  onPlay={onPlayChannel}
                />
              ))
            )}
          </View>
        </ScrollView>
      </ThemedView>
    </Modal>
  );
});

const BroadcastRow = memo(function BroadcastRow({
  broadcast,
  isDark,
  onPlay,
}: {
  broadcast: RankedBroadcast;
  isDark: boolean;
  onPlay?: (channelId: string) => void;
}) {
  const start = broadcast.programmeStart
    ? new Date(broadcast.programmeStart * 1000).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
    : null;

  return (
    <TouchableOpacity
      style={[
        styles.channelRow,
        {
          backgroundColor: isDark ? GlassColors.dark.surface : GlassColors.light.surface,
          borderColor: isDark ? GlassColors.dark.border : GlassColors.light.border,
        },
      ]}
      onPress={() => onPlay?.(broadcast.channelId)}
      disabled={!onPlay}
      activeOpacity={0.7}
    >
      {broadcast.tvgLogo ? (
        <Image source={{ uri: broadcast.tvgLogo }} style={styles.channelLogo} contentFit="contain" />
      ) : (
        <IconSymbol name="tv.fill" size={20} color="#007AFF" />
      )}
      <View style={styles.channelInfo}>
        <ThemedText style={styles.channelName} numberOfLines={1}>
          {broadcast.tvgName || broadcast.title}
        </ThemedText>
        {broadcast.programmeTitle && (
          <ThemedText style={styles.programmeText} numberOfLines={1}>
            {broadcast.programmeTitle}{start ? ` · ${start}` : ''}
          </ThemedText>
        )}
      </View>
      <View style={styles.channelMeta}>
        <ThemedText style={styles.sourceText}>{sourceLabel(broadcast.source)}</ThemedText>
      </View>
      {onPlay && (
        <IconSymbol name="play.circle.fill" size={24} color="#34C759" />
      )}
    </TouchableOpacity>
  );
});

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  scroll: {
    flex: 1,
  },
  scrollContent: {
    padding: 16,
    gap: 16,
    paddingBottom: 32,
  },
  matchCard: {
    borderRadius: 16,
    borderWidth: 1,
    padding: 20,
    gap: 12,
  },
  competition: {
    fontSize: 13,
    opacity: 0.6,
    textAlign: 'center',
    fontWeight: '600',
  },
  matchRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  teamCol: {
    flex: 1,
    alignItems: 'center',
    gap: 8,
  },
  crest: {
    width: 48,
    height: 48,
  },
  teamName: {
    fontSize: 14,
    fontWeight: '600',
    textAlign: 'center',
  },
  scoreCol: {
    alignItems: 'center',
    paddingHorizontal: 12,
    minWidth: 80,
  },
  score: {
    fontSize: 28,
    fontWeight: '700',
  },
  statusText: {
    fontSize: 11,
    fontWeight: '600',
    marginTop: 2,
  },
  kickoffTime: {
    fontSize: 22,
    fontWeight: '700',
  },
  kickoffDate: {
    fontSize: 12,
    opacity: 0.5,
    marginTop: 2,
  },
  infoRow: {
    flexDirection: 'row',
    justifyContent: 'center',
    gap: 12,
  },
  infoText: {
    fontSize: 12,
    opacity: 0.5,
  },
  section: {
    gap: 8,
  },
  sectionHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    marginBottom: 4,
  },
  sectionTitle: {
    fontSize: 16,
    fontWeight: '600',
    flex: 1,
  },
  countryPicker: {
    marginBottom: 4,
  },
  loadingContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    padding: 20,
  },
  loadingText: {
    fontSize: 14,
    opacity: 0.6,
  },
  emptyContainer: {
    padding: 20,
    alignItems: 'center',
  },
  emptyText: {
    fontSize: 14,
    opacity: 0.5,
  },
  channelRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    padding: 12,
    borderRadius: 12,
    borderWidth: 1,
  },
  channelLogo: {
    width: 28,
    height: 28,
    borderRadius: 4,
  },
  channelInfo: {
    flex: 1,
    gap: 2,
  },
  channelName: {
    fontSize: 15,
    fontWeight: '500',
  },
  programmeText: {
    fontSize: 12,
    opacity: 0.6,
  },
  channelMeta: {
    alignItems: 'flex-end',
  },
  sourceText: {
    fontSize: 10,
    opacity: 0.4,
    fontWeight: '500',
  },
});
