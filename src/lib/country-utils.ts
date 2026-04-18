import type { DropdownOption } from '@/components/ui/controls/inputs/dropdown';
import { Platform } from 'react-native';

export const COUNTRY_OPTIONS: DropdownOption<string>[] = [
  { label: 'Auto (device)', value: '' },
  { label: 'Norway', value: 'NO' },
  { label: 'United Kingdom', value: 'GB' },
  { label: 'United States', value: 'US' },
  { label: 'Germany', value: 'DE' },
  { label: 'Spain', value: 'ES' },
  { label: 'France', value: 'FR' },
  { label: 'Italy', value: 'IT' },
  { label: 'Netherlands', value: 'NL' },
  { label: 'Portugal', value: 'PT' },
  { label: 'Sweden', value: 'SE' },
  { label: 'Denmark', value: 'DK' },
  { label: 'Brazil', value: 'BR' },
  { label: 'Argentina', value: 'AR' },
  { label: 'Australia', value: 'AU' },
  { label: 'Canada', value: 'CA' },
  { label: 'Japan', value: 'JP' },
  { label: 'South Korea', value: 'KR' },
  { label: 'India', value: 'IN' },
  { label: 'Turkey', value: 'TR' },
  { label: 'Poland', value: 'PL' },
  { label: 'Belgium', value: 'BE' },
];

export const COUNTRY_NAMES: Record<string, string> = Object.fromEntries(
  COUNTRY_OPTIONS.filter((o) => o.value).map((o) => [o.value, o.label])
);

/** Get device country code from locale (e.g. "en-US" → "US", "nb-NO" → "NO") */
export function getDeviceCountry(): string {
  try {
    const locale = Platform.select({
      default: Intl.DateTimeFormat().resolvedOptions().locale,
    });
    if (locale) {
      const parts = locale.split('-');
      const country = parts.find((p) => p.length === 2 && p === p.toUpperCase());
      if (country) return country;
    }
  } catch { /* ignore */ }
  return 'US';
}

export function getEffectiveSportsCountry(sportsCountry?: string): string {
  return sportsCountry || getDeviceCountry();
}
