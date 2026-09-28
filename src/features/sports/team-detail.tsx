import { ModalHeader } from '@/components/ui/containers/modal/modal-header';
import { ErrorState } from '@/components/ui/display/state';
import { ThemedText } from '@/components/ui/display/themed-text';
import { ThemedView } from '@/components/ui/display/themed-view';
import { useChromeInsets } from '@/hooks/use-chrome-insets';
import type { TeamRef } from '@/lib/route-params';
import { Image } from 'expo-image';
import { useMemo } from 'react';
import { ScrollView, StyleSheet, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { groupFixturesByDay } from './day-sections';
import { useFavoriteTeams } from './hooks/use-favorite-teams';
import { useLiveTick } from './hooks/use-live-tick';
import { useSportsRoutes } from './hooks/use-sports-routes';
import { useTeamSchedule } from './hooks/use-team-schedule';
import { involvesFavorite } from './match-grouping';
import { isMatchLive } from './match-widgets';
import { MatchRow } from './match-row';
import { TeamScheduleSkeleton } from './skeletons';
import { useSportsPalette } from './sports-theme';

interface TeamDetailProps {
  /** The side, as the match that opened it held it. */
  team: TeamRef;
  /** Leave the detail surface — the route supplies `router.back()`. */
  onClose: () => void;
}

/**
 * A team's detail surface: the crest, the name and every upcoming match,
 * grouped by day.
 *
 * Rendered by `/(detail)/team`, which owns the presentation; the schedule and
 * the step that follows it — a match of its own — are this component's, so
 * backing out of that match returns to the schedule rather than to the day
 * list two surfaces below.
 */
export function TeamDetail({ team, onClose }: TeamDetailProps) {
  const insets = useSafeAreaInsets();
  const chromeInsets = useChromeInsets();
  const palette = useSportsPalette();
  const { openMatch } = useSportsRoutes();
  const { teamIdSet } = useFavoriteTeams();
  const { fixtures, isLoading, error, refresh } = useTeamSchedule(team.providerId);
  const sections = useMemo(() => groupFixturesByDay(fixtures), [fixtures]);
  // These are the same rows the day list shows, so their minute has to advance
  // for the same reason (see `useLiveTick`).
  const hasLive = useMemo(() => fixtures.some(isMatchLive), [fixtures]);
  const tick = useLiveTick(hasLive);

  return (
    <ThemedView style={[styles.container, { paddingTop: insets.top }]}>
      <ModalHeader title={team.name} onClose={onClose} />
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

      <ScrollView
        contentContainerStyle={[
          styles.content,
          { paddingBottom: insets.bottom + chromeInsets.bottom + 24 },
        ]}
      >
        {isLoading && sections.length === 0 ? (
          <TeamScheduleSkeleton />
        ) : error && sections.length === 0 ? (
          // Not the empty state: "this team has no upcoming matches" and
          // "we could not find out" are different answers, and only one
          // of them is worth a retry.
          <ErrorState inline message={error} onRetry={refresh} />
        ) : sections.length === 0 ? (
          <View style={styles.placeholder}>
            <ThemedText style={[styles.placeholderText, { color: palette.muted }]}>
              No upcoming matches
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
                    isFavorite={involvesFavorite(fixture, teamIdSet)}
                    onPress={openMatch}
                    showDivider={index < section.fixtures.length - 1}
                    tick={tick}
                  />
                ))}
              </View>
            </View>
          ))
        )}
      </ScrollView>
    </ThemedView>
  );
}

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
