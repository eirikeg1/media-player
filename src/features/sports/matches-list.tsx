import { ThemedText } from '@/components/ui/display/themed-text';
import type { Fixture } from 'expo-m3u-parser';
import { memo, useCallback, useMemo, useState } from 'react';
import { ActivityIndicator, RefreshControl, SectionList, StyleSheet, View, type SectionListData } from 'react-native';

import { LeagueHeader } from './league-header';
import type { LeagueTab } from './league-sheet';
import { involvesFavorite, type MatchGroup } from './match-grouping';
import { MatchRow } from './match-row';
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
  const [collapsed, setCollapsed] = useState<ReadonlySet<string>>(new Set());

  const toggle = useCallback((key: string) => {
    setCollapsed((prev) => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });
  }, []);

  const sections = useMemo<Section[]>(
    () =>
      groups.map((group) => ({
        key: group.key,
        group,
        collapsed: collapsed.has(group.key),
        data: collapsed.has(group.key) ? [] : group.fixtures,
      })),
    [groups, collapsed]
  );

  const isFavorite = useCallback(
    (fixture: Fixture) => involvesFavorite(fixture, favoriteTeamIds),
    [favoriteTeamIds]
  );

  // Only reached when no group survived filtering: a failed refresh that still
  // has fixtures from a previous load keeps showing them instead of the error.
  const empty = (
    <View style={styles.empty}>
      {isLoading ? (
        <ActivityIndicator color={SPORTS_ACCENT.tint} />
      ) : (
        <>
          <ThemedText style={styles.emptyTitle}>{error ?? emptyTitle}</ThemedText>
          {emptyHint && !error ? (
            <ThemedText style={[styles.emptyHint, { color: palette.muted }]}>{emptyHint}</ThemedText>
          ) : null}
        </>
      )}
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
      keyExtractor={(item) => String(item.providerId)}
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
