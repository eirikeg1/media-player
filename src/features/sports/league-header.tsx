import { IconSymbol } from '@/components/ui/display/icon-symbol';
import { ThemedText } from '@/components/ui/display/themed-text';
import { Image } from 'expo-image';
import { memo } from 'react';
import { StyleSheet, TouchableOpacity, View } from 'react-native';

import type { LeagueTab } from './league-sheet';
import type { MatchGroup } from './match-grouping';
import { SPORTS_ACCENT, useSportsPalette, withAlpha } from './sports-theme';

interface LeagueHeaderProps {
  group: MatchGroup;
  collapsed: boolean;
  onToggle: (key: string) => void;
  /** Opens the competition sheet on `tab`; omitted for Favorites. */
  onOpenLeague?: (group: MatchGroup, tab?: LeagueTab) => void;
}

/**
 * Sticky section header: logo, competition, country, live count, collapse
 * chevron.
 *
 * Three targets in one row: the name opens the sheet on the table, the list
 * button opens it on the matches, and the rest of the row collapses the group.
 */
export const LeagueHeader = memo(function LeagueHeader({ group, collapsed, onToggle, onOpenLeague }: LeagueHeaderProps) {
  const palette = useSportsPalette();
  const canOpen = !group.isFavorites && group.competitionId != null && !!onOpenLeague;

  const titles = (
    <>
      <ThemedText style={styles.title} numberOfLines={1}>
        {group.title}
      </ThemedText>
      {group.subtitle ? (
        <ThemedText style={[styles.subtitle, { color: palette.muted }]} numberOfLines={1}>
          {group.subtitle}
        </ThemedText>
      ) : null}
    </>
  );

  return (
    <View style={[styles.container, { backgroundColor: palette.background }]}>
      <TouchableOpacity
        style={[styles.header, { backgroundColor: palette.faint }]}
        onPress={() => onToggle(group.key)}
        activeOpacity={0.7}
        accessibilityRole="button"
        accessibilityState={{ expanded: !collapsed }}
        accessibilityLabel={`${group.title}, ${group.fixtures.length} matches`}
      >
        {group.isFavorites ? (
          <View style={styles.logoBox}>
            <IconSymbol name="star.fill" size={18} color={SPORTS_ACCENT.favorite} />
          </View>
        ) : group.logoUrl ? (
          <Image source={{ uri: group.logoUrl }} style={styles.logo} contentFit="contain" transition={150} />
        ) : (
          <View style={styles.logoBox}>
            <IconSymbol name="sportscourt.fill" size={18} color={palette.muted} />
          </View>
        )}

        {canOpen ? (
          <TouchableOpacity
            style={styles.titles}
            onPress={() => onOpenLeague?.(group, 'standings')}
            activeOpacity={0.7}
            accessibilityRole="button"
            accessibilityLabel={`${group.title} table`}
          >
            {titles}
          </TouchableOpacity>
        ) : (
          <View style={styles.titles}>{titles}</View>
        )}

        {group.liveCount > 0 && (
          <View style={styles.livePill}>
            <View style={styles.liveDot} />
            <ThemedText style={styles.liveText}>{group.liveCount}</ThemedText>
          </View>
        )}

        {canOpen && (
          <TouchableOpacity
            onPress={() => onOpenLeague?.(group, 'matches')}
            hitSlop={8}
            accessibilityRole="button"
            accessibilityLabel={`${group.title} matches, table and top scorers`}
            style={styles.tableButton}
          >
            <IconSymbol name="list.bullet" size={16} color={palette.muted} />
          </TouchableOpacity>
        )}

        <IconSymbol name={collapsed ? 'chevron.down' : 'chevron.up'} size={14} color={palette.muted} />
      </TouchableOpacity>
    </View>
  );
});

const styles = StyleSheet.create({
  container: {
    paddingHorizontal: 16,
    paddingTop: 12,
    paddingBottom: 4,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    paddingHorizontal: 12,
    paddingVertical: 10,
    borderRadius: 12,
  },
  logo: {
    width: 24,
    height: 24,
  },
  logoBox: {
    width: 24,
    height: 24,
    alignItems: 'center',
    justifyContent: 'center',
  },
  titles: {
    flex: 1,
  },
  title: {
    fontSize: 14,
    fontWeight: '700',
  },
  subtitle: {
    fontSize: 11,
    marginTop: 1,
  },
  livePill: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    paddingHorizontal: 7,
    paddingVertical: 2,
    borderRadius: 8,
    backgroundColor: withAlpha(SPORTS_ACCENT.live, 0.14),
  },
  liveDot: {
    width: 6,
    height: 6,
    borderRadius: 3,
    backgroundColor: SPORTS_ACCENT.live,
  },
  liveText: {
    fontSize: 11,
    fontWeight: '700',
    color: SPORTS_ACCENT.live,
  },
  tableButton: {
    padding: 4,
  },
});
