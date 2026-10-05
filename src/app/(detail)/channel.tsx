import { useLocalSearchParams } from 'expo-router';
import { useMemo } from 'react';

import { ErrorState } from '@/components/ui/display/state';
import { ChannelDetail } from '@/features/live/channel-detail';
import { useRouteDismiss } from '@/hooks/use-route-dismiss';
import { channelParam } from '@/lib/route-params';

/**
 * A live channel's detail surface. The channel itself travels in the route
 * parameters (see `@/lib/route-params`) rather than being looked up again here,
 * so opening one costs no round-trip and a channel the provider has since
 * dropped still opens for whoever is holding it on screen.
 *
 * The queue the player navigates with does not travel with it: a live playlist
 * is thousands of rows, far too many for a search parameter. The screen that
 * opened this route stages the queue instead (`stageQueue`), and the hand-over
 * survives the hop because only the player's `startSession` consumes it.
 */
export default function ChannelDetailRoute() {
  const params = useLocalSearchParams<{ playlistId: string; channel: string }>();
  const dismiss = useRouteDismiss('/live');

  const channel = useMemo(() => channelParam.decode(params.channel), [params.channel]);

  // Both halves are needed: without a playlist there is nothing to play
  // against.
  if (!channel || !params.playlistId) {
    return (
      <ErrorState
        title="Can't Open This Channel"
        message="Its details couldn't be read. Go back and pick it again."
        onBack={dismiss}
      />
    );
  }

  return <ChannelDetail channel={channel} playlistId={params.playlistId} onClose={dismiss} />;
}
