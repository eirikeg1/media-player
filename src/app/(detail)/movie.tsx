import { useLocalSearchParams } from 'expo-router';
import { useMemo } from 'react';

import { ErrorState } from '@/components/ui/display/state';
import { MovieDetail } from '@/features/videos/movie-detail';
import { useRouteDismiss } from '@/hooks/use-route-dismiss';
import { channelParam } from '@/lib/route-params';

/**
 * A movie's detail surface. The movie itself travels in the route parameters
 * (see `@/lib/route-params`) rather than being looked up again here, so opening
 * one costs no round-trip and a title the provider has since dropped still
 * opens for whoever is holding it on screen.
 */
export default function MovieDetailRoute() {
  const params = useLocalSearchParams<{ playlistId: string; channel: string }>();
  const dismiss = useRouteDismiss('/videos');

  const movie = useMemo(() => channelParam.decode(params.channel), [params.channel]);

  // Both halves are needed: without a playlist there is nothing to fetch
  // metadata from or play against.
  if (!movie || !params.playlistId) {
    return (
      <ErrorState
        title="Can't Open This Movie"
        message="Its details couldn't be read. Go back and pick it again."
        onBack={dismiss}
      />
    );
  }

  return <MovieDetail movie={movie} playlistId={params.playlistId} onClose={dismiss} />;
}
