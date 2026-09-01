import { ModalHeader } from '@/components/ui/containers/modal/modal-header';
import { ThemedText } from '@/components/ui/display/themed-text';
import { ThemedView } from '@/components/ui/display/themed-view';
import { Image } from 'expo-image';
import type { Fixture } from 'expo-m3u-parser';
import { memo, useMemo } from 'react';
import { ActivityIndicator, Modal, ScrollView, StyleSheet, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { groupFixturesByDay } from './day-sections';
import { useTeamSchedule } from './hooks/use-team-schedule';
import { involvesFavorite } from './match-grouping';
import { MatchRow } from './match-row';
import { SPORTS_ACCENT, useSportsPalette } from './sports-theme';

/** The team a sheet is opened for — everything a fixture knows about a side. */
export interface TeamRef {
  /** Provider (SofaScore) team id. */
  id: number;
  name: string;
  crest?: string;
}

interface TeamSheetProps {
  team: TeamRef | null;
  /** Provider ids of the user's favorite teams (starred in the list). */
  favoriteTeamIds: ReadonlySet<number>;
  onClose: () => void;
  /** Opens the match sheet; the caller closes this sheet first. */
  onFixturePress: (fixture: Fixture) => void;
}

/** Team sheet: the crest, the name and every upcoming match, grouped by day. */
export const TeamSheet = memo(function TeamSheet({
  team,
  favoriteTeamIds,
  onClose,
  onFixturePress,
}: TeamSheetProps) {
  const insets = useSafeAreaInsets();
  const palette = useSportsPalette();
  const { fixtures, isLoading, error } = useTeamSchedule(team?.id ?? null);
  const sections = useMemo(() => groupFixturesByDay(fixtures), [fixtures]);

  return (
    <Modal visible={team != null} animationType="slide" presentationStyle="pageSheet" onRequestClose={onClose}>
      <ThemedView style={[styles.container, { paddingTop: insets.top }]}>
        <ModalHeader title={team?.name ?? ''} onClose={onClose} />
        {team && (
          <>
            <View style={styles.hero}>
              {team.crest ? (
                <Image source={{ uri: team.crest }} style={styles.crest} contentFit="contain" />
              ) : null}
              <View style={styles.heroTitles}>
                <ThemedText style={styles.heroTitle}>{team.name}</ThemedText>
                <ThemedText style={[styles.heroSubtitle, { color: palette.muted }]}>
                  Upcoming matches
                </ThemedText>
              </View>
            </View>

            <ScrollView contentContainerStyle={[styles.content, { paddingBottom: insets.bottom + 24 }]}>
              {isLoading && sections.length === 0 ? (
                <View style={styles.placeholder}>
                  <ActivityIndicator color={SPORTS_ACCENT.tint} />
                </View>
              ) : sections.length === 0 ? (
                <View style={styles.placeholder}>
                  <ThemedText style={[styles.placeholderText, { color: palette.muted }]}>
                    {error ?? 'No upcoming matches'}
                  </ThemedText>
                </View>
              ) : (
                sections.map((section) => (
                  <View key={section.key} style={styles.section}>
                    <ThemedText style={[styles.sectionLabel, { color: palette.muted }]}>
                      {section.label}
                    </ThemedText>
                    <View style={[styles.matches, { backgroundColor: palette.card }]}>
                      {section.fixtures.map((fixture, index) => (
                        <MatchRow
                          key={fixture.providerId}
                          fixture={fixture}
                          isFavorite={involvesFavorite(fixture, favoriteTeamIds)}
                          onPress={onFixturePress}
                          showDivider={index < section.fixtures.length - 1}
                        />
                      ))}
                    </View>
                  </View>
                ))
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
  crest: {
    width: 40,
    height: 40,
  },
  heroTitles: {
    flex: 1,
  },
  heroTitle: {
    fontSize: 18,
    fontWeight: '700',
  },
  heroSubtitle: {
    fontSize: 13,
  },
  content: {
    paddingTop: 8,
  },
  section: {
    paddingTop: 8,
  },
  sectionLabel: {
    fontSize: 12,
    fontWeight: '700',
    textTransform: 'uppercase',
    paddingHorizontal: 20,
    paddingBottom: 6,
  },
  matches: {
    marginHorizontal: 16,
    borderRadius: 12,
    overflow: 'hidden',
  },
  placeholder: {
    padding: 32,
    alignItems: 'center',
  },
  placeholderText: {
    fontSize: 14,
    textAlign: 'center',
  },
});
