# Catch-up TV

Watching a football match from its start after kickoff, played out of the
panel's own recording rather than the live edge. Reachable today from a match's
**Watch** tab in the sports tab; the live EPG programme list is the planned
follow-up.

## What the panel provides

Only Xtream Codes panels expose an addressable archive, and only for the
channels they choose to record:

- `get_live_streams` returns `tv_archive` (0/1) and `tv_archive_duration` — the
  number of days of archive kept for that channel. The import stores the
  duration on the channel as `catchup_days`, and `RankedBroadcast.catchupDays`
  carries it to the app (absent = no archive).
- `get_server_info` returns `server_info.timezone`. The window timestamp in the
  URL is wall-clock in the *panel's* timezone, not the device's or UTC, so the
  Rust side formats it against that zone.

The URL shape is

```
{base}/timeshift/{user}/{pass}/{minutes}/{YYYY-MM-DD:HH-MM}/{stream_id}.ts
```

built by `m3u-ffi`'s `catchup.rs` and reached through
`Database.getCatchupStreamUrl(playlistId, channelId, startUnix, durationMinutes)`,
which resolves to `null` for a non-Xtream playlist, an unknown channel, or a
channel with no archive. It serves a finite MPEG-TS stream, so `expo-video`
reports it as non-live and the normal seek bar appears by itself.

## The window

A match maps to one window (`src/features/sports/catchup.ts`):

- **start** = kickoff − 5 minutes, so the build-up and the whistle are included.
- **length** = 150 minutes — 90 plus half time, stoppage and a short post-match.

Panels serve windows that extend past "now", so the same window works for an
in-progress match: it is literally "watch from kickoff".

## Qualification

A listed channel can offer catch-up only when all of these hold (`now` is read
once per render — the rules only change on the minute scale, so no timer):

1. `broadcast.catchupDays != null` — the panel records that channel.
2. `fixture.kickoffTime <= now` — there is something recorded to play.
3. `windowStart >= now − catchupDays · 86400` — the window has not aged out of
   retention.

When nothing qualifies the Catch-up segment is disabled with a one-line reason:
"Match hasn't started yet" when the match is the blocker, otherwise "No channel
has this match in its archive". The sheet opens on Catch-up when the match is
concluded and something qualifies, and on Live otherwise.

## Playback

`/video-player` takes two extra route params, `catchupStart` (unix seconds) and
`catchupDuration` (minutes). The screen resolves them to an archive URL through
`RustChannelService.getCatchupStreamUrl` and hands it to the session as
`streamUrl`; a `null` result renders the "Catch-up unavailable" layout instead
of starting a session.

**The session keeps the catalog channel.** `PlaybackSession.channel` is the
channel as the playlist lists it — its id keys viewing history, resume
positions, favorites and the route params that re-open the screen from the mini
bar. Only `streamUrl` (and `catchup`) differ, so none of that bookkeeping has to
learn about archives. `sessionMatches` compares the window as well, so live and
catch-up on the same channel are different sessions, and the history tracker is
keyed on the window so each gets its own history entry.

Casting works the same way: `useCastPlayback` casts `streamUrl`, and
`parseXtreamUrl` recognises the timeshift shape so the receiver still gets the
`.m3u8` variant when the panel allows HLS output.

## Seeking

The archive is a progressive MPEG-TS file: the panel serves it with
`Content-Length` and `Accept-Ranges`, and answers byte-range requests with
`206`. ExoPlayer therefore reports a known duration and no live edge, so the
local seek bar appears without anything catch-up-specific.

Casting gets the same bar. `useCastPlayback` takes an `isCatchup` flag from the
session (`session.catchup != null`) and loads the window as
`MediaStreamType.BUFFERED` instead of `LIVE`, so the receiver seeks it; the bar
is driven by the receiver's own timeline (`mediaStatus.streamPosition` and
`mediaInfo.streamDuration`) and drags call `client.seek`. A live cast reports no
duration, so it keeps the resync button and no bar. `isSessionLive` in the
player component is `contentType === 'live' && catchup == null` for the same
reason — a window on a live channel is not live.

**The recording edge hands over to live.** The panel fixes the file's length
when the request is made, so a window over a match still in play ends where the
recording had got to, not at the final whistle. On `playToEnd` the screen
`router.replace`s itself with the same channel/playlist/fixture params and no
catch-up params, which resolves `channel.url` and starts a live session through
the normal path (`shouldHandOverToLive` in `src/features/sports/catchup.ts`). A
concluded match — or a stream with no fixture — ends normally instead.

## Known limitations

- Panels advertise archive per channel, not per programme. A channel can report
  `tv_archive_duration` and still serve an empty or broken window — the player's
  normal error/retry path handles that; there is nothing to check up front.
- Only the Xtream `timeshift` mode is supported. M3U `catchup="append"`,
  `catchup="shift"` and the `catchup-source` template modes are not implemented,
  so a playlist using those offers no catch-up even where the tag is present.
