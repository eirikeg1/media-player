import { Dropdown, type DropdownOption } from '@/components/ui/controls/inputs/dropdown';
import { IconSymbol } from '@/components/ui/display/icon-symbol';
import { ThemedText } from '@/components/ui/display/themed-text';
import { ThemedView } from '@/components/ui/display/themed-view';
import { COUNTRY_OPTIONS, getDeviceCountry } from '@/lib/country-utils';
import { getTimeElapsed } from '@/lib/playlist-utils';
import { useUserStore } from '@/stores/user/user-store';
import {
  DEFAULT_SPORTS_BACKGROUND_REFRESH,
  type SportsBackgroundRefresh,
  type SportsRefreshMode,
} from '@/types/user.types';
import { Image } from 'expo-image';
import { memo, useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { ActivityIndicator, Platform, StyleSheet, Switch, TouchableOpacity, View } from 'react-native';

import { runForegroundRefresh } from './background/foreground-refresh';
import { describePreference } from './background/refresh-policy';
import { refreshStateStore } from './background/refresh-state-store';
import { useLeaguePreferences } from './hooks/use-league-preferences';
import { competitionLogoUrl, moveLeague } from './league-preferences';
import { SPORTS_ACCENT, useSportsPalette } from './sports-theme';

const MODE_OPTIONS: DropdownOption<SportsRefreshMode>[] = [
  { label: 'Off', value: 'off' },
  { label: 'On a set interval', value: 'interval' },
  { label: 'Daily at a set time', value: 'daily' },
  { label: 'At night (02\u201306)', value: 'night' },
];

/** Hours from a few times a day up to a fortnight; labelled by the policy so the
 *  option and the "Current:" summary can never drift apart. */
const INTERVAL_OPTIONS: DropdownOption<number>[] = [2, 4, 6, 12, 24, 48, 168, 336].map(
  (hours) => ({
    label: describePreference({
      ...DEFAULT_SPORTS_BACKGROUND_REFRESH,
      mode: 'interval',
      intervalHours: hours,
    }),
    value: hours,
  })
);

/** Hourly slots; the minute is not worth a second picker for a background job. */
const TIME_OPTIONS: DropdownOption<string>[] = Array.from({ length: 24 }, (_, hour) => {
  const value = `${String(hour).padStart(2, '0')}:00`;
  return { label: value, value };
});

/**
 * iOS gives no usable control over when a background task runs, so the feature
 * ships Android-only and the settings say so rather than offering dead controls.
 */
const IS_IOS = Platform.OS === 'ios';

/** Settings → Sports: TV country, league ranking and list filters. */
export const SportsPreferences = memo(function SportsPreferences() {
  const palette = useSportsPalette();
  const currentUser = useUserStore((s) => s.currentUser);
  const updateSettings = useUserStore((s) => s.updateSettings);
  const { competitions, order, hideOtherLeagues, setOrder, resetOrder, setHideOtherLeagues } = useLeaguePreferences();

  const sportsCountry = currentUser?.settings?.sportsCountry ?? '';
  const sportsCountryLabel = useMemo(() => {
    if (!sportsCountry) {
      const detected = getDeviceCountry();
      const match = COUNTRY_OPTIONS.find((o) => o.value === detected);
      return `Auto (${match?.label ?? detected})`;
    }
    return COUNTRY_OPTIONS.find((o) => o.value === sportsCountry)?.label ?? sportsCountry;
  }, [sportsCountry]);

  const handleCountryChange = useCallback(
    (value: string) => {
      if (!currentUser) return;
      void updateSettings(currentUser.id, { sportsCountry: value || undefined });
    },
    [currentUser, updateSettings]
  );

  const backgroundRefresh: SportsBackgroundRefresh =
    currentUser?.settings?.sportsBackgroundRefresh ?? DEFAULT_SPORTS_BACKGROUND_REFRESH;

  /** Every write carries the whole preference, so a partial row can never persist. */
  const saveBackgroundRefresh = useCallback(
    (patch: Partial<SportsBackgroundRefresh>) => {
      if (!currentUser) return;
      void updateSettings(currentUser.id, {
        sportsBackgroundRefresh: {
          ...DEFAULT_SPORTS_BACKGROUND_REFRESH,
          ...backgroundRefresh,
          ...patch,
        },
      });
    },
    [backgroundRefresh, currentUser, updateSettings]
  );

  const [lastRunAt, setLastRunAt] = useState<number | null>(null);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const isMountedRef = useRef(true);
  useEffect(() => {
    isMountedRef.current = true;
    return () => {
      isMountedRef.current = false;
    };
  }, []);

  useEffect(() => {
    void refreshStateStore.getLastRunAt().then((ts) => {
      if (isMountedRef.current) setLastRunAt(ts);
    });
  }, []);

  const handleRefreshNow = useCallback(async () => {
    setIsRefreshing(true);
    try {
      await runForegroundRefresh({ force: true });
      await refreshStateStore.setLastRunAt(Date.now());
    } catch (err) {
      console.warn('[SportsPreferences] Manual refresh failed:', err);
    }
    // Read back rather than assume: a failed run leaves the previous stamp, and
    // a background wake may have advanced it while the screen was open.
    const ts = await refreshStateStore.getLastRunAt();
    if (!isMountedRef.current) return;
    setLastRunAt(ts);
    setIsRefreshing(false);
  }, []);

  const leagues = useMemo(() => {
    const byId = new Map(competitions.map((c) => [c.providerId, c]));
    return order
      .map((id) => byId.get(id))
      .filter((c): c is NonNullable<typeof c> => c != null);
  }, [competitions, order]);

  if (!currentUser) return null;

  return (
    <ThemedView style={styles.container}>
      <View style={styles.content}>
        <ThemedText type="subtitle" style={styles.header}>
          Sports
        </ThemedText>

        <View style={styles.preferenceRow}>
          <View style={styles.labelContainer}>
            <ThemedText style={styles.label}>TV channel country</ThemedText>
            <ThemedText style={styles.helpText}>
              Which country&apos;s broadcasters to match. Current: {sportsCountryLabel}
            </ThemedText>
          </View>
        </View>
        <View style={styles.dropdown}>
          <Dropdown<string>
            label="Country"
            options={COUNTRY_OPTIONS}
            value={sportsCountry}
            onSelect={handleCountryChange}
            accessibilityLabel="Sports TV channel country"
          />
        </View>

        <View style={styles.sectionHeader}>
          <ThemedText style={styles.label}>Background refresh</ThemedText>
        </View>
        <ThemedText style={styles.helpText}>
          {IS_IOS
            ? 'Background refresh is not yet supported on iOS \u2014 data refreshes when you open the app.'
            : `Keeps today\u2019s matches and your favorite teams up to date while the app is closed. Current: ${describePreference(backgroundRefresh)}`}
        </ThemedText>

        <View style={styles.dropdown}>
          <Dropdown<SportsRefreshMode>
            label="When to refresh"
            options={MODE_OPTIONS}
            value={backgroundRefresh.mode}
            onSelect={(mode) => saveBackgroundRefresh({ mode })}
            disabled={IS_IOS}
            accessibilityLabel="Sports background refresh schedule"
          />
        </View>

        {!IS_IOS && backgroundRefresh.mode === 'interval' ? (
          <View style={styles.dropdown}>
            <Dropdown<number>
              label="How often"
              options={INTERVAL_OPTIONS}
              value={backgroundRefresh.intervalHours}
              onSelect={(intervalHours) => saveBackgroundRefresh({ intervalHours })}
              accessibilityLabel="Sports background refresh interval"
            />
          </View>
        ) : null}

        {!IS_IOS && backgroundRefresh.mode === 'daily' ? (
          <View style={styles.dropdown}>
            <Dropdown<string>
              label="Time of day"
              options={TIME_OPTIONS}
              value={backgroundRefresh.dailyTime}
              onSelect={(dailyTime) => saveBackgroundRefresh({ dailyTime })}
              accessibilityLabel="Sports background refresh time of day"
            />
          </View>
        ) : null}

        {!IS_IOS && backgroundRefresh.mode !== 'off' ? (
          <ThemedText style={styles.helpText}>
            Android schedules within ~15 min of the chosen time.
          </ThemedText>
        ) : null}

        <View style={styles.preferenceRow}>
          <View style={styles.labelContainer}>
            <ThemedText style={styles.label}>Refresh when opening app</ThemedText>
            <ThemedText style={styles.helpText}>
              Fetch new scores on launch when the cached ones are stale.
            </ThemedText>
          </View>
          <Switch
            value={backgroundRefresh.refreshOnOpen}
            onValueChange={(refreshOnOpen) => saveBackgroundRefresh({ refreshOnOpen })}
            trackColor={{ false: '#767577', true: SPORTS_ACCENT.tint }}
            accessibilityLabel="Refresh sports when opening the app"
          />
        </View>

        <View style={styles.preferenceRow}>
          <View style={styles.labelContainer}>
            <ThemedText style={styles.label}>Refresh now</ThemedText>
            <ThemedText style={styles.helpText}>
              {lastRunAt == null
                ? 'Never updated'
                : `Last updated ${getTimeElapsed(new Date(lastRunAt))}`}
            </ThemedText>
          </View>
          {isRefreshing ? (
            <ActivityIndicator size="small" color={SPORTS_ACCENT.tint} />
          ) : (
            <TouchableOpacity
              onPress={() => void handleRefreshNow()}
              accessibilityRole="button"
              accessibilityLabel="Refresh sports data now"
            >
              <ThemedText style={styles.resetText}>Refresh</ThemedText>
            </TouchableOpacity>
          )}
        </View>

        <View style={styles.preferenceRow}>
          <View style={styles.labelContainer}>
            <ThemedText style={styles.label}>Only show my leagues</ThemedText>
            <ThemedText style={styles.helpText}>
              Hide competitions that aren&apos;t ranked below (favorite teams still show).
            </ThemedText>
          </View>
          <Switch
            value={hideOtherLeagues}
            onValueChange={setHideOtherLeagues}
            trackColor={{ false: '#767577', true: SPORTS_ACCENT.tint }}
            accessibilityLabel="Only show ranked leagues"
          />
        </View>

        <View style={styles.sectionHeader}>
          <ThemedText style={styles.label}>League order</ThemedText>
          <TouchableOpacity onPress={resetOrder} accessibilityRole="button" accessibilityLabel="Reset league order">
            <ThemedText style={styles.resetText}>Reset</ThemedText>
          </TouchableOpacity>
        </View>
        <ThemedText style={styles.helpText}>Leagues appear in this order in the matches list.</ThemedText>

        <View style={[styles.list, { borderColor: palette.border }]}>
          {leagues.map((league, index) => (
            <View
              key={league.providerId}
              style={[styles.leagueRow, index < leagues.length - 1 && { borderBottomColor: palette.border, borderBottomWidth: StyleSheet.hairlineWidth }]}
            >
              <ThemedText style={[styles.rank, { color: palette.muted }]}>{index + 1}</ThemedText>
              <Image
                source={{ uri: league.emblemUrl ?? competitionLogoUrl(league.providerId) }}
                style={styles.logo}
                contentFit="contain"
              />
              <View style={styles.leagueText}>
                <ThemedText style={styles.leagueName} numberOfLines={1}>
                  {league.name}
                </ThemedText>
                {league.country ? (
                  <ThemedText style={[styles.leagueCountry, { color: palette.muted }]}>{league.country}</ThemedText>
                ) : null}
              </View>
              <TouchableOpacity
                onPress={() => setOrder(moveLeague(order, index, -1))}
                disabled={index === 0}
                hitSlop={6}
                style={[styles.moveButton, index === 0 && styles.moveDisabled]}
                accessibilityRole="button"
                accessibilityLabel={`Move ${league.name} up`}
              >
                <IconSymbol name="arrow.up" size={16} color={SPORTS_ACCENT.tint} />
              </TouchableOpacity>
              <TouchableOpacity
                onPress={() => setOrder(moveLeague(order, index, 1))}
                disabled={index === leagues.length - 1}
                hitSlop={6}
                style={[styles.moveButton, index === leagues.length - 1 && styles.moveDisabled]}
                accessibilityRole="button"
                accessibilityLabel={`Move ${league.name} down`}
              >
                <IconSymbol name="arrow.down" size={16} color={SPORTS_ACCENT.tint} />
              </TouchableOpacity>
            </View>
          ))}
        </View>
      </View>
    </ThemedView>
  );
});

const styles = StyleSheet.create({
  container: {
    paddingVertical: 8,
  },
  content: {
    gap: 8,
  },
  header: {
    marginBottom: 4,
  },
  preferenceRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 12,
    paddingHorizontal: 16,
    paddingVertical: 8,
  },
  labelContainer: {
    flex: 1,
    gap: 2,
  },
  label: {
    fontSize: 16,
    fontWeight: '500',
  },
  helpText: {
    fontSize: 12,
    opacity: 0.6,
    paddingHorizontal: 16,
  },
  dropdown: {
    paddingHorizontal: 16,
  },
  sectionHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 16,
    paddingTop: 8,
  },
  resetText: {
    color: SPORTS_ACCENT.tint,
    fontSize: 14,
    fontWeight: '600',
  },
  list: {
    marginHorizontal: 16,
    borderWidth: 1,
    borderRadius: 12,
    overflow: 'hidden',
  },
  leagueRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    paddingHorizontal: 12,
    paddingVertical: 10,
  },
  rank: {
    width: 18,
    fontSize: 12,
    fontWeight: '600',
    textAlign: 'center',
    fontVariant: ['tabular-nums'],
  },
  logo: {
    width: 24,
    height: 24,
  },
  leagueText: {
    flex: 1,
  },
  leagueName: {
    fontSize: 14,
    fontWeight: '600',
  },
  leagueCountry: {
    fontSize: 11,
  },
  moveButton: {
    padding: 6,
  },
  moveDisabled: {
    opacity: 0.25,
  },
});
