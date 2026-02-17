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
 * Lazy-loads the EPG schedule for a single channel when the modal is open.
 * Supports date navigation (prev/next day).
 */
export function useChannelSchedule(
  channelId: string | null,
  enabled: boolean
): UseChannelScheduleReturn {
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
    if (!enabled || !channelId) {
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
  }, [enabled, channelId, selectedDate]);

  return { schedule, isLoading, selectedDate, setSelectedDate };
}
