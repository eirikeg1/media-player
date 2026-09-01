import { ModalHeader } from '@/components/ui/containers/modal/modal-header';
import { ThemedText } from '@/components/ui/display/themed-text';
import { ThemedView } from '@/components/ui/display/themed-view';
import { Image } from 'expo-image';
import type { Fixture } from 'expo-m3u-parser';
import { memo, useEffect, useState } from 'react';
import { Modal, ScrollView, StyleSheet, TouchableOpacity, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { useScorers } from './hooks/use-scorers';
import { useStandings } from './hooks/use-standings';
import { involvesFavorite, type MatchGroup } from './match-grouping';
import { MatchRow } from './match-row';
import { ScorersList } from './scorers-list';
import { SPORTS_ACCENT, useSportsPalette } from './sports-theme';
import { StandingsTable } from './standings-table';

export type LeagueTab = 'matches' | 'standings' | 'scorers';

const TABS: { key: LeagueTab; label: string }[] = [
  { key: 'matches', label: 'Matches' },
  { key: 'standings', label: 'Table' },
  { key: 'scorers', label: 'Top scorers' },
];

interface LeagueSheetProps {
  group: MatchGroup | null;
  /** Provider ids of the user's favorite teams (highlighted in table and list). */
  favoriteTeamIds: ReadonlySet<number>;
  onClose: () => void;
  /** Opens the match sheet; the caller closes this sheet first. */
  onFixturePress: (fixture: Fixture) => void;
  /** Tab the sheet opens on — the league name leads straight to the table. */
  initialTab?: LeagueTab;
}

/** Competition sheet: the day's matches, the table and the top scorers. */
export const LeagueSheet = memo(function LeagueSheet({
  group,
  favoriteTeamIds,
  onClose,
  onFixturePress,
  initialTab = 'matches',
}: LeagueSheetProps) {
  const insets = useSafeAreaInsets();
  const palette = useSportsPalette();
  const [tab, setTab] = useState<LeagueTab>(initialTab);
  const competitionId = group?.competitionId ?? null;

  // Every competition opens on the tab it was opened from, not on whichever one
  // the previous competition was left on.
  useEffect(() => {
    setTab(initialTab);
  }, [group?.key, initialTab]);

  const standings = useStandings(tab === 'standings' ? competitionId : null);
  const scorers = useScorers(tab === 'scorers' ? competitionId : null);

  return (
    <Modal visible={group != null} animationType="slide" presentationStyle="pageSheet" onRequestClose={onClose}>
      <ThemedView style={[styles.container, { paddingTop: insets.top }]}>
        <ModalHeader title={group?.title ?? ''} onClose={onClose} />
        {group && (
          <>
            <View style={styles.hero}>
              {group.logoUrl && <Image source={{ uri: group.logoUrl }} style={styles.logo} contentFit="contain" />}
              <View>
                <ThemedText style={styles.heroTitle}>{group.title}</ThemedText>
                {group.subtitle ? (
                  <ThemedText style={[styles.heroSubtitle, { color: palette.muted }]}>{group.subtitle}</ThemedText>
                ) : null}
              </View>
            </View>
            <View style={styles.tabs}>
              {TABS.map(({ key, label }) => (
                <TouchableOpacity
                  key={key}
                  onPress={() => setTab(key)}
                  style={[styles.tab, { backgroundColor: tab === key ? SPORTS_ACCENT.tint : palette.faint }]}
                  accessibilityRole="tab"
                  accessibilityState={{ selected: tab === key }}
                >
                  <ThemedText style={[styles.tabText, tab === key && styles.tabTextSelected]}>{label}</ThemedText>
                </TouchableOpacity>
              ))}
            </View>
            <ScrollView contentContainerStyle={[styles.content, { paddingBottom: insets.bottom + 24 }]}>
              {tab === 'matches' ? (
                group.fixtures.length > 0 ? (
                  <View style={[styles.matches, { backgroundColor: palette.card }]}>
                    {group.fixtures.map((fixture, index) => (
                      <MatchRow
                        key={fixture.providerId}
                        fixture={fixture}
                        isFavorite={involvesFavorite(fixture, favoriteTeamIds)}
                        onPress={onFixturePress}
                        showDivider={index < group.fixtures.length - 1}
                      />
                    ))}
                  </View>
                ) : (
                  <View style={styles.empty}>
                    <ThemedText style={[styles.emptyText, { color: palette.muted }]}>
                      No matches on this day
                    </ThemedText>
                  </View>
                )
              ) : tab === 'standings' ? (
                <StandingsTable
                  standings={standings.standings}
                  isLoading={standings.isLoading}
                  error={standings.error}
                  favoriteTeamIds={favoriteTeamIds}
                />
              ) : (
                <ScorersList scorers={scorers.scorers} isLoading={scorers.isLoading} error={scorers.error} />
              )}
            </ScrollView>
          </>
        )}
      </ThemedView>
    </Modal>
  );
});

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  hero: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    paddingHorizontal: 16,
    paddingVertical: 8,
  },
  logo: {
    width: 40,
    height: 40,
  },
  heroTitle: {
    fontSize: 18,
    fontWeight: '700',
  },
  heroSubtitle: {
    fontSize: 13,
  },
  tabs: {
    flexDirection: 'row',
    gap: 8,
    paddingHorizontal: 16,
    paddingVertical: 8,
  },
  tab: {
    paddingHorizontal: 14,
    paddingVertical: 7,
    borderRadius: 16,
  },
  tabText: {
    fontSize: 13,
    fontWeight: '600',
  },
  tabTextSelected: {
    color: '#FFFFFF',
  },
  content: {
    paddingTop: 8,
  },
  matches: {
    marginHorizontal: 16,
    borderRadius: 12,
    overflow: 'hidden',
  },
  empty: {
    padding: 32,
    alignItems: 'center',
  },
  emptyText: {
    fontSize: 14,
  },
});
