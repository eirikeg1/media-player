import { ThemedText } from '@/components/ui/display/themed-text';
import { ErrorState } from '@/components/ui/display/state';
import type { LeagueTab } from '@/lib/route-params';
import type { Fixture } from 'expo-m3u-parser';
import { memo, useCallback, useMemo, useState } from 'react';
import {
  RefreshControl,
  SectionList,
  StyleSheet,
  View,
  type SectionListData,
} from 'react-native';

import { useLiveTick } from './hooks/use-live-tick';
import { LeagueHeader } from './league-header';
import { involvesFavorite, type MatchGroup } from './match-grouping';
import { MatchRow } from './match-row';
import { MatchesListSkeleton } from './skeletons';
import { SPORTS_ACCENT, useSportsPalette } from './sports-theme';

interface MatchesListProps {
  groups: MatchGroup[];
  favoriteTeamIds: ReadonlySet<number>;
  isLoading: boolean;
  /**
   * The rows are real but the schedule behind them is still being fetched.
   * Said in a line under the header rather than with a spinner: nothing is
   * missing from the list, it may just be about to gain a match.
   */
  isRevalidating: boolean;
  error: string | null;
  isRefreshing: boolean;
  onRefresh: () => void;
  onFixturePress: (fixture: Fixture) => void;
  /** Opens the competition surface on `tab` (the league name asks for the table). */
  onOpenLeague: (group: MatchGroup, tab?: LeagueTab) => void;
  /** Rendered above the sections (title, date strip, filters). */
  header: React.ReactElement;
  emptyTitle: string;
  emptyHint?: string;
  bottomInset: number;
}

/**
 * A league's rows plus what the header and the minute counter need. `tick` rides
 * along in the section rather than being closed over by `renderItem`: a callback
 * that changes identity every 30 s is a new prop on the list, which re-renders
 * every mounted cell — including the sections that hold no live match.
 */
type Section = SectionListData<Fixture, { group: MatchGroup; collapsed: boolean; tick: number }>;

/** Shared identity for a collapsed section's rows, so `sections` stays stable. */
const NO_FIXTURES: Fixture[] = [];

const keyExtractor = (fixture: Fixture) => String(fixture.providerId);

