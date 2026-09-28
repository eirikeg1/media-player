import { useEffect, useRef, useState } from 'react';
import { EpgService } from '@/services/epg-service';
import type { EpgProgramme } from 'expo-m3u-parser';

interface UseChannelScheduleReturn {
  schedule: EpgProgramme[];
  isLoading: boolean;
  selectedDate: Date;
  setSelectedDate: (date: Date) => void;
}

/**
 * Gets the start of a given day in Unix seconds (local timezone).
 */
function startOfDay(date: Date): number {
  const d = new Date(date);
  d.setHours(0, 0, 0, 0);
  return Math.floor(d.getTime() / 1000);
}

/**
 * Gets the end of a given day in Unix seconds (local timezone).
 */
function endOfDay(date: Date): number {
  const d = new Date(date);
  d.setHours(23, 59, 59, 999);
  return Math.floor(d.getTime() / 1000);
}

/**
 * Loads the EPG schedule for a single channel, with date navigation
 * (prev/next day).
 *
 * Mounting is the enablement: the detail surface is a route of its own now, so
 * the hook only runs while that surface is on screen — it no longer has to be
 * told whether a modal holding it is open.
 */
export function useChannelSchedule(channelId: string | null): UseChannelScheduleReturn {
  const [schedule, setSchedule] = useState<EpgProgramme[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [selectedDate, setSelectedDate] = useState(() => new Date());
  const isMountedRef = useRef(true);

  useEffect(() => {
    isMountedRef.current = true;
    return () => {
      isMountedRef.current = false;
    };
  }, []);

  // Reset date when channel changes
  useEffect(() => {
    setSelectedDate(new Date());
    setSchedule([]);
  }, [channelId]);

  useEffect(() => {
    if (!channelId) {
      setSchedule([]);
      return;
    }

    let cancelled = false;
    setIsLoading(true);

    const from = startOfDay(selectedDate);
    const to = endOfDay(selectedDate);

    EpgService.getChannelSchedule(channelId, from, to)
      .then((result) => {
        if (!cancelled && isMountedRef.current) {
          setSchedule(result);
        }
      })
      .catch((err) => {
        if (!cancelled && isMountedRef.current) {
          if (__DEV__) {
            console.warn('[useChannelSchedule] Error:', err);
          }
          setSchedule([]);
        }
      })
      .finally(() => {
        if (!cancelled && isMountedRef.current) {
          setIsLoading(false);
        }
      });

    return () => {
      cancelled = true;
    };
  }, [channelId, selectedDate]);

  return { schedule, isLoading, selectedDate, setSelectedDate };
}
