import { makePlaylist } from '@/test/factories';
import { render, screen } from '@testing-library/react-native';

import { PlaylistForm } from '../playlist-form';

describe('PlaylistForm sync intervals', () => {
  it('shows Off for an interval stored as 0, not a default', async () => {
    await render(
      <PlaylistForm playlist={makePlaylist({ syncInterval: 0, epgSyncInterval: 720 })} />,
    );

    expect(screen.getByText('Off')).toBeOnTheScreen();
    expect(screen.getByText('Every 12 hours')).toBeOnTheScreen();
  });

  it('offers both pickers when adding, preset to the defaults', async () => {
    await render(<PlaylistForm />);

    expect(screen.getByLabelText('Playlist auto sync interval')).toBeOnTheScreen();
    expect(screen.getByLabelText('EPG auto sync interval')).toBeOnTheScreen();
    expect(screen.getByText('Every 6 hours')).toBeOnTheScreen();
    expect(screen.getByText('Every day')).toBeOnTheScreen();
  });
});
