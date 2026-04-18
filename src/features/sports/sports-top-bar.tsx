import { Button } from '@/components/ui/controls/button';
import { memo } from 'react';
import { StyleSheet, View } from 'react-native';

export type SportsSection = 'fixtures' | 'standings' | 'scorers';

interface SportsTopBarProps {
  selected: SportsSection;
  onSelect: (section: SportsSection) => void;
}

export const SportsTopBar = memo(function SportsTopBar({ selected, onSelect }: SportsTopBarProps) {
  return (
    <View style={styles.container}>
      <Button
        title="Fixtures"
        variant={selected === 'fixtures' ? 'primary' : 'secondary'}
        size="small"
        style={styles.button}
        onPress={() => onSelect('fixtures')}
      />
      <Button
        title="Standings"
        variant={selected === 'standings' ? 'primary' : 'secondary'}
        size="small"
        style={styles.button}
        onPress={() => onSelect('standings')}
      />
      <Button
        title="Scorers"
        variant={selected === 'scorers' ? 'primary' : 'secondary'}
        size="small"
        style={styles.button}
        onPress={() => onSelect('scorers')}
      />
    </View>
  );
});

const styles = StyleSheet.create({
  container: {
    flexDirection: 'row',
    gap: 8,
    paddingHorizontal: 16,
    paddingVertical: 8,
  },
  button: {
    flex: 1,
  },
});
