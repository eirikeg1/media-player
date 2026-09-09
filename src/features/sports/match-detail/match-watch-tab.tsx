import { Dropdown } from '@/components/ui/controls/inputs/dropdown';
import { IconSymbol } from '@/components/ui/display/icon-symbol';
import { saveSetting } from '@/features/user/save-setting';
import { COUNTRY_NAMES, COUNTRY_OPTIONS, getEffectiveSportsCountry } from '@/lib/country-utils';
import { useUserStore } from '@/stores/user/user-store';
import { Image } from 'expo-image';
import type { Fixture, RankedBroadcast } from 'expo-m3u-parser';
import { memo, useCallback, useEffect, useState } from 'react';
import { StyleSheet, Text, TouchableOpacity, View } from 'react-native';

import { catchupBroadcasts, catchupWindow, type CatchupWindow } from '../catchup';
import { isMatchConcluded } from '../match-widgets';
import { BroadcastRowsSkeleton } from '../skeletons';
import { FAINT, MUTED, SectionMessage } from './match-detail-shared';
import { WatchModeToggle, type WatchMode } from './watch-mode-toggle';

interface MatchWatchTabProps {
  fixture: Fixture;
  broadcasts: RankedBroadcast[];
  isLoading: boolean;
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

/** Channels carrying the match, best match first, with a country picker. */
export const MatchWatchTab = memo(function MatchWatchTab({ fixture, broadcasts, isLoading, onPlay }: MatchWatchTabProps) {
  const sportsCountry = useUserStore((s) => s.currentUser?.settings?.sportsCountry ?? '');
  const country = getEffectiveSportsCountry(sportsCountry || undefined);

  // Qualification only changes on the minute scale, so one reading per render
  // is enough — no timer keeps the toggle ticking.
  const now = Math.floor(Date.now() / 1000);
  const archived = catchupBroadcasts(broadcasts, fixture, now);
  const canCatchup = archived.length > 0;

  // The user's explicit pick, or none yet. Kept separate from the default so
  // the default still applies once the broadcasts finish loading, and reset per
  // fixture like the sheet resets its tab.
  const [chosenMode, setChosenMode] = useState<WatchMode | null>(null);
  useEffect(() => {
    setChosenMode(null);
  }, [fixture.providerId]);
  const mode: WatchMode = canCatchup
    ? (chosenMode ?? (isMatchConcluded(fixture.status) ? 'catchup' : 'live'))
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

  const handleCountryChange = useCallback((value: string) => {
    void saveSetting({ sportsCountry: value || undefined }, 'TV country');
  }, []);

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
      <WatchModeToggle
        mode={mode}
        onChange={setChosenMode}
        catchupDisabled={!canCatchup}
        catchupDisabledReason={catchupDisabledReason}
      />

      {isLoading ? (
        <BroadcastRowsSkeleton />
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
  const start = broadcast.programmeStart ? formatClock(broadcast.programmeStart) : null;
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
            ? `Catch-up · from ${formatClock(catchup.start)}`
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

/** Local wall-clock time of a unix timestamp, e.g. "20:55". */
function formatClock(unixSeconds: number): string {
  return new Date(unixSeconds * 1000).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
}

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
