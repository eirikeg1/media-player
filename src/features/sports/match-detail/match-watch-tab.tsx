import { IconSymbol } from '@/components/ui/display/icon-symbol';
import { COUNTRY_NAMES, getEffectiveSportsCountry } from '@/lib/country-utils';
import { useUserStore } from '@/stores/user/user-store';
import { Image } from 'expo-image';
import type { Fixture, RankedBroadcast } from 'expo-m3u-parser';
import { memo, useEffect, useMemo, useState } from 'react';
import { StyleSheet, Text, TouchableOpacity, View } from 'react-native';

import { catchupBroadcasts, catchupWindow, type CatchupWindow } from '../catchup';
import { formatKickoffTime } from '../fixture-status';
import { useLiveTick } from '../hooks/use-live-tick';
import { isMatchConcluded, isMatchLive } from '../match-widgets';
import { BroadcastRowsSkeleton } from '../skeletons';
import { SportsCountryPicker } from '../sports-country-picker';
import { FAINT, MUTED, SectionMessage } from './match-detail-shared';
import { WatchModeToggle, type WatchMode } from './watch-mode-toggle';

interface MatchWatchTabProps {
  fixture: Fixture;
  broadcasts: RankedBroadcast[];
  isLoading: boolean;
  /** Why the channel match failed, or null; distinct from "no channels carry it". */
  error: string | null;
  /** Runs the channel match again after a failure. */
  onRetry: () => void;
  onPlay: (channelId: string, catchup: CatchupWindow | null) => void;
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

/**
 * How far either side of kickoff the catch-up reading still moves on its own:
 * the archive opens shortly after kick-off and the match is over well within it.
 */
const CATCHUP_WATCH_WINDOW_SECS = 3 * 3600;

/** Channels carrying the match, best match first, with a country picker. */
export const MatchWatchTab = memo(function MatchWatchTab({
  fixture,
  broadcasts,
  isLoading,
  error,
  onRetry,
  onPlay,
}: MatchWatchTabProps) {
  const sportsCountry = useUserStore((s) => s.currentUser?.settings?.sportsCountry ?? '');
  const country = getEffectiveSportsCountry(sportsCountry || undefined);

  // Catch-up becomes available as the match runs, so the reading has to advance
  // while the surface is open on one — otherwise a tab opened before kickoff keeps
  // saying "match hasn't started yet" through the whole first half. Only around
  // kickoff, though: on a match tomorrow (or last week) nothing this tab shows
  // changes, and the timer would re-render the surface every 30 s for nothing.
  const nearKickoff =
    Math.abs(Date.now() / 1000 - fixture.kickoffTime) <= CATCHUP_WATCH_WINDOW_SECS;
  const tick = useLiveTick(isMatchLive(fixture) || (nearKickoff && !isMatchConcluded(fixture)));
  // eslint-disable-next-line react-hooks/exhaustive-deps -- `tick` is the clock
  const now = useMemo(() => Math.floor(Date.now() / 1000), [tick]);
  const archived = catchupBroadcasts(broadcasts, fixture, now);
  const canCatchup = archived.length > 0;

  // The user's explicit pick, or none yet. Kept separate from the default so
  // the default still applies once the broadcasts finish loading, and reset per
  // fixture, so a surface opened on the next match starts from the default.
  const [chosenMode, setChosenMode] = useState<WatchMode | null>(null);
  useEffect(() => {
    setChosenMode(null);
  }, [fixture.providerId]);
  const mode: WatchMode = canCatchup
    ? (chosenMode ?? (isMatchConcluded(fixture) ? 'catchup' : 'live'))
    : 'live';

  // While the channels are still being found nothing qualifies yet, so catch-up
  // stays off — but without claiming a reason that isn't settled.
  const catchupDisabledReason =
    canCatchup || isLoading
      ? null
      : fixture.kickoffTime > now
        ? "Match hasn't started yet"
        : 'No channel has this match in its archive';

  const archiveWindow = mode === 'catchup' ? catchupWindow(fixture) : null;
  const listed = mode === 'catchup' ? archived : broadcasts;

  return (
    <View style={styles.container}>
      <View style={styles.headerRow}>
        <Text style={styles.sectionTitle}>Channels · {COUNTRY_NAMES[country] ?? country}</Text>
      </View>
      <SportsCountryPicker accessibilityLabel="TV channel country" />
      <WatchModeToggle
        mode={mode}
        onChange={setChosenMode}
        catchupDisabled={!canCatchup}
        catchupDisabledReason={catchupDisabledReason}
      />

      {isLoading ? (
        <BroadcastRowsSkeleton />
      ) : error ? (
        <View style={styles.errorBox}>
          <Text style={styles.errorText}>{error}</Text>
          <TouchableOpacity
            style={styles.retryButton}
            onPress={onRetry}
            accessibilityRole="button"
            accessibilityLabel="Retry finding channels"
          >
            <Text style={styles.retryText}>Retry</Text>
          </TouchableOpacity>
        </View>
      ) : listed.length === 0 ? (
        <SectionMessage text="No channels in your playlist carry this match." />
      ) : (
        listed.map((broadcast, index) => (
          <BroadcastRow
            key={broadcast.channelId}
            broadcast={broadcast}
            isBest={index === 0}
            catchup={archiveWindow}
            onPlay={onPlay}
          />
        ))
      )}
    </View>
  );
});

const BroadcastRow = memo(function BroadcastRow({
  broadcast,
  isBest,
  catchup,
  onPlay,
}: {
  broadcast: RankedBroadcast;
  isBest: boolean;
  /** The archive window this row plays, or null for the live stream. */
  catchup: CatchupWindow | null;
  onPlay: (channelId: string, catchup: CatchupWindow | null) => void;
}) {
  const start = broadcast.programmeStart ? formatKickoffTime(broadcast.programmeStart) : null;
  const confidence = Math.round(broadcast.confidence * 100);
  const channelName = broadcast.tvgName || broadcast.title;

  return (
    <TouchableOpacity
      style={[styles.channelRow, isBest && styles.channelRowBest]}
      onPress={() => onPlay(broadcast.channelId, catchup)}
      activeOpacity={0.7}
      accessibilityRole="button"
      accessibilityLabel={catchup ? `Watch from the start on ${channelName}` : `Watch on ${channelName}`}
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
          {channelName}
        </Text>
        <Text style={styles.channelMeta} numberOfLines={1}>
          {catchup
            ? `Catch-up · from ${formatKickoffTime(catchup.start)}`
            : broadcast.programmeTitle
              ? `${broadcast.programmeTitle}${start ? ` · ${start}` : ''}`
              : `${sourceLabel(broadcast.source)} · ${confidence}%`}
        </Text>
      </View>
      {isBest && (
        <View style={styles.bestPill}>
          <Text style={styles.bestText}>BEST</Text>
        </View>
      )}
      <IconSymbol name={catchup ? 'gobackward' : 'play.circle.fill'} size={26} color="#34C759" />
    </TouchableOpacity>
  );
});

const styles = StyleSheet.create({
  container: {
    gap: 10,
    padding: 16,
  },
  errorBox: {
    alignItems: 'center',
    gap: 12,
    paddingVertical: 24,
    paddingHorizontal: 16,
  },
  errorText: {
    color: MUTED,
    fontSize: 14,
    textAlign: 'center',
  },
  retryButton: {
    paddingHorizontal: 18,
    paddingVertical: 9,
    borderRadius: 10,
    backgroundColor: FAINT,
  },
  retryText: {
    color: '#FFFFFF',
    fontSize: 14,
    fontWeight: '700',
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
