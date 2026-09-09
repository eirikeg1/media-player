import { StyleSheet, Text, TouchableOpacity, View } from 'react-native';

import { SPORTS_ACCENT } from '../sports-theme';
import { FAINT, MUTED } from './match-detail-shared';

/** Which stream the Watch tab lists: the live channel or the panel's archive. */
export type WatchMode = 'live' | 'catchup';

interface WatchModeToggleProps {
  mode: WatchMode;
  onChange: (mode: WatchMode) => void;
  /** Catch-up needs a qualifying channel — off until one is known. */
  catchupDisabled: boolean;
  /** Why it is off, once that is known; null while it isn't (or isn't off). */
  catchupDisabledReason: string | null;
}

/** Two-segment switch above the channel list, with the reason when catch-up is off. */
export function WatchModeToggle({
  mode,
  onChange,
  catchupDisabled,
  catchupDisabledReason,
}: WatchModeToggleProps) {
  return (
    <View style={styles.container}>
      <View style={styles.segments}>
        <Segment label="Live" selected={mode === 'live'} onPress={() => onChange('live')} />
        <Segment
          label="Catch-up"
          selected={mode === 'catchup'}
          disabled={catchupDisabled}
          onPress={() => onChange('catchup')}
        />
      </View>
      {catchupDisabledReason && <Text style={styles.reason}>{catchupDisabledReason}</Text>}
    </View>
  );
}

function Segment({
  label,
  selected,
  disabled = false,
  onPress,
}: {
  label: string;
  selected: boolean;
  disabled?: boolean;
  onPress: () => void;
}) {
  return (
    <TouchableOpacity
      style={[styles.segment, selected && styles.segmentSelected]}
      onPress={onPress}
      disabled={disabled}
      activeOpacity={0.7}
      accessibilityRole="tab"
      accessibilityState={{ selected, disabled }}
    >
      <Text
        style={[
          styles.segmentLabel,
          selected && styles.segmentLabelSelected,
          disabled && styles.segmentLabelDisabled,
        ]}
      >
        {label}
      </Text>
    </TouchableOpacity>
  );
}

const styles = StyleSheet.create({
  container: {
    gap: 6,
  },
  segments: {
    flexDirection: 'row',
    gap: 4,
    padding: 3,
    borderRadius: 10,
    backgroundColor: FAINT,
  },
  segment: {
    flex: 1,
    paddingVertical: 8,
    borderRadius: 8,
    alignItems: 'center',
  },
  segmentSelected: {
    backgroundColor: SPORTS_ACCENT.tint,
  },
  segmentLabel: {
    color: MUTED,
    fontSize: 13,
    fontWeight: '600',
  },
  segmentLabelSelected: {
    color: '#FFFFFF',
    fontWeight: '700',
  },
  segmentLabelDisabled: {
    color: 'rgba(255, 255, 255, 0.28)',
  },
  reason: {
    color: MUTED,
    fontSize: 12,
  },
});
