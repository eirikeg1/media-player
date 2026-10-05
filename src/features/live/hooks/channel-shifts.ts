import type { Channel } from '@/types/playlist.types';
import type { ChannelShift } from 'expo-m3u-parser';

/**
 * The EPG-addressable channels of `channels`, each paired with its `tvg-shift`.
 *
 * Only a channel with a tvg id can match guide data at all, so the ones without
 * one are left out rather than asked about. The shift travels with the id because
 * the native queries apply it: it decides which programmes are selected — which
 * one is "on now", which ones fall inside the requested day — as well as the
 * times that come back. A channel with no shift is sent as 0, which the query
 * treats as unshifted, so callers never have to know which channels have one.
 */
export function toChannelShifts(channels: Channel[]): ChannelShift[] {
  // One entry per guide id, not per channel row: an HD/SD pair shares a tvg id,
  // and the guide can only answer one shift for it. When the pair disagrees the
  // shifted one wins — a provider that sets `tvg-shift` on one variant meant
  // it for the guide feed, which both rows share.
  const byId = new Map<string, ChannelShift>();
  for (const channel of channels) {
    const channelId = channel.tvg?.id;
    if (!channelId || channelId.trim().length === 0) continue;
    const shiftHours = channel.tvg?.shift ?? 0;
    const existing = byId.get(channelId);
    if (!existing) byId.set(channelId, { channelId, shiftHours });
    else if (existing.shiftHours === 0 && shiftHours !== 0) existing.shiftHours = shiftHours;
  }
  return [...byId.values()];
}

/**
 * What a guide hook remembers having fetched. The shift is part of it: a
 * re-import that changes a channel's `tvg-shift` changes every time the guide
 * shows for it, so the channel has to be read again even though its id was.
 */
export function channelShiftKey(shift: ChannelShift): string {
  return `${shift.channelId}:${shift.shiftHours}`;
}

/**
 * Whether two lists name the same channels in the same order with the same
 * shifts — what the hooks compare to keep a stable array across re-renders, so a
 * parent re-rendering with an equal channel list does not re-run their fetches.
 */
export function sameChannelShifts(a: ChannelShift[], b: ChannelShift[]): boolean {
  return (
    a.length === b.length &&
    a.every(
      (shift, index) =>
        shift.channelId === b[index].channelId && shift.shiftHours === b[index].shiftHours
    )
  );
}
