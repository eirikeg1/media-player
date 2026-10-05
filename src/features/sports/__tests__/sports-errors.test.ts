import { M3uParserError } from '@/test/fakes/m3u-database-fake';

import { sportsErrorMessage } from '../sports-errors';

const FALLBACK = "Couldn't load matches.";
const RATE_LIMITED = 'The score provider is rate-limiting — try again shortly.';
const BLOCKED = 'The score provider is refusing requests right now — try again later.';
const OFFLINE = 'No connection to the score provider.';

describe('sportsErrorMessage', () => {
  it('classifies a plain object carrying a code', () => {
    // A rejection that crossed the bridge is a CodedException, not necessarily
    // an instance of anything this side recognises.
    expect(sportsErrorMessage({ code: 'RATE_LIMITED', message: 'slow down' }, FALLBACK)).toBe(
      RATE_LIMITED
    );
  });

  it('classifies an Error carrying a code', () => {
    const err = Object.assign(new Error('no route to host'), { code: 'NETWORK' });
    expect(sportsErrorMessage(err, FALLBACK)).toBe(OFFLINE);
  });

  it('classifies the module error class', () => {
    expect(sportsErrorMessage(new M3uParserError('403', 'BLOCKED'), FALLBACK)).toBe(BLOCKED);
  });

  it('names a blocked provider differently from a throttled one', () => {
    // A 403 is not a 429: "try again shortly" is the wrong advice, and telling
    // the two apart is the whole reason BLOCKED exists.
    expect(BLOCKED).not.toBe(RATE_LIMITED);
    expect(sportsErrorMessage({ code: 'BLOCKED' }, FALLBACK)).toBe(BLOCKED);
  });

  it('prefers the code over text that looks like another failure', () => {
    // The message says "rate limit" but the backend classified it as a database
    // failure — the code is what the backend actually decided.
    const err = Object.assign(new Error('rate limit table is locked'), { code: 'DATABASE' });
    expect(sportsErrorMessage(err, FALLBACK)).toBe(FALLBACK);
  });

  it('falls back for a code with no copy of its own', () => {
    expect(sportsErrorMessage({ code: 'INTERNAL' }, FALLBACK)).toBe(FALLBACK);
  });

  it('reads the text when nothing carried a code', () => {
    expect(sportsErrorMessage(new Error('HTTP 429 from provider'), FALLBACK)).toBe(RATE_LIMITED);
    expect(sportsErrorMessage(new Error('connect ETIMEDOUT'), FALLBACK)).toBe(OFFLINE);
  });

  it('falls back for anything it cannot classify', () => {
    expect(sportsErrorMessage(new Error('something odd'), FALLBACK)).toBe(FALLBACK);
    expect(sportsErrorMessage(null, FALLBACK)).toBe(FALLBACK);
    expect(sportsErrorMessage('a bare string', FALLBACK)).toBe(FALLBACK);
  });
});
