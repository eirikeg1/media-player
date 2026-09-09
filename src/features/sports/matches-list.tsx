import { ThemedText } from '@/components/ui/display/themed-text';
import type { Fixture } from 'expo-m3u-parser';
import { memo, useCallback, useMemo, useState } from 'react';
import {
  Platform,
  RefreshControl,
  SectionList,
  StyleSheet,
  View,
  type SectionListData,
} from 'react-native';

import { LeagueHeader } from './league-header';
import type { LeagueTab } from './league-sheet';
import { involvesFavorite, type MatchGroup } from './match-grouping';
import { MatchRow } from './match-row';
import { MatchesListSkeleton } from './skeletons';
import { SPORTS_ACCENT, useSportsPalette } from './sports-theme';

interface MatchesListProps {
  groups: MatchGroup[];
  favoriteTeamIds: ReadonlySet<number>;
  isLoading: boolean;
  error: string | null;
  isRefreshing: boolean;
  onRefresh: () => void;
  onFixturePress: (fixture: Fixture) => void;
  /** Opens the competition sheet on `tab` (the league name asks for the table). */
  onOpenLeague: (group: MatchGroup, tab?: LeagueTab) => void;
  /** Rendered above the sections (title, date strip, filters). */
  header: React.ReactElement;
  emptyTitle: string;
  emptyHint?: string;
  bottomInset: number;
}

type Section = SectionListData<Fixture, { group: MatchGroup; collapsed: boolean }>;

/** Shared identity for a collapsed section's rows, so `sections` stays stable. */
const NO_FIXTURES: Fixture[] = [];

const keyExtractor = (fixture: Fixture) => String(fixture.providerId);

/** Virtualised, league-grouped list of a day's matches with collapsible sections. */
export const MatchesList = memo(function MatchesList({
  groups,
  favoriteTeamIds,
  isLoading,
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
          data: collapsed ? NO_FIXTURES : group.fixtures,
        };
      }),
    [groups, overrides]
  );

  const isFavorite = useCallback(
    (fixture: Fixture) => involvesFavorite(fixture, favoriteTeamIds),
    [favoriteTeamIds]
  );

  // Only reached when no group survived filtering: a failed refresh that still
  // has fixtures from a previous load keeps showing them instead of the error.
  const empty = isLoading ? (
    <MatchesListSkeleton />
  ) : (
    <View style={styles.empty}>
      <ThemedText style={styles.emptyTitle}>{error ?? emptyTitle}</ThemedText>
      {emptyHint && !error ? (
        <ThemedText style={[styles.emptyHint, { color: palette.muted }]}>{emptyHint}</ThemedText>
      ) : null}
    </View>
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
      ListHeaderComponent={header}
      ListEmptyComponent={empty}
      renderSectionHeader={renderSectionHeader}
      renderItem={renderItem}
      refreshControl={<RefreshControl refreshing={isRefreshing} onRefresh={onRefresh} tintColor={SPORTS_ACCENT.tint} />}
      contentContainerStyle={{ paddingBottom: bottomInset + 24 }}
      style={{ backgroundColor: palette.background }}
      initialNumToRender={16}
      windowSize={7}
      // Android only: on iOS it is known to blank cells inside a SectionList.
      // No `getItemLayout` — sections make the offset arithmetic error-prone.
      removeClippedSubviews={Platform.OS === 'android'}
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