/** Virtualised, league-grouped list of a day's matches with collapsible sections. */
export const MatchesList = memo(function MatchesList({
  groups,
  favoriteTeamIds,
  isLoading,
  isRevalidating,
  error,
  isRefreshing,
  onRefresh,
  onFixturePress,
  onOpenLeague,
  header,
  emptyTitle,
  emptyHint,
  bottomInset,
}: MatchesListProps) {
  const palette = useSportsPalette();
  // A day with nothing in play holds no timer; a day with a live match advances
  // the minute on every row of the groups that have one, and leaves the rest of
  // the (potentially hundreds of) memoised rows untouched.
  const hasLive = useMemo(() => groups.some((group) => group.liveCount > 0), [groups]);
  const tick = useLiveTick(hasLive);
  // Only the groups the user has toggled themselves; everything else follows
  // the default below. Storing the overrides rather than the collapsed set
  // keeps a deliberate "expand this one" from being undone by a regrouping.
  const [overrides, setOverrides] = useState<ReadonlyMap<string, boolean>>(new Map());

  const toggle = useCallback((key: string, collapsed: boolean) => {
    setOverrides((prev) => new Map(prev).set(key, !collapsed));
  }, []);

  const sections = useMemo<Section[]>(
    () =>
      groups.map((group) => {
        // Favorites and the user's own leagues open; the long tail of other
        // competitions stays a header row until it is asked for, so a busy
        // Saturday is a screenful of leagues instead of hundreds of rows.
        const collapsed = overrides.get(group.key) ?? !group.isRanked;
        return {
          key: group.key,
          group,
          collapsed,
          // Only a league with a match in play needs the clock as an input.
          tick: group.liveCount > 0 ? tick : 0,
          data: collapsed ? NO_FIXTURES : group.fixtures,
        };
      }),
    [groups, overrides, tick]
  );

  const isFavorite = useCallback(
    (fixture: Fixture) => involvesFavorite(fixture, favoriteTeamIds),
    [favoriteTeamIds]
  );

  // Only reached when no group survived filtering: a failed refresh that still
  // has fixtures from a previous load keeps showing them instead of the error.
  let empty: React.ReactElement;
  if (isLoading) {
    empty = <MatchesListSkeleton />;
  } else if (error) {
    empty = <ErrorState inline message={error} onRetry={onRefresh} />;
  } else {
    empty = (
      <View style={styles.empty}>
        <ThemedText style={styles.emptyTitle}>{emptyTitle}</ThemedText>
        {emptyHint ? (
          <ThemedText style={[styles.emptyHint, { color: palette.muted }]}>{emptyHint}</ThemedText>
        ) : null}
      </View>
    );
  }

  // A fresh element would defeat the list's own memoisation of the header, so
  // it is only rebuilt when the header or the notice actually changes.
  const listHeader = useMemo(
    () => (
      <>
        {header}
        {isRevalidating ? (
          <ThemedText style={[styles.updating, { color: palette.muted }]}>Updating…</ThemedText>
        ) : null}
      </>
    ),
    [header, isRevalidating, palette.muted]
  );

  const renderSectionHeader = useCallback(
    ({ section }: { section: Section }) => (
      <LeagueHeader
        group={section.group}
        collapsed={section.collapsed}
        onToggle={toggle}
        onOpenLeague={onOpenLeague}
      />
    ),
    [toggle, onOpenLeague]
  );

  const renderItem = useCallback(
    ({ item, index, section }: { item: Fixture; index: number; section: Section }) => (
      <View
        style={[
          styles.rowWrap,
          { backgroundColor: palette.card },
          index === 0 && styles.rowWrapFirst,
          index === section.data.length - 1 && styles.rowWrapLast,
        ]}
      >
        <MatchRow
          fixture={item}
          isFavorite={isFavorite(item)}
          onPress={onFixturePress}
          showDivider={index < section.data.length - 1}
          tick={section.tick}
        />
      </View>
    ),
    [palette.card, isFavorite, onFixturePress]
  );

  return (
    <SectionList
      sections={sections}
      keyExtractor={keyExtractor}
      stickySectionHeadersEnabled
      ListHeaderComponent={listHeader}
      ListEmptyComponent={empty}
      renderSectionHeader={renderSectionHeader}
      renderItem={renderItem}
      refreshControl={<RefreshControl refreshing={isRefreshing} onRefresh={onRefresh} tintColor={SPORTS_ACCENT.tint} />}
      contentContainerStyle={{ paddingBottom: bottomInset + 24 }}
      style={{ backgroundColor: palette.background }}
      initialNumToRender={16}
      windowSize={7}
      // No `removeClippedSubviews`: with sticky headers and collapsible
      // sections the clipped-children bookkeeping falls out of sync on Fabric
      // (Android crashes with "addViewAt: failed to insert view" when a
      // section expands). No `getItemLayout` either — sections make the
      // offset arithmetic error-prone.
    />
  );
});

const styles = StyleSheet.create({
  rowWrap: {
    marginHorizontal: 16,
  },
  rowWrapFirst: {
    borderTopLeftRadius: 12,
    borderTopRightRadius: 12,
  },
  rowWrapLast: {
    borderBottomLeftRadius: 12,
    borderBottomRightRadius: 12,
  },
  updating: {
    paddingHorizontal: 16,
    paddingBottom: 6,
    fontSize: 12,
  },
  empty: {
    paddingVertical: 48,
    paddingHorizontal: 32,
    alignItems: 'center',
    gap: 6,
  },
  emptyTitle: {
    fontSize: 15,
    fontWeight: '600',
    textAlign: 'center',
  },
  emptyHint: {
    fontSize: 13,
    textAlign: 'center',
  },
});
