import { ThemedText } from '@/components/ui/display/themed-text';
import { useThemeColor } from '@/hooks/use-theme-color';
import type { EpgProgramme } from 'expo-m3u-parser';
import React from 'react';
import { StyleSheet, TouchableOpacity, View } from 'react-native';
import { HOUR_WIDTH, MIN_PROGRAMME_WIDTH } from './epg-constants';

interface EpgProgrammeBlockProps {
  programme: EpgProgramme;
  dayStartSeconds: number;
  isCurrentlyAiring: boolean;
  onPress: (programme: EpgProgramme) => void;
}

function EpgProgrammeBlockInner({
  programme,
  dayStartSeconds,
  isCurrentlyAiring,
  onPress,
}: EpgProgrammeBlockProps) {
  const tintColor = useThemeColor({}, 'tint');
  const borderColor = useThemeColor({ light: '#d0d0d0', dark: '#444' }, 'icon');

  const left = ((programme.start - dayStartSeconds) / 3600) * HOUR_WIDTH;
  const width = Math.max(
    ((programme.stop - programme.start) / 3600) * HOUR_WIDTH,
    MIN_PROGRAMME_WIDTH
  );

  return (
    <TouchableOpacity
      style={[
        styles.block,
        {
          left,
          width,
          borderColor: isCurrentlyAiring ? tintColor : borderColor,
          borderWidth: isCurrentlyAiring ? 1.5 : 0.5,
        },
      ]}
      activeOpacity={0.7}
      onPress={() => onPress(programme)}
    >
      <ThemedText numberOfLines={1} style={styles.title}>
        {programme.title}
      </ThemedText>
      {programme.category ? (
        <View style={[styles.categoryPill, { backgroundColor: tintColor + '30' }]}>
          <ThemedText numberOfLines={1} style={styles.categoryText}>
            {programme.category}
          </ThemedText>
        </View>
      ) : null}
    </TouchableOpacity>
  );
}

export const EpgProgrammeBlock = React.memo(EpgProgrammeBlockInner);

const styles = StyleSheet.create({
  block: {
    position: 'absolute',
    top: 2,
    bottom: 2,
    borderRadius: 4,
    paddingHorizontal: 6,
    paddingVertical: 4,
    justifyContent: 'center',
    overflow: 'hidden',
    backgroundColor: 'rgba(128,128,128,0.08)',
  },
  title: {
    fontSize: 11,
    fontWeight: '500',
  },
  categoryPill: {
    alignSelf: 'flex-start',
    borderRadius: 3,
    paddingHorizontal: 4,
    paddingVertical: 1,
    marginTop: 2,
  },
  categoryText: {
    fontSize: 9,
  },
});
