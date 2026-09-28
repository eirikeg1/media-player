import { useEffect } from 'react';

import type { TabKey } from '@/features/user/visible-tabs';

import { reportLandingReady } from './landing-readiness';

/**
 * Report `tab` ready the first time `isReady` is true.
 *
 * Every tab screen reports the same way — from a flag it already derives for
 * its own skeleton — and {@link reportLandingReady} is idempotent, so later
 * refreshes flipping the flag cost nothing.
 */
export function useReportLandingReady(tab: TabKey, isReady: boolean): void {
  useEffect(() => {
    if (isReady) reportLandingReady(tab);
  }, [tab, isReady]);
}
