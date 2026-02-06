import { LinearGradient } from 'expo-linear-gradient';
import { DimensionValue, StyleSheet, Text, View } from 'react-native';

interface VideoGridItemProps {
  displayIndex: number;
  width?: DimensionValue;
}

export function VideoGridItem({ displayIndex, width }: VideoGridItemProps) {
  return (
    <View style={[styles.gridItem, width ? { width } : undefined]}>
      <LinearGradient
        colors={['rgba(0,0,0,0.3)', 'transparent']}
        start={{ x: 0, y: 0.5 }}
        end={{ x: 1, y: 0.5 }}
        style={StyleSheet.absoluteFill}
      />
      <Text style={styles.text}>{`Video ${displayIndex}`}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  gridItem: {
    width: 160,
    height: 96,
    borderRadius: 12,
    overflow: 'hidden',
    backgroundColor: '#5074aaff',
    justifyContent: 'center',
    alignItems: 'center',
  },
  text: {
    color: '#ffffff',
  },
});
