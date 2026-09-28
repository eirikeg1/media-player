/**
 * Route parameters are untrusted input: they survive a process restart, an app
 * update that changed the shape, and hand-edited deep links. Decoding one must
 * therefore never throw and never hand a half-decoded object to a screen that
 * dereferences its fields without checking.
 */
import type { EpgProgramme, SeriesInfo } from 'expo-m3u-parser';

import {
  channelParam,
  defineRouteParam,
  epgProgrammeParam,
  hrefParam,
  leagueRefParam,
  seriesInfoParam,
  teamRefParam,
} from '@/lib/route-params';
import type { Channel } from '@/types/playlist.types';

function channel(overrides: Partial<Channel> = {}): Channel {
  return {
    name: 'Dune: Part Two',
    url: 'http://panel.example/movie/user/pass/12345.mkv',
    tvg: { id: 'movie:12345', logo: 'https://img.example/dune.jpg' },
    group: { title: 'Action | Sci-Fi' },
    ...overrides,
  };
}

function series(overrides: Partial<SeriesInfo> = {}): SeriesInfo {
  return {
    seriesName: 'Severance',
    groupName: 'Drama',
    episodeCount: 19,
    poster: 'https://img.example/severance.jpg',
    ...overrides,
  };
}

function programme(overrides: Partial<EpgProgramme> = {}): EpgProgramme {
  return {
    channelId: 'bbc.one.uk',
    title: 'Match of the Day',
    start: 1_726_000_000,
    stop: 1_726_003_600,
    description: 'Highlights',
    category: 'Sports',
    subTitle: null,
    episodeNum: null,
    icon: null,
    ...overrides,
  };
}

describe('defineRouteParam', () => {
  const isGreeting = (value: unknown): value is { hello: string } =>
    typeof value === 'object' &&
    value !== null &&
    typeof (value as { hello?: unknown }).hello === 'string';
  const greetingParam = defineRouteParam(isGreeting);

  it('round-trips the value the launching screen holds', () => {
    expect(greetingParam.decode(greetingParam.encode({ hello: 'world' }))).toEqual({
      hello: 'world',
    });
  });

  it('takes the first value when the router hands over an array', () => {
    expect(greetingParam.decode([greetingParam.encode({ hello: 'world' })])).toEqual({
      hello: 'world',
    });
  });

  it('answers null for no parameter at all', () => {
    expect(greetingParam.decode(undefined)).toBeNull();
    expect(greetingParam.decode('')).toBeNull();
    expect(greetingParam.decode([])).toBeNull();
  });

  it('answers null rather than throwing for something that is not JSON', () => {
    expect(greetingParam.decode('not json')).toBeNull();
  });

  it('rejects JSON the validator does not recognise', () => {
    expect(greetingParam.decode('null')).toBeNull();
    expect(greetingParam.decode('[1,2,3]')).toBeNull();
    expect(greetingParam.decode('{"hello":42}')).toBeNull();
  });
});

describe('channelParam', () => {
  it('round-trips a channel', () => {
    const original = channel();
    expect(channelParam.decode(channelParam.encode(original))).toEqual(original);
  });

  it('keeps the optional http block a channel may carry', () => {
    const original = channel({ http: { userAgent: 'VLC/3.0', referrer: 'http://ref' } });
    expect(channelParam.decode(channelParam.encode(original))).toEqual(original);
  });

  it('rejects a channel missing the nested objects every screen dereferences', () => {
    // `getChannelId` reads `tvg.id` and the detail header reads `group.title`
    // without checking, so an absent block crashes the route rather than
    // degrading it.
    expect(channelParam.decode('{"name":"Dune","url":"http://x","group":{}}')).toBeNull();
    expect(channelParam.decode('{"name":"Dune","url":"http://x","tvg":{}}')).toBeNull();
  });

  it('rejects arrays and nulls in place of the nested objects', () => {
    expect(
      channelParam.decode('{"name":"Dune","url":"http://x","tvg":[],"group":{}}')
    ).toBeNull();
    expect(
      channelParam.decode('{"name":"Dune","url":"http://x","tvg":null,"group":{}}')
    ).toBeNull();
  });

  it('rejects an array in place of the channel itself', () => {
    expect(channelParam.decode('[]')).toBeNull();
  });
});

describe('seriesInfoParam', () => {
  it('round-trips a series', () => {
    const original = series();
    expect(seriesInfoParam.decode(seriesInfoParam.encode(original))).toEqual(original);
  });

  it('accepts a series with no poster', () => {
    expect(seriesInfoParam.decode(seriesInfoParam.encode(series({ poster: null })))).toEqual(
      series({ poster: null })
    );
    const { poster: _poster, ...withoutPoster } = series();
    expect(seriesInfoParam.decode(JSON.stringify(withoutPoster))).toEqual(withoutPoster);
  });

  it('rejects a series whose episode count arrived as a string', () => {
    // The header renders "19 episodes" off this number; a string would read
    // right and then break the singular/plural branch it is compared with.
    expect(seriesInfoParam.decode(JSON.stringify({ ...series(), episodeCount: '19' }))).toBeNull();
  });

  it('rejects a series with no group to look its episodes up by', () => {
    const { groupName: _groupName, ...withoutGroup } = series();
    expect(seriesInfoParam.decode(JSON.stringify(withoutGroup))).toBeNull();
  });
});

