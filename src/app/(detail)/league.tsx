import { useLocalSearchParams } from 'expo-router';
import { useMemo } from 'react';

import { ErrorState } from '@/components/ui/display/state';
import { LeagueDetail } from '@/features/sports/league-detail';
import { useRouteDismiss } from '@/hooks/use-route-dismiss';
import { leagueRefParam } from '@/lib/route-params';

/**
 * A competition's detail surface. What travels is the competition itself plus
 * the day it was opened from: enough to render the header at once, and enough
 * for the surface to re-resolve that day's fixtures for itself rather than
 * freeze at the snapshot the list held when it was pressed.
 */
export default function LeagueDetailRoute() {
  const params = useLocalSearchParams<{ league: string }>();
  const dismiss = useRouteDismiss('/sports');

  const league = useMemo(() => leagueRefParam.decode(params.league), [params.league]);

  if (!league) {
    return (
      <ErrorState
        title="Can't Open This Competition"
        message="Its details couldn't be read. Go back and pick it again."
        onBack={dismiss}
      />
    );
  }

  return <LeagueDetail league={league} onClose={dismiss} />;
}
