import type { SeriesInfo } from 'expo-m3u-parser';
import type { Href } from 'expo-router';

import type { Channel } from '@/types/playlist.types';
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
