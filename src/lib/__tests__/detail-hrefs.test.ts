/**
 * The origin a playback session remembers is what the mini bar puts back
 * underneath the player when it expands, so it has to keep describing what is
 * actually playing — including after next/previous replaced it.
 */
import { channelHref, movieHref, queueStepOrigin, seriesHref } from '@/lib/detail-hrefs';
import type { Channel } from '@/types/playlist.types';

function channel(overrides: Partial<Channel> = {}): Channel {
  return {
    name: 'BBC One',
    url: 'http://panel.example/live/user/pass/101.ts',
    tvg: { id: 'bbc.one.uk' },
    group: { title: 'UK | Entertainment' },
    ...overrides,
  };
}

const SERIES_ORIGIN = seriesHref('pl-1', {
  seriesName: 'Severance',
  groupName: 'Drama',
  episodeCount: 19,
});

describe('queueStepOrigin', () => {
  it('names the live channel the queue stepped to', () => {
    const stepped = channel({ name: 'ITV 1', url: 'http://panel.example/live/user/pass/102.ts' });

    expect(queueStepOrigin('live', 'pl-1', stepped, channelHref('pl-1', channel()))).toEqual(
      channelHref('pl-1', stepped),
    );
  });

  it('names the movie the queue stepped to', () => {
    const stepped = channel({ name: 'Dune: Part Two', group: { title: 'Movies | Sci-Fi' } });

    expect(queueStepOrigin('movie', 'pl-1', stepped, movieHref('pl-1', channel()))).toEqual(
      movieHref('pl-1', stepped),
    );
  });

  it('keeps the series sheet, which a next episode is still part of', () => {
    const stepped = channel({ name: 'Severance S01E02', group: { title: 'Series | Drama' } });

    expect(queueStepOrigin('series', 'pl-1', stepped, SERIES_ORIGIN)).toBe(SERIES_ORIGIN);
  });

  it('has no origin to keep when the launch recorded none', () => {
    expect(queueStepOrigin('series', 'pl-1', channel(), null)).toBeNull();
  });
});
