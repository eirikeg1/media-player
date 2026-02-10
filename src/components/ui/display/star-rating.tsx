import { IconSymbol, type IconSymbolName } from '@/components/ui/display/icon-symbol';
import { ThemedText } from '@/components/ui/display/themed-text';
import { StyleSheet, View } from 'react-native';

const STAR_COLOR = '#FFB800';
const STAR_SIZE = 16;
const TOTAL_STARS = 5;

interface StarRatingProps {
  /** Rating string on a 0–10 scale (e.g. "7.5") */
  rating: string;
}

export function StarRating({ rating }: StarRatingProps) {
  const numericRating = parseFloat(rating);
  if (isNaN(numericRating)) return null;

  const scaledRating = numericRating / 2; // Convert 0–10 to 0–5

  const stars: IconSymbolName[] = [];
  for (let i = 0; i < TOTAL_STARS; i++) {
    if (scaledRating >= i + 1) {
      stars.push('star.fill');
    } else if (scaledRating >= i + 0.5) {
      stars.push('star.leadinghalf.filled');
    } else {
      stars.push('star');
    }
  }

  return (
    <View style={styles.container}>
      {stars.map((icon, index) => (
        <IconSymbol key={index} name={icon} size={STAR_SIZE} color={STAR_COLOR} />
      ))}
      <ThemedText style={styles.ratingText}>{rating}</ThemedText>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 2,
  },
  ratingText: {
    fontSize: 14,
    fontWeight: '600',
    marginLeft: 4,
  },
});
