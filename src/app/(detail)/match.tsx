import { useLocalSearchParams } from 'expo-router';
import { useMemo } from 'react';

import { ErrorState } from '@/components/ui/display/state';
import { parseFixtureParam } from '@/features/sports/fixture-param';
import { MatchDetail } from '@/features/sports/match-detail/match-detail';
import { useRouteDismiss } from '@/hooks/use-route-dismiss';

/**
 * A match's detail surface. The fixture travels in the route parameters (see
 * `@/features/sports/fixture-param`) rather than being looked up again here:
 * the list that opened it already holds it, and a match the nightly prune has
 * dropped still opens for whoever is looking at it. Everything that changes —
 * the score, the minute — is re-resolved inside the surface.
 */
export default function MatchDetailRoute() {
  const params = useLocalSearchParams<{ fixture: string }>();
  const dismiss = useRouteDismiss('/sports');

  const fixture = useMemo(() => parseFixtureParam(params.fixture), [params.fixture]);

  if (!fixture) {
    return (
      <ErrorState
        title="Can't Open This Match"
        message="Its details couldn't be read. Go back and pick it again."
        onBack={dismiss}
      />
    );
  }

  return <MatchDetail fixture={fixture} onClose={dismiss} />;
}
