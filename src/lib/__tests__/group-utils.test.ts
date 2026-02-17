import {
  isAdultGroup,
  sortGroupsWithAdultLast,
  processRawGroupCounts,
  getEffectiveFavoriteGroups,
  calculateChannelGroups,
  FAVORITES_GROUP_SENTINEL,
  type GroupOption,
} from '../group-utils';
import type { Channel } from '@/types/playlist.types';

describe('isAdultGroup', () => {
  it.each(['XXX Movies', 'Adult Content', 'porn', 'NSFW Channels', 'Erotic', 'x-rated', 'xrated', '18+ Only'])(
    'detects adult group: %s',
    (name) => {
      expect(isAdultGroup(name)).toBe(true);
    },
  );

  it('detects standalone "18"', () => {
    expect(isAdultGroup('18')).toBe(true);
    expect(isAdultGroup('18 Sports')).toBe(true);
    expect(isAdultGroup('Group 18')).toBe(true);
    expect(isAdultGroup('Group 18 Live')).toBe(true);
  });

  it('does not flag "2018" as adult', () => {
    expect(isAdultGroup('2018 Movies')).toBe(false);
  });

  it('does not flag normal groups', () => {
    expect(isAdultGroup('Sports')).toBe(false);
    expect(isAdultGroup('News')).toBe(false);
  });
});

describe('sortGroupsWithAdultLast', () => {
  it('sorts non-adult alphabetically, then adult alphabetically', () => {
    const groups: GroupOption[] = [
      { name: 'Zebra', channelCount: 1 },
      { name: 'XXX', channelCount: 2 },
      { name: 'Alpha', channelCount: 3 },
      { name: 'Adult Channels', channelCount: 4 },
    ];
    const sorted = sortGroupsWithAdultLast(groups);
    expect(sorted.map((g) => g.name)).toEqual(['Alpha', 'Zebra', 'Adult Channels', 'XXX']);
  });

  it('skips entries with empty name (All Channels)', () => {
    const groups: GroupOption[] = [
      { name: '', channelCount: 10 },
      { name: 'News', channelCount: 5 },
    ];
    const sorted = sortGroupsWithAdultLast(groups);
    expect(sorted).toEqual([{ name: 'News', channelCount: 5 }]);
  });
});

describe('processRawGroupCounts', () => {
  it('prepends "All" entry with total count and sorts groups', () => {
    const raw = [
      { name: 'Zebra', count: 10, firstPosition: 2 },
      { name: 'Alpha', count: 5, firstPosition: 1 },
    ];
    const result = processRawGroupCounts(raw);
    expect(result[0]).toEqual({ name: '', channelCount: 15 });
    expect(result[1].name).toBe('Alpha');
    expect(result[2].name).toBe('Zebra');
  });

  it('puts adult groups at the end', () => {
    const raw = [
      { name: 'XXX', count: 3, firstPosition: 3 },
      { name: 'News', count: 7, firstPosition: 1 },
    ];
    const result = processRawGroupCounts(raw);
    expect(result[result.length - 1].name).toBe('XXX');
  });
});

describe('getEffectiveFavoriteGroups', () => {
  const available: GroupOption[] = [
    { name: '', channelCount: 100 },
    { name: 'Sports', channelCount: 50 },
    { name: 'News', channelCount: 30 },
    { name: FAVORITES_GROUP_SENTINEL, channelCount: 0 },
  ];

  it('returns matched groups', () => {
    const result = getEffectiveFavoriteGroups(['Sports', 'Missing'], available);
    expect(result).toEqual(['Sports']);
  });

  it('returns undefined when no favorites match', () => {
    const result = getEffectiveFavoriteGroups(['Missing'], available);
    expect(result).toBeUndefined();
  });

  it('filters out empty name and sentinel', () => {
    const result = getEffectiveFavoriteGroups(['', FAVORITES_GROUP_SENTINEL], available);
    expect(result).toBeUndefined();
  });
});

describe('calculateChannelGroups', () => {
  const channels: Channel[] = [
    { name: 'Ch1', url: '', tvg: {}, group: { title: 'Sports' } },
    { name: 'Ch2', url: '', tvg: {}, group: { title: 'Sports' } },
    { name: 'Ch3', url: '', tvg: {}, group: { title: 'News' } },
  ];

  it('prepends "All" entry with total count', () => {
    const groups = calculateChannelGroups(channels);
    expect(groups[0]).toEqual({ name: '', channelCount: 3 });
  });

  it('groups channels by group.title', () => {
    const groups = calculateChannelGroups(channels);
    const sports = groups.find((g) => g.name === 'Sports');
    expect(sports?.channelCount).toBe(2);
  });

  it('uses "Uncategorized" for channels without a group', () => {
    const withNoGroup: Channel[] = [
      { name: 'X', url: '', tvg: {}, group: { title: undefined } },
    ];
    const groups = calculateChannelGroups(withNoGroup);
    expect(groups.find((g) => g.name === 'Uncategorized')).toBeDefined();
  });
});
