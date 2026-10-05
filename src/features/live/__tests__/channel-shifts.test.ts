/**
 * What the guide hooks hand the native EPG reads: the channels that can match
 * guide data at all, each with its `tvg-shift`.
 */
import {
  channelShiftKey,
  sameChannelShifts,
  toChannelShifts,
} from '@/features/live/hooks/channel-shifts';
import type { Channel } from '@/types/playlist.types';

function makeChannel(id: string | undefined, shift?: number): Channel {
  return {
    name: id ?? 'No id',
    url: `http://stream.test/${id ?? 'none'}`,
    tvg: { id, shift },
    group: {},
  };
}

describe('toChannelShifts', () => {
  it('pairs every EPG-addressable channel with its shift, defaulting to none', () => {
    const channels = [makeChannel('nrk1.no', 1), makeChannel('bbcone.uk'), makeChannel('cnn.us', -2)];

    expect(toChannelShifts(channels)).toEqual([
      { channelId: 'nrk1.no', shiftHours: 1 },
      { channelId: 'bbcone.uk', shiftHours: 0 },
      { channelId: 'cnn.us', shiftHours: -2 },
    ]);
  });

  it('answers one shift per guide id, the shifted one when an HD/SD pair disagrees', () => {
    const channels = [
      makeChannel('tv2.no'),
      makeChannel('tv2.no', 1),
      makeChannel('nrk1.no', 2),
      makeChannel('nrk1.no', 3),
    ];

    // The grid and the search would otherwise stage different shifts for the
    // same id (first row wins on one path, the non-zero one on the other).
    expect(toChannelShifts(channels)).toEqual([
      { channelId: 'tv2.no', shiftHours: 1 },
      { channelId: 'nrk1.no', shiftHours: 2 },
    ]);
  });

  it('leaves out channels the guide cannot be keyed by', () => {
    // Nothing in `epg_programmes` can match these, so asking about them only
    // makes the query list longer.
    expect(toChannelShifts([makeChannel(undefined, 1), makeChannel('   ')])).toEqual([]);
  });
});

describe('sameChannelShifts', () => {
  it('holds the list stable while the channels and their shifts are unchanged', () => {
    const a = toChannelShifts([makeChannel('nrk1.no', 1), makeChannel('bbcone.uk')]);
    const b = toChannelShifts([makeChannel('nrk1.no', 1), makeChannel('bbcone.uk')]);

    expect(sameChannelShifts(a, b)).toBe(true);
  });

  it('notices a re-import that changed a shift, not just a changed channel list', () => {
    const before = toChannelShifts([makeChannel('nrk1.no', 1)]);

    expect(sameChannelShifts(before, toChannelShifts([makeChannel('nrk1.no', 2)]))).toBe(false);
    expect(sameChannelShifts(before, toChannelShifts([makeChannel('nrk2.no', 1)]))).toBe(false);
    expect(sameChannelShifts(before, [])).toBe(false);
  });
});

describe('channelShiftKey', () => {
  it('changes with the shift, so a re-imported shift is fetched again', () => {
    expect(channelShiftKey({ channelId: 'nrk1.no', shiftHours: 1 })).not.toBe(
      channelShiftKey({ channelId: 'nrk1.no', shiftHours: 2 })
    );
    expect(channelShiftKey({ channelId: 'nrk1.no', shiftHours: 1 })).toBe(
      channelShiftKey({ channelId: 'nrk1.no', shiftHours: 1 })
    );
  });
});
