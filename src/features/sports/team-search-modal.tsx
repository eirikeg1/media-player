import { ModalHeader } from '@/components/ui/containers/modal/modal-header';
import { Button } from '@/components/ui/controls/button';
import { Input } from '@/components/ui/controls/inputs/input';
import { IconSymbol } from '@/components/ui/display/icon-symbol';
import { ErrorState } from '@/components/ui/display/state';
import { ThemedText } from '@/components/ui/display/themed-text';
import { ThemedView } from '@/components/ui/display/themed-view';
import { useColorScheme } from '@/hooks/use-color-scheme';
import { useThemeColor } from '@/hooks/use-theme-color';
import { GlassColors } from '@/lib/theme';
import { Image } from 'expo-image';
import type { Team } from 'expo-m3u-parser';
import { memo, useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Alert, FlatList, Modal, Pressable, StyleSheet, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { CompetitionGrid } from './competition-grid';
import { useAllCompetitionTeams } from './hooks/use-all-competition-teams';
import { useCompetitionTeams } from './hooks/use-competition-teams';
import { useCompetitions } from './hooks/use-competitions';
import { TeamListSkeleton } from './skeletons';
import { sportsErrorMessage } from './sports-errors';
import { teamKey } from './utils';

interface ManageFavoritesModalProps {
  onClose: () => void;
  favoriteTeams: Team[];
  /**
   * Persists the change. Must reject when the write fails: the checkmark is
   * already on screen, and this modal is the only place that can take it back.
   */
  onToggleFavorite: (team: Team, isFavorite: boolean) => Promise<void>;
}

/** Add or remove one key, leaving the original set alone. */
function withKey(keys: ReadonlySet<string>, key: string, present: boolean): Set<string> {
  const next = new Set(keys);
  if (present) next.add(key);
  else next.delete(key);
  return next;
}

export const ManageFavoritesModal = memo(function ManageFavoritesModal({
  onClose,
  favoriteTeams,
  onToggleFavorite,
}: ManageFavoritesModalProps) {
  const colorScheme = useColorScheme();
  const isDark = colorScheme === 'dark';
  const tintColor = useThemeColor({}, 'tint');
  const insets = useSafeAreaInsets();

  const {
    competitions,
    isLoading: isLoadingCompetitions,
    error: competitionsError,
    retry: retryCompetitions,
  } = useCompetitions();
  const [selectedCompId, setSelectedCompId] = useState<number | null>(null);
  const [filterText, setFilterText] = useState('');

  // Initialize favorited keys from props on mount (component is only rendered when modal is open)
  const initialKeys = useMemo(() => {
    const keys = new Set<string>();
    for (const team of favoriteTeams) {
      keys.add(teamKey(team.provider, team.providerId));
    }
    return keys;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  const [favoritedKeys, setFavoritedKeys] = useState(initialKeys);
  const sortOrderRef = useRef(initialKeys);

  // Re-snapshot sort order when competition changes
  const prevCompRef = useRef(selectedCompId);
  useEffect(() => {
    if (prevCompRef.current !== selectedCompId) {
      sortOrderRef.current = new Set(favoritedKeys);
      prevCompRef.current = selectedCompId;
    }
  }, [selectedCompId, favoritedKeys]);

  const {
    teams: competitionTeams,
    isLoading: isLoadingTeams,
    error: competitionTeamsError,
    retry: retryCompetitionTeams,
  } = useCompetitionTeams(selectedCompId);
  const {
    teams: allTeams,
    isLoading: isLoadingAll,
    isRefreshing: isRefreshingAll,
    error: allTeamsError,
    refresh: refreshAllTeams,
  } = useAllCompetitionTeams();

  // Whichever list the picker is currently showing decides both states.
  const isLoadingList = selectedCompId !== null ? isLoadingTeams : isLoadingAll;
  const listError = selectedCompId !== null ? competitionTeamsError : allTeamsError;
  const retryList = selectedCompId !== null ? retryCompetitionTeams : refreshAllTeams;

  // Display list: "All" shows all cached competition teams, competition selected shows its teams
  // Favorites are sorted to top using the snapshot (not live favoritedKeys) to avoid re-sorting on toggle
  const displayList = useMemo(() => {
    const source: Team[] = selectedCompId === null ? allTeams : competitionTeams;

    const filter = filterText.trim().toLowerCase();
    const filtered = filter
      ? source.filter(
          (t) =>
            t.name.toLowerCase().includes(filter) ||
            t.shortName?.toLowerCase().includes(filter) ||
            t.tla?.toLowerCase().includes(filter)
        )
      : source;

    const snapshot = sortOrderRef.current;
    return [...filtered].sort((a, b) => {
      const aFav = snapshot.has(teamKey(a.provider, a.providerId)) ? 0 : 1;
      const bFav = snapshot.has(teamKey(b.provider, b.providerId)) ? 0 : 1;
      return aFav - bFav;
    });
  }, [selectedCompId, allTeams, competitionTeams, filterText]);

  const handleToggle = useCallback(
    (team: Team) => {
      const key = teamKey(team.provider, team.providerId);
      const newIsFavorite = !favoritedKeys.has(key);

      // Optimistic: the checkmark answers the tap immediately, and is put back
      // — with a reason — if the write turns out to have failed.
      setFavoritedKeys((prev) => withKey(prev, key, newIsFavorite));

      onToggleFavorite(team, newIsFavorite).catch((err: unknown) => {
        setFavoritedKeys((prev) => withKey(prev, key, !newIsFavorite));
        Alert.alert(
          newIsFavorite ? "Couldn't add favorite" : "Couldn't remove favorite",
          sportsErrorMessage(err, 'Please try again.')
        );
      });
    },
    [onToggleFavorite, favoritedKeys]
  );

  const handleSelectCompetition = useCallback((id: number | null) => {
    setSelectedCompId(id);
  }, []);

  const renderItem = useCallback(
    ({ item }: { item: Team }) => {
      const key = teamKey(item.provider, item.providerId);
      const isFavorite = favoritedKeys.has(key);

      return (
        <Pressable
          onPress={() => handleToggle(item)}
          accessibilityRole="button"
          accessibilityLabel={
            isFavorite ? `Unfollow ${item.name}` : `Follow ${item.name}`
          }
          accessibilityState={{ selected: isFavorite }}
          style={[
            styles.resultRow,
            { borderBottomColor: isDark ? GlassColors.dark.border : GlassColors.light.border },
          ]}
        >
          {item.crestUrl ? (
            <Image source={{ uri: item.crestUrl }} style={styles.crest} contentFit="contain" />
          ) : (
            <View style={styles.crestPlaceholder} />
          )}
          <ThemedText style={styles.resultName} numberOfLines={1}>
            {item.name}
          </ThemedText>
          {isFavorite && <IconSymbol name="checkmark" size={20} color={tintColor} />}
        </Pressable>
      );
    },
    [isDark, favoritedKeys, handleToggle, tintColor]
  );

  const keyExtractor = useCallback(
    (item: Team) => teamKey(item.provider, item.providerId),
    []
  );

  return (
    <Modal
      visible
      animationType="slide"
      presentationStyle="pageSheet"
      onRequestClose={onClose}
    >
      <ThemedView style={[styles.modalContent, { paddingTop: insets.top }]}>
        <ModalHeader title="Manage Favorites" onClose={onClose} />

        <View style={styles.listWrapper}>
          <FlatList
            data={isLoadingList ? [] : displayList}
            renderItem={renderItem}
            keyExtractor={keyExtractor}
            style={styles.resultsList}
            showsVerticalScrollIndicator={false}
            keyboardShouldPersistTaps="handled"
            ListHeaderComponent={
              <View style={[styles.controlsContainer, {
                borderBottomColor: isDark ? GlassColors.dark.border : GlassColors.light.border,
              }]}>
                <CompetitionGrid
                  competitions={competitions}
                  selectedCompId={selectedCompId}
                  onSelect={handleSelectCompetition}
                  isLoading={isLoadingCompetitions}
                  error={competitionsError}
                  onRetry={retryCompetitions}
                />
                <View style={styles.filterRow}>
                  <View style={styles.inputWrapper}>
                    <Input
                      value={filterText}
                      onChangeText={setFilterText}
                      placeholder="Filter teams..."
                    />
                  </View>
                  {/* The team sweep is minutes of paced provider requests, so it
                      is not run just because this modal was opened; asking for
                      teams that aren't listed yet is an explicit action. */}
                  {selectedCompId === null && (
                    <Button
                      title={isRefreshingAll ? 'Refreshing…' : 'Refresh'}
                      variant="secondary"
                      size="small"
                      icon="arrow.clockwise"
                      disabled={isRefreshingAll}
                      onPress={refreshAllTeams}
                      accessibilityLabel="Refresh the team list from the provider"
                    />
                  )}
                </View>
                {/* The list below still has teams to show, so the failure is a
                    line under the filter rather than a screen of its own. */}
                {listError && displayList.length > 0 ? (
                  <ErrorState inline message={listError} onRetry={retryList} />
                ) : null}
              </View>
            }
            ListEmptyComponent={
              isLoadingList ? (
                <TeamListSkeleton />
              ) : listError ? (
                // Nothing on screen and nothing explaining why: an empty picker
                // is indistinguishable from a provider that knows no teams.
                <ErrorState inline message={listError} onRetry={retryList} />
              ) : (
                <View style={styles.emptyContainer}>
                  <ThemedText style={styles.emptyText}>
                    {selectedCompId
                      ? 'No teams match the filter'
                      : 'Browse competitions to discover teams'}
                  </ThemedText>
                </View>
              )
            }
          />
        </View>
      </ThemedView>
    </Modal>
  );
});

const styles = StyleSheet.create({
  modalContent: {
    flex: 1,
  },
  controlsContainer: {
    paddingHorizontal: 16,
    paddingTop: 12,
    paddingBottom: 16,
    gap: 10,
    borderBottomWidth: StyleSheet.hairlineWidth,
    zIndex: 1,
  },
  filterRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  inputWrapper: {
    flex: 1,
    height: 44,
  },
  listWrapper: {
    flex: 1,
    overflow: 'hidden',
  },
  emptyContainer: {
    padding: 32,
    alignItems: 'center',
  },
  emptyText: {
    opacity: 0.6,
  },
  resultsList: {
    flex: 1,
  },
  resultRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 16,
    paddingVertical: 10,
    gap: 12,
    borderBottomWidth: StyleSheet.hairlineWidth,
  },
  crest: {
    width: 32,
    height: 32,
  },
  crestPlaceholder: {
    width: 32,
    height: 32,
  },
  resultName: {
    flex: 1,
    fontSize: 15,
    fontWeight: '500',
  },
});
