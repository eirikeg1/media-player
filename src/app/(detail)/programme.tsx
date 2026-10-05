import { useLocalSearchParams } from 'expo-router';
import { useMemo } from 'react';

import { ErrorState } from '@/components/ui/display/state';
import { EpgProgrammeDetail } from '@/features/live/guide/epg-programme-detail';
import { useRouteDismiss } from '@/hooks/use-route-dismiss';
import { channelParam, epgProgrammeParam } from '@/lib/route-params';

/**
 * A guide programme's detail surface. The programme travels in the route
 * parameters (see `@/lib/route-params`), as does the channel it airs on when
 * the guide knew it — a programme whose channel the guide has not loaded is
 * still worth reading, it just has nothing to watch.
 */
export default function ProgrammeDetailRoute() {
  const params = useLocalSearchParams<{
    playlistId: string;
    programme: string;
    channel?: string;
  }>();
  const dismiss = useRouteDismiss('/live');

  const programme = useMemo(
    () => epgProgrammeParam.decode(params.programme),
    [params.programme]
  );
  const channel = useMemo(() => channelParam.decode(params.channel), [params.channel]);

  // Both halves are needed: without a playlist there is no channel to resolve
  // this programme against.
  if (!programme || !params.playlistId) {
    return (
      <ErrorState
        title="Can't Open This Programme"
        message="Its details couldn't be read. Go back and pick it again."
        onBack={dismiss}
      />
    );
  }

  return (
    <EpgProgrammeDetail
      programme={programme}
      playlistId={params.playlistId}
      channel={channel}
      onClose={dismiss}
    />
  );
}
