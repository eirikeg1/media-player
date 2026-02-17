import { useMemo } from 'react';
import { getTemplateSource, type PageId } from '@/config/header-backgrounds';
import { useHeaderBackgroundStore } from '@/stores/header-background';

/**
 * Returns the user-selected header background image source for a page,
 * or null if the user hasn't customized it (page should use its default).
 *
 * The returned value can be passed directly to expo-image's `source` prop.
 *
 * Selects only primitives from the store so Zustand's Object.is comparison
 * works correctly, then derives the image source object via useMemo.
 */
export function useHeaderBackground(pageId: PageId): number | { uri: string } | null {
  const selectionType = useHeaderBackgroundStore((s) => s.selections[pageId]?.type);
  const selectionValue = useHeaderBackgroundStore((s) => s.selections[pageId]?.value);
  const uploadedUri = useHeaderBackgroundStore((s) =>
    selectionType === 'uploaded' && selectionValue
      ? s.uploadedUris[selectionValue]
      : undefined
  );

  return useMemo(() => {
    if (!selectionType || !selectionValue) return null;
    if (selectionType === 'template') return getTemplateSource(selectionValue) ?? null;
    return uploadedUri ? { uri: uploadedUri } : null;
  }, [selectionType, selectionValue, uploadedUri]);
}
