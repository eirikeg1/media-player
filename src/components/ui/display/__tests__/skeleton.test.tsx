import { render, screen } from '@testing-library/react-native';
import { StyleSheet } from 'react-native';

import { SkeletonBlock, skeletonColor, useSkeletonPulse } from '../skeleton';

/** A minimal composite: one pulse shared by every block, as real ones do. */
function TwoBlocks() {
  const pulse = useSkeletonPulse();
  return (
    <>
      <SkeletonBlock testID="first" width={40} height={12} color="#e0e0e0" pulse={pulse} />
      <SkeletonBlock
        testID="second"
        width="100%"
        height={8}
        borderRadius={9}
        color="#e0e0e0"
        pulse={pulse}
      />
    </>
  );
}

/** The flattened style of a rendered block, whatever shape the array takes. */
function styleOf(testID: string): Record<string, unknown> {
  return StyleSheet.flatten(screen.getByTestId(testID).props.style) as Record<string, unknown>;
}

describe('skeletonColor', () => {
  it('picks the placeholder grey for each scheme', () => {
    expect(skeletonColor(true)).toBe('#2a2a2a');
    expect(skeletonColor(false)).toBe('#e0e0e0');
  });
});

describe('SkeletonBlock', () => {
  it('applies the given size, radius and colour', async () => {
    await render(<TwoBlocks />);

    expect(styleOf('first')).toMatchObject({
      width: 40,
      height: 12,
      borderRadius: 4,
      backgroundColor: '#e0e0e0',
    });
    expect(styleOf('second')).toMatchObject({ width: '100%', height: 8, borderRadius: 9 });
  });

  it('drives every block from the one pulse', async () => {
    await render(<TwoBlocks />);

    // Both blocks carry the same animated opacity, so they fade in step.
    expect(styleOf('first').opacity).toBeDefined();
    expect(styleOf('first').opacity).toEqual(styleOf('second').opacity);
  });
});
