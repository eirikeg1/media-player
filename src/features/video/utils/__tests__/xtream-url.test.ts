import { parseXtreamUrl } from '../xtream-url';

describe('parseXtreamUrl', () => {
  it('parses a live stream URL and derives its HLS variant', () => {
    expect(parseXtreamUrl('http://panel.example.com:8080/user/pass/4242')).toEqual({
      serverUrl: 'http://panel.example.com:8080',
      username: 'user',
      password: 'pass',
      hlsUrl: 'http://panel.example.com:8080/live/user/pass/4242.m3u8',
    });
  });

  it('parses a catch-up (timeshift) URL and keeps its window in the HLS variant', () => {
    expect(
      parseXtreamUrl('http://panel.example.com:8080/timeshift/user/pass/150/2026-06-13:15-25/4242.ts')
    ).toEqual({
      serverUrl: 'http://panel.example.com:8080',
      username: 'user',
      password: 'pass',
      hlsUrl: 'http://panel.example.com:8080/timeshift/user/pass/150/2026-06-13:15-25/4242.m3u8',
    });
  });

  it('keeps percent-encoded credentials as the panel wrote them', () => {
    expect(
      parseXtreamUrl('http://host:8080/timeshift/us%20er/pa%2Fss/60/2026-06-13:13-30/7.ts')?.hlsUrl
    ).toBe('http://host:8080/timeshift/us%20er/pa%2Fss/60/2026-06-13:13-30/7.m3u8');
  });

  it('rejects URLs that are not one of the two Xtream shapes', () => {
    // VOD (the last live segment would carry a file extension)
    expect(parseXtreamUrl('http://panel.example.com:8080/movie/user/pass/99.mkv')).toBeNull();
    expect(parseXtreamUrl('http://panel.example.com:8080/user/pass/4242.ts')).toBeNull();
    expect(parseXtreamUrl('https://cdn.example.com/live/stream.m3u8')).toBeNull();
    expect(parseXtreamUrl('http://host:8080/timeshift/user/pass/60/7.ts')).toBeNull();
    expect(parseXtreamUrl('not a url')).toBeNull();
  });
});
