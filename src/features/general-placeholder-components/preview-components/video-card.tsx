import { LinearGradient } from 'expo-linear-gradient';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import Animated, { useAnimatedStyle, withTiming } from 'react-native-reanimated';

// Constants
const INACTIVE_SCALE = 0.8;
const SCALE_ANIMATION_DURATION = 200;
const CARD_HEIGHT = 160;
const CARD_CONTAINER_HEIGHT = 180;

export interface VideoCardProps {
  isActive: boolean;
  displayIndex: number;
  itemWidth: number;
  index: number;
  activeIndex: number;
  totalItems: number;
  overlap: number;
  onPress: () => void;
}

export function VideoCard({
  isActive,
  displayIndex,
  itemWidth,
  index,
  activeIndex,
  totalItems,
  overlap,
  onPress,
}: VideoCardProps) {
  const animatedStyle = useAnimatedStyle(() => ({
    transform: [
      {
        scale: withTiming(isActive ? 1.0 : INACTIVE_SCALE, {
          duration: SCALE_ANIMATION_DURATION,
        }),
      },
    ],
  }));

  const calculateZIndex = (): number => {
    if (isActive) {
      return totalItems + 1;
    }
    return totalItems - Math.abs(index - activeIndex);
  };

  return (
    <Pressable
      onPress={onPress}
      style={[
        styles.container,
        {
          width: itemWidth,
          marginLeft: index > 0 ? -overlap : 0,
          zIndex: calculateZIndex(),
        },
      ]}
    >
      <Animated.View style={[styles.animatedCard, { width: itemWidth }, animatedStyle]}>
        <View style={[styles.card, { width: itemWidth }]}>
          <LinearGradient
            colors={['rgba(0,0,0,0.3)', 'transparent']}
            start={{ x: 0, y: 0.5 }}
            end={{ x: 1, y: 0.5 }}
            style={StyleSheet.absoluteFill}
          />
          <Text style={styles.text}>{`Video ${displayIndex}`}</Text>
        </View>
      </Animated.View>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  container: {
    height: CARD_CONTAINER_HEIGHT,
    justifyContent: 'center',
    alignItems: 'center',
  },
  animatedCard: {
    height: CARD_HEIGHT,
  },
  card: {
    height: CARD_HEIGHT,
    borderRadius: 18,
    overflow: 'hidden',
    backgroundColor: '#5074aaff', // gray-300
    justifyContent: 'center',
    alignItems: 'center',
  },
  text: {
    color: '#ffffff',
  },
});
