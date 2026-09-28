import {
  COMPLETION_RATIO,
  RESUME_MIN_SECONDS,
  isCompleted,
  isInProgress,
} from '../viewing-progress';

describe('isInProgress', () => {
  it('ignores progress below the resume floor', () => {
    expect(isInProgress(0, 1000)).toBe(false);
    expect(isInProgress(RESUME_MIN_SECONDS - 1, 1000)).toBe(false);
  });

  it('resumes from the floor up to the completion ratio', () => {
    expect(isInProgress(RESUME_MIN_SECONDS, 1000)).toBe(true);
    expect(isInProgress(500, 1000)).toBe(true);
    expect(isInProgress(1000 * COMPLETION_RATIO - 1, 1000)).toBe(true);
  });

  it('treats reaching the completion ratio as finished', () => {
    expect(isInProgress(1000 * COMPLETION_RATIO, 1000)).toBe(false);
    expect(isInProgress(1000, 1000)).toBe(false);
  });

  it('counts real progress as resumable when the duration is unknown', () => {
    expect(isInProgress(120)).toBe(true);
    expect(isInProgress(120, null)).toBe(true);
    expect(isInProgress(120, 0)).toBe(true);
    expect(isInProgress(1, undefined)).toBe(false);
  });

  it('rejects a position that is not a number', () => {
    expect(isInProgress(Number.NaN, 1000)).toBe(false);
    expect(isInProgress(Number.POSITIVE_INFINITY, 1000)).toBe(false);
  });
});

describe('isCompleted', () => {
  it('needs a known duration to call something finished', () => {
    expect(isCompleted(5000)).toBe(false);
    expect(isCompleted(5000, 0)).toBe(false);
  });

  it('is true from the completion ratio on', () => {
    expect(isCompleted(899, 1000)).toBe(false);
    expect(isCompleted(900, 1000)).toBe(true);
    expect(isCompleted(1000, 1000)).toBe(true);
  });
});