describe('epgProgrammeParam', () => {
  it('round-trips a programme', () => {
    const original = programme();
    expect(epgProgrammeParam.decode(epgProgrammeParam.encode(original))).toEqual(original);
  });

  it('accepts a programme carrying nothing but the fields the surface needs', () => {
    const bare = {
      channelId: 'bbc.one.uk',
      title: 'Match of the Day',
      start: 1_726_000_000,
      stop: 1_726_003_600,
    };
    expect(epgProgrammeParam.decode(JSON.stringify(bare))).toEqual(bare);
  });

  it('rejects times that arrived as strings', () => {
    // They are subtracted for the duration and compared against the clock; a
    // string would render right and then make "45 min" read NaN.
    expect(
      epgProgrammeParam.decode(JSON.stringify({ ...programme(), start: '1726000000' }))
    ).toBeNull();
    expect(
      epgProgrammeParam.decode(JSON.stringify({ ...programme(), stop: '1726003600' }))
    ).toBeNull();
  });

  it('rejects a programme with no channel to watch it on', () => {
    const { channelId: _channelId, ...withoutChannel } = programme();
    expect(epgProgrammeParam.decode(JSON.stringify(withoutChannel))).toBeNull();
  });

  it('answers null rather than throwing for something that is not a programme', () => {
    expect(epgProgrammeParam.decode('not json')).toBeNull();
    expect(epgProgrammeParam.decode('[]')).toBeNull();
  });
});

describe('teamRefParam', () => {
  const team = { provider: 'sofascore', providerId: 42, name: 'Arsenal', crest: 'https://x/a.png' };

  it('round-trips the side a match knew about', () => {
    expect(teamRefParam.decode(teamRefParam.encode(team))).toEqual(team);
  });

  it('accepts a side the provider gave no crest for', () => {
    const { crest: _crest, ...crestless } = team;
    expect(teamRefParam.decode(JSON.stringify(crestless))).toEqual(crestless);
    expect(teamRefParam.decode(JSON.stringify({ ...team, crest: null }))).toEqual({
      ...team,
      crest: null,
    });
  });

  it('rejects a team with no id to look its matches up by', () => {
    // The schedule is fetched by provider id; a name alone opens a surface that
    // can never fill.
    const { providerId: _providerId, ...withoutId } = team;
    expect(teamRefParam.decode(JSON.stringify(withoutId))).toBeNull();
    expect(teamRefParam.decode(JSON.stringify({ ...team, providerId: '42' }))).toBeNull();
  });
});

describe('leagueRefParam', () => {
  const league = {
    key: 'league:17',
    competitionId: 17,
    title: 'Premier League',
    subtitle: 'England',
    logoUrl: 'https://x/pl.png',
    dateIso: '2026-06-12T00:00:00.000Z',
    tab: 'matches' as const,
  };

  it('round-trips the competition and the day it was opened from', () => {
    expect(leagueRefParam.decode(leagueRefParam.encode(league))).toEqual(league);
  });

  it('accepts a competition the provider gave no id for', () => {
    // Grouped by name instead: it has a day of matches, but no table and no
    // scorers to look up.
    const { competitionId: _competitionId, ...unidentified } = league;
    expect(
      leagueRefParam.decode(JSON.stringify({ ...unidentified, key: 'league:name:Friendlies' }))
    ).toEqual({ ...unidentified, key: 'league:name:Friendlies' });
  });

  it('rejects a day that cannot be read back as a date', () => {
    // The surface reads its fixtures for this day; an unparseable one would
    // list the window around `NaN`.
    expect(leagueRefParam.decode(JSON.stringify({ ...league, dateIso: 'the twelfth' }))).toBeNull();
    expect(leagueRefParam.decode(JSON.stringify({ ...league, dateIso: 20260612 }))).toBeNull();
  });

  it('rejects a tab the surface has no section for', () => {
    expect(leagueRefParam.decode(JSON.stringify({ ...league, tab: 'transfers' }))).toBeNull();
  });
});

describe('hrefParam', () => {
  it('round-trips the route a playback session was launched from', () => {
    const origin = {
      pathname: '/movie' as const,
      params: { playlistId: 'playlist-1', channel: channelParam.encode(channel()) },
    };

    expect(hrefParam.decode(hrefParam.encode(origin))).toEqual(origin);
  });

  it('accepts a route that carries no parameters', () => {
    expect(hrefParam.decode(hrefParam.encode({ pathname: '/live' }))).toEqual({
      pathname: '/live',
    });
  });

  it('rejects anything that is not a pushable route object', () => {
    // A launch origin is pushed as-is; without a pathname there is nowhere to
    // push, and the string form is not what any surface produces.
    expect(hrefParam.decode(JSON.stringify({ params: { playlistId: 'playlist-1' } }))).toBeNull();
    expect(hrefParam.decode(JSON.stringify({ pathname: '' }))).toBeNull();
    expect(hrefParam.decode(JSON.stringify({ pathname: '/movie', params: 'playlistId=1' }))).toBeNull();
    expect(hrefParam.decode(JSON.stringify('/movie'))).toBeNull();
  });

  it('is null when no origin travelled', () => {
    expect(hrefParam.decode(undefined)).toBeNull();
  });
});
