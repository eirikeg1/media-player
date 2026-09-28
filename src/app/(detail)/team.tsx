import { useLocalSearchParams } from 'expo-router';
import { useMemo } from 'react';

import { ErrorState } from '@/components/ui/display/state';
import { TeamDetail } from '@/features/sports/team-detail';
import { useRouteDismiss } from '@/hooks/use-route-dismiss';
import { teamRefParam } from '@/lib/route-params';

/**
 * A team's detail surface. The side travels in the route parameters as the
 * match that opened it knew it — the provider's id, the name and the crest —
 * which is all the header needs while the schedule below it is fetched.
 */
export default function TeamDetailRoute() {
  const params = useLocalSearchParams<{ team: string }>();
  const dismiss = useRouteDismiss('/sports');

  const team = useMemo(() => teamRefParam.decode(params.team), [params.team]);

  if (!team) {
    return (
      <ErrorState
        title="Can't Open This Team"
        message="Its details couldn't be read. Go back and pick it again."
        onBack={dismiss}
      />
    );
  }

  return <TeamDetail team={team} onClose={dismiss} />;
}
