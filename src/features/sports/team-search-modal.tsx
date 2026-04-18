import { ModalHeader } from '@/components/ui/containers/modal/modal-header';
import { Input } from '@/components/ui/controls/inputs/input';
import { IconSymbol } from '@/components/ui/display/icon-symbol';
import { ThemedText } from '@/components/ui/display/themed-text';
import { ThemedView } from '@/components/ui/display/themed-view';
import { useColorScheme } from '@/hooks/use-color-scheme';
import { useThemeColor } from '@/hooks/use-theme-color';
import { GlassColors } from '@/lib/theme';
import { Image } from 'expo-image';
import type { Team, TeamSearchResult } from 'expo-m3u-parser';
import { memo, useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { ActivityIndicator, FlatList, Modal, Pressable, StyleSheet, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { CompetitionGrid } from './competition-grid';
import { useAllCompetitionTeams } from './hooks/use-all-competition-teams';
import { useCompetitionTeams } from './hooks/use-competition-teams';
import { useCompetitions } from './hooks/use-competitions';
import { teamKey } from './utils';

function searchResultToTeam(result: TeamSearchResult): Team {
  return {
    providerId: result.providerId,
    provider: result.provider,
    name: result.name,
    shortName: result.shortName,
    tla: result.tla,
    crestUrl: result.crestUrl,
  };
}

interface ManageFavoritesModalProps {
  onClose: () => void;
  favoriteTeams: Team[];
  onToggleFavorite: (team: Team, isFavorite: boolean) => void;
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

  const { competitions, isLoading: isLoadingCompetitions } = useCompetitions();
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

  const { teams: competitionTeams, isLoading: isLoadingTeams } =
    useCompetitionTeams(selectedCompId);
  const { teams: allTeams, isLoading: isLoadingAll } = useAllCompetitionTeams();

  // Display list: "All" shows all cached competition teams, competition selected shows its teams
  // Favorites are sorted to top using the snapshot (not live favoritedKeys) to avoid re-sorting on toggle
  const displayList = useMemo(() => {
    const source: Team[] =
      selectedCompId === null
        ? allTeams.map(searchResultToTeam)
        : competitionTeams.map(searchResultToTeam);

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

      setFavoritedKeys((prev) => {
        const next = new Set(prev);
        if (newIsFavorite) {
          next.add(key);
        } else {
          next.delete(key);
        }
        return next;
      });

      onToggleFavorite(team, newIsFavorite);
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
            data={
              (selectedCompId !== null ? isLoadingTeams : isLoadingAll)
                ? []
                : displayList
            }
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
                />
                <View style={styles.inputWrapper}>
                  <Input
                    value={filterText}
                    onChangeText={setFilterText}
                    placeholder="Filter teams..."
                  />
                </View>
              </View>
            }
            ListEmptyComponent={
              (selectedCompId !== null ? isLoadingTeams : isLoadingAll) ? (
                <View style={styles.loadingContainer}>
                  <ActivityIndicator />
                </View>
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
  inputWrapper: {
    height: 44,
  },
  listWrapper: {
    flex: 1,
    overflow: 'hidden',
  },
  loadingContainer: {
    padding: 32,
    alignItems: 'center',
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
