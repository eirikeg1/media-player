/**
 * The `(detail)` routes for a live channel and a guide programme.
 *
 * They live in `src/app`, but their tests cannot: every `.tsx` under the app
 * directory becomes a route, so a `__tests__` folder there would show up in the
 * router as one.
 *
 * What is worth pinning down here is the parameter contract — a route parameter
 * survives a process restart and hand-edited deep links, so an unreadable one
 * has to become an error state with a way out rather than a crash inside the
 * detail component.
 */
import ChannelDetailRoute from '@/app/(detail)/channel';
import ProgrammeDetailRoute from '@/app/(detail)/programme';
import { channelParam, epgProgrammeParam } from '@/lib/route-params';
import type { Channel } from '@/types/playlist.types';
import { render, screen, userEvent } from '@testing-library/react-native';
import type { EpgProgramme } from 'expo-m3u-parser';

const mockReplace = jest.fn();
const mockBack = jest.fn();
const mockCanGoBack = jest.fn();
const mockUseLocalSearchParams = jest.fn();

jest.mock('expo-router', () => ({
  useLocalSearchParams: () => mockUseLocalSearchParams(),
  useRouter: () => ({
    push: jest.fn(),
    back: mockBack,
    replace: mockReplace,
    canGoBack: mockCanGoBack,
  }),
}));

// The detail surfaces themselves are covered by their own tests; here they only
// have to prove they were handed the decoded value.
jest.mock('@/features/live/channel-detail', () => {
  const { Text } = jest.requireActual('react-native');
  return {
    ChannelDetail: ({ channel, playlistId }: { channel: Channel; playlistId: string }) => (
      <Text>{`channel:${channel.name}@${playlistId}`}</Text>
    ),
  };
});

jest.mock('@/features/live/guide/epg-programme-detail', () => {
  const { Text } = jest.requireActual('react-native');
  return {
    EpgProgrammeDetail: ({
      programme,
      playlistId,
      channel,
    }: {
      programme: EpgProgramme;
      playlistId: string;
      channel: Channel | null;
    }) => <Text>{`programme:${programme.title}@${playlistId}/${channel?.name ?? 'none'}`}</Text>,
  };
});

// `clearMocks` clears calls but keeps implementations, so the fallback case
// below would otherwise leak into every later test.
beforeEach(() => {
  mockCanGoBack.mockReturnValue(true);
});

const CHANNEL: Channel = {
  name: 'BBC One HD',
  url: 'http://panel.example/live/user/pass/4242.ts',
  tvg: { id: 'bbc.one.uk' },
  group: { title: 'UK | Entertainment' },
};

const PROGRAMME: EpgProgramme = {
  channelId: 'bbc.one.uk',
  title: 'Match of the Day',
  start: 1_726_000_000,
  stop: 1_726_003_600,
};

describe('channel detail route', () => {
  it('renders the channel carried in the route parameters', async () => {
    mockUseLocalSearchParams.mockReturnValue({
      playlistId: 'playlist-1',
      channel: channelParam.encode(CHANNEL),
    });

    await render(<ChannelDetailRoute />);

    expect(screen.getByText('channel:BBC One HD@playlist-1')).toBeTruthy();
  });

  it('shows a recoverable error for an unreadable parameter', async () => {
    mockUseLocalSearchParams.mockReturnValue({ playlistId: 'playlist-1', channel: 'not json' });

    await render(<ChannelDetailRoute />);

    expect(screen.getByText("Can't Open This Channel")).toBeTruthy();
    await userEvent.press(screen.getByText('Go Back'));
    expect(mockBack).toHaveBeenCalledTimes(1);
  });

  it('shows the same error when there is no playlist to play it against', async () => {
    mockUseLocalSearchParams.mockReturnValue({ channel: channelParam.encode(CHANNEL) });

    await render(<ChannelDetailRoute />);

    expect(screen.getByText("Can't Open This Channel")).toBeTruthy();
  });

  it('falls back to the live tab when the route is the whole stack', async () => {
    // A deep link straight into the detail route has nothing to pop, and
    // `back()` would leave a close button that does not close.
    mockCanGoBack.mockReturnValue(false);
    mockUseLocalSearchParams.mockReturnValue({ playlistId: 'playlist-1', channel: '{}' });

    await render(<ChannelDetailRoute />);
    await userEvent.press(screen.getByText('Go Back'));

    expect(mockBack).not.toHaveBeenCalled();
    expect(mockReplace).toHaveBeenCalledWith('/live');
  });
});

describe('programme detail route', () => {
  it('renders the programme and the channel it airs on', async () => {
    mockUseLocalSearchParams.mockReturnValue({
      playlistId: 'playlist-1',
      programme: epgProgrammeParam.encode(PROGRAMME),
      channel: channelParam.encode(CHANNEL),
    });

    await render(<ProgrammeDetailRoute />);

    expect(screen.getByText('programme:Match of the Day@playlist-1/BBC One HD')).toBeTruthy();
  });

  it('still opens for a programme whose channel the guide never loaded', async () => {
    // A guide row can name a channel pagination hasn't reached; the programme
    // is still worth reading, it just has nothing to watch.
    mockUseLocalSearchParams.mockReturnValue({
      playlistId: 'playlist-1',
      programme: epgProgrammeParam.encode(PROGRAMME),
    });

    await render(<ProgrammeDetailRoute />);

    expect(screen.getByText('programme:Match of the Day@playlist-1/none')).toBeTruthy();
  });

  it('shows a recoverable error for an unreadable programme', async () => {
    mockUseLocalSearchParams.mockReturnValue({
      playlistId: 'playlist-1',
      programme: '{"title":"Match of the Day"}',
    });

    await render(<ProgrammeDetailRoute />);

    expect(screen.getByText("Can't Open This Programme")).toBeTruthy();
    await userEvent.press(screen.getByText('Go Back'));
    expect(mockBack).toHaveBeenCalledTimes(1);
  });
});
