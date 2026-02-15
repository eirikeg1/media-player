import { Button } from '@/components/ui/controls/button';
import { StarRating } from '@/components/ui/display/star-rating';
import { ThemedText } from '@/components/ui/display/themed-text';
import { CategoryPill } from '@/features/videos/category-pill';
import type { ChannelMetadata } from 'expo-m3u-parser';
import { ActivityIndicator, Linking, StyleSheet, View } from 'react-native';

interface MetadataSectionProps {
  metadata: ChannelMetadata | null;
  isLoading: boolean;
  tintColor: string;
}

export function MetadataSection({
  metadata,
  isLoading,
  tintColor,
}: MetadataSectionProps) {
  if (isLoading) {
    return (
      <View style={styles.loadingContainer}>
        <ActivityIndicator size="small" color={tintColor} />
        <ThemedText style={styles.loadingText}>Loading details...</ThemedText>
      </View>
    );
  }

  if (!metadata) return null;

  const genreList = metadata.genre
    ?.split(/\s*(?:,|\/)\s*/)
    .map((g) => g.trim())
    .filter(Boolean);

  return (
    <View style={styles.container}>
      {/* Star rating + Release date row */}
      {(metadata.rating || metadata.releaseDate) && (
        <View style={styles.topRow}>
          {metadata.rating && <StarRating rating={metadata.rating} />}
          {metadata.releaseDate && (
            <ThemedText style={styles.releaseDate}>
              {metadata.releaseDate}
            </ThemedText>
          )}
        </View>
      )}

      {/* Genre row */}
      {genreList && genreList.length > 0 && (
        <View style={styles.genreRow}>
          <ThemedText style={styles.label}>Genre</ThemedText>
          <View style={styles.genrePills}>
            {genreList.map((genre) => (
              <CategoryPill key={genre} label={genre} />
            ))}
          </View>
        </View>
      )}

      {/* Plot */}
      {metadata.plot && (
        <View style={styles.field}>
          <ThemedText style={styles.plotText}>{metadata.plot}</ThemedText>
        </View>
      )}

      {/* Director */}
      {metadata.director && (
        <View style={styles.inlineRow}>
          <ThemedText style={styles.label}>Director</ThemedText>
          <ThemedText style={styles.value}>{metadata.director}</ThemedText>
        </View>
      )}

      {/* Cast */}
      {metadata.castMembers && (
        <View style={styles.inlineRow}>
          <ThemedText style={styles.label}>Cast</ThemedText>
          <ThemedText style={styles.value}>{metadata.castMembers}</ThemedText>
        </View>
      )}

      {/* Trailer button */}
      {metadata.trailerUrl && (
        <Button
          variant="secondary"
          size="medium"
          fullWidth
          icon="play.circle"
          title="View Trailer"
          onPress={() => Linking.openURL(metadata.trailerUrl!)}
        />
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    paddingHorizontal: 16,
    gap: 12,
  },
  loadingContainer: {
    alignItems: 'center',
    paddingVertical: 32,
    gap: 8,
  },
  loadingText: {
    fontSize: 14,
    opacity: 0.7,
  },
  topRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  releaseDate: {
    fontSize: 14,
    opacity: 0.7,
  },
  genreRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  genrePills: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    flex: 1,
    gap: 6,
  },
  label: {
    fontSize: 14,
    fontWeight: '700',
    opacity: 0.7,
  },
  value: {
    fontSize: 14,
    flex: 1,
  },
  field: {
    gap: 4,
  },
  plotText: {
    fontSize: 14,
    lineHeight: 20,
    opacity: 0.85,
  },
  inlineRow: {
    flexDirection: 'row',
    gap: 8,
  },
});
