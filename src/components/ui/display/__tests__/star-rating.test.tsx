import { render, screen } from '@testing-library/react-native';

import { StarRating } from '../star-rating';

// Render each icon as plain text so the star states are queryable.
jest.mock('../icon-symbol', () => {
  const { Text } = jest.requireActual<typeof import('react-native')>('react-native');
  const React = jest.requireActual<typeof import('react')>('react');
  return {
    IconSymbol: ({ name }: { name: string }) => React.createElement(Text, null, name),
  };
});

/** Collects the SF Symbol names of the rendered star icons, in order. */
function getStarNames(): (string | undefined)[] {
  return screen.getAllByText(/^star/).map((star) => star.props.children);
}

describe('StarRating', () => {
  it('renders the rating text alongside the stars', async () => {
    await render(<StarRating rating="7.5" />);

    expect(screen.getByText('7.5')).toBeOnTheScreen();
  });

  it('renders nothing for a non-numeric rating', async () => {
    await render(<StarRating rating="N/A" />);

    expect(screen.toJSON()).toBeNull();
  });

  it('converts a 0-10 rating to filled, half and empty stars', async () => {
    // 7.0 / 2 = 3.5 stars
    await render(<StarRating rating="7.0" />);

    expect(getStarNames()).toEqual([
      'star.fill',
      'star.fill',
      'star.fill',
      'star.leadinghalf.filled',
      'star',
    ]);
  });

  it('renders five filled stars for a perfect rating', async () => {
    await render(<StarRating rating="10" />);

    expect(getStarNames()).toEqual(Array(5).fill('star.fill'));
  });

  it('renders five empty stars for a rating below 1', async () => {
    await render(<StarRating rating="0.5" />);

    expect(getStarNames()).toEqual(Array(5).fill('star'));
  });
});
