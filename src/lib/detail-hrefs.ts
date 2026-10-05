import type { SeriesInfo } from 'expo-m3u-parser';
import type { Href } from 'expo-router';

import type { Channel } from '@/types/playlist.types';
import type { ContentType } from '@/types/user.types';
import { channelParam, seriesInfoParam } from './route-params';

/**
 * The detail surfaces as hrefs, in one place.
 *
 * A detail route is opened from several screens — a channel from the Live grid
 * and from the guide, a movie from the Videos grid and from Home — and each
 * surface has to be able to name itself as well, since that is what a playback
 * session remembers as its launch origin. Building the pathname and encoding
 * what travels with it belongs here rather than in every caller.
 *
 * The sports surfaces have their own builders in `features/sports`, where the
 * fixture encoding lives (see `useSportsRoutes`).
 */

/** A live channel's detail surface. */
export function channelHref(playlistId: string, channel: Channel): Href {
  return {
    pathname: '/channel',
    params: { playlistId, channel: channelParam.encode(channel) },
  };
}

/** A movie's detail surface. */
export function movieHref(playlistId: string, movie: Channel): Href {
  return {
    pathname: '/movie',
    params: { playlistId, channel: channelParam.encode(movie) },
  };
}

/** A series' detail surface. */
export function seriesHref(playlistId: string, series: SeriesInfo): Href {
  return {
    pathname: '/series',
    params: { playlistId, series: seriesInfoParam.encode(series) },
  };
}

/**
 * The launch origin to record once a playback queue has stepped to `channel`.
 *
 * A session remembers the surface it was launched from so expanding the mini bar
 * puts that surface back underneath the player. Next/previous replaces what is
 * playing, so the remembered surface has to follow — otherwise expanding later
 * returns to the title the viewer first picked, which is no longer on screen.
 *
 * A live channel and a movie each have a sheet of their own. A series queue only
 * ever steps between episodes of the series whose sheet launched it, so
 * `launchOrigin` still describes what is playing and is kept: an episode carries
 * nothing to rebuild its series' sheet from.
 */
export function queueStepOrigin(
  contentType: ContentType,
  playlistId: string,
  channel: Channel,
  launchOrigin: Href | null,
): Href | null {
  switch (contentType) {
    case 'live':
      return channelHref(playlistId, channel);
    case 'movie':
      return movieHref(playlistId, channel);
    case 'series':
      return launchOrigin;
  }
}
