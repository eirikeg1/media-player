import { Dropdown } from '@/components/ui/controls/inputs/dropdown';
import { saveSetting } from '@/features/user/save-setting';
import { COUNTRY_OPTIONS } from '@/lib/country-utils';
import { useUserStore } from '@/stores/user/user-store';
import { memo, useCallback } from 'react';

interface SportsCountryPickerProps {
  /** Spoken label; the two hosts describe the same setting differently. */
  accessibilityLabel: string;
}

/**
 * The "which country's broadcasters" setting, wherever it is offered.
 *
 * It appears both in Settings → Sports and on a match's Watch tab, and the two
 * write the same user setting: a second copy of the options list and the save
 * call is a second place for them to disagree about what the empty value means.
 */
export const SportsCountryPicker = memo(function SportsCountryPicker({
  accessibilityLabel,
}: SportsCountryPickerProps) {
  // Primitive selector: the user object is replaced on every settings write.
  const sportsCountry = useUserStore((s) => s.currentUser?.settings?.sportsCountry ?? '');

  // Empty means "follow the device", which is the absence of the setting rather
  // than a country code of its own.
  const handleChange = useCallback((value: string) => {
    void saveSetting({ sportsCountry: value || undefined }, 'TV country');
  }, []);

  return (
    <Dropdown<string>
      label="Country"
      options={COUNTRY_OPTIONS}
      value={sportsCountry}
      onSelect={handleChange}
      accessibilityLabel={accessibilityLabel}
    />
  );
});
