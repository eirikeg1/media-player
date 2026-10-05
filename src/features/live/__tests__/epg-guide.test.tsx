/**
 * The EPG guide's two navigation-shaped behaviours.
 *
 * Pressing a programme is a navigation now, not screen state: the programme
 * (and the channel it airs on, when the guide has it) travels in the route
 * parameters, which is what keeps the guide mounted behind the detail surface
 * and lets back walk player → channel → programme → guide.
 *
 * Its filters are per playlist, too: a group, a search or a day left over from
 * the previous playlist filters the guide down to nothing with no sign of why.
 *
 * The data hooks are stubbed: what is under test is the guide's own state and
 * hand-off, not the queries that fill it.
 */
import { EpgGuide } from '@/features/live/guide/epg-guide';
import { channelParam, epgProgrammeParam } from '@/lib/route-params';
import type { Channel } from '@/types/playlist.types';
import { render, screen, userEvent } from '@testing-library/react-native';
import type { EpgProgramme } from 'expo-m3u-parser';

const mockPush = jest.fn();
jest.mock('expo-router', () => ({
  useRouter: () => ({ push: mockPush, back: jest.fn(), replace: jest.fn(), canGoBack: () => true }),
}));

const BBC: Channel = {
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

jest.mock('@/features/live/hooks/use-paginated-channels', () => ({
  usePaginatedChannels: () => ({
    channels: [BBC],
    isLoading: false,
    isLoadingMore: false,
    isRefreshing: false,
    hasMore: false,
    loadMore: jest.fn(),
    error: null,
    refresh: jest.fn(),
    retry: jest.fn(),
  }),
}));

jest.mock('@/features/live/hooks/use-guide-programmes', () => ({
  useGuideProgrammes: () => ({
    programmesByChannel: new Map([['bbc.one.uk', [PROGRAMME]]]),
    isLoading: false,
    isFetching: false,
    refresh: jest.fn(),
  }),
}));

// Only the backend search is stubbed; `isEpgSearchActive` decides whether the
// typed text counts as a search at all, which this test depends on being real.
jest.mock('@/features/live/hooks/use-epg-search', () => ({
  ...jest.requireActual('@/features/live/hooks/use-epg-search'),
  useEpgSearch: () => ({
    searchProgrammesByChannel: new Map(),
    searchChannels: [],
    isSearching: false,
  }),
}));

// The guide's own chrome is virtualised and animated; these stand-ins expose
// the filter state as text and offer a way to change each part of it.
jest.mock('@/features/live/guide/epg-guide-top-bar', () => {
  const { Text } = jest.requireActual('react-native');
  return {
    EpgGuideTopBar: ({
      selectedDate,
      onDateChange,
      searchText,
      onSearchTextChange,
      selectedGroupName,
      onGroupSelect,
    }: {
      selectedDate: Date;
      onDateChange: (date: Date) => void;
      searchText: string;
      onSearchTextChange: (text: string) => void;
      selectedGroupName: string;
      onGroupSelect: (group: string) => void;
    }) => (
      <>
        <Text>{`search:${searchText}`}</Text>
        <Text>{`group:${selectedGroupName}`}</Text>
        <Text>{`day:${selectedDate.toDateString()}`}</Text>
        <Text onPress={() => onSearchTextChange('news')}>set-search</Text>
        <Text onPress={() => onGroupSelect('UK | Entertainment')}>set-group</Text>
        <Text onPress={() => onDateChange(new Date('2001-09-11T12:00:00Z'))}>set-day</Text>
      </>
    ),
  };
});

jest.mock('@/features/live/guide/epg-filter-modal', () => {
  const { Text } = jest.requireActual('react-native');
  return {
    EpgFilterModal: ({
      hideEmptyChannels,
      onHideEmptyChannelsChange,
    }: {
      hideEmptyChannels: boolean;
      onHideEmptyChannelsChange: (hide: boolean) => void;
    }) => (
      <>
        <Text>{`hide-empty:${hideEmptyChannels}`}</Text>
        <Text onPress={() => onHideEmptyChannelsChange(false)}>show-empty</Text>
      </>
    ),
  };
});

jest.mock('@/features/live/guide/epg-programme-grid', () => {
  const { Text } = jest.requireActual('react-native');
  return {
    EpgProgrammeGrid: ({
      programmesByChannel,
      onProgrammePress,
    }: {
      programmesByChannel: Map<string, EpgProgramme[]>;
      onProgrammePress: (programme: EpgProgramme) => void;
    }) => (
      <>
        {[...programmesByChannel.values()].flat().map((programme) => (
          <Text key={programme.title} onPress={() => onProgrammePress(programme)}>
            {programme.title}
          </Text>
        ))}
      </>
    ),
  };
});

jest.mock('@/features/live/guide/epg-channel-column', () => ({ EpgChannelColumn: () => null }));
jest.mock('@/features/live/guide/epg-time-header', () => ({ EpgTimeHeader: () => null }));
jest.mock('@/features/live/guide/epg-current-time-indicator', () => ({
  EpgCurrentTimeIndicator: () => null,
}));

/** The guide as the Live screen mounts it, for one playlist. */
const guideFor = (playlistId: string) => (
  <EpgGuide
    playlistId={playlistId}
    favoriteChannels={[]}
    favoriteGroups={[]}
    groups={[]}
    excludeAdult={false}
    onChannelPress={jest.fn()}
    onToggleFavoriteGroup={jest.fn()}
    onRefresh={jest.fn()}
    isRefreshing={false}
  />
);

describe('EPG guide navigation', () => {
  it('pushes the programme route with the programme and its channel', async () => {
    await render(guideFor('playlist-1'));

    await userEvent.press(screen.getByText('Match of the Day'));

    expect(mockPush).toHaveBeenCalledWith({
      pathname: '/programme',
      params: {
        playlistId: 'playlist-1',
        programme: epgProgrammeParam.encode(PROGRAMME),
        channel: channelParam.encode(BBC),
      },
    });
  });
});

describe('EPG guide filters', () => {
  it('resets every filter when the playlist changes', async () => {
    const view = await render(guideFor('playlist-1'));

    await userEvent.press(screen.getByText('set-search'));
    await userEvent.press(screen.getByText('set-group'));
    await userEvent.press(screen.getByText('set-day'));
    await userEvent.press(screen.getByText('show-empty'));

    expect(screen.getByText('search:news')).toBeTruthy();
    expect(screen.getByText('group:UK | Entertainment')).toBeTruthy();
    expect(screen.getByText('day:Tue Sep 11 2001')).toBeTruthy();
    expect(screen.getByText('hide-empty:false')).toBeTruthy();

    await view.rerender(guideFor('playlist-2'));

    expect(screen.getByText('search:')).toBeTruthy();
    expect(screen.getByText('group:')).toBeTruthy();
    expect(screen.getByText(`day:${new Date().toDateString()}`)).toBeTruthy();
    expect(screen.getByText('hide-empty:true')).toBeTruthy();
  });

  it('keeps the filters while the playlist stays the same', async () => {
    const view = await render(guideFor('playlist-1'));

    await userEvent.press(screen.getByText('set-search'));
    await view.rerender(guideFor('playlist-1'));

    expect(screen.getByText('search:news')).toBeTruthy();
  });
});
