import { useLocalSearchParams } from 'expo-router';
import { useMemo } from 'react';

import { ErrorState } from '@/components/ui/display/state';
import { SeriesDetail } from '@/features/videos/series-detail';
import { useRouteDismiss } from '@/hooks/use-route-dismiss';
import { seriesInfoParam } from '@/lib/route-params';

/**
 * A series' detail surface. The catalogue entry travels in the route parameters
 * (see `@/lib/route-params`); the episodes are fetched here, as they always
 * were, because the launching grid never holds them.
 */
export default function SeriesDetailRoute() {
  const params = useLocalSearchParams<{ playlistId: string; series: string }>();
  const dismiss = useRouteDismiss('/videos');

  const series = useMemo(() => seriesInfoParam.decode(params.series), [params.series]);

  // Both halves are needed: without a playlist there are no episodes to list.
  if (!series || !params.playlistId) {
    return (
      <ErrorState
        title="Can't Open This Series"
        message="Its details couldn't be read. Go back and pick it again."
        onBack={dismiss}
      />
    );
  }

  return <SeriesDetail series={series} playlistId={params.playlistId} onClose={dismiss} />;
}
