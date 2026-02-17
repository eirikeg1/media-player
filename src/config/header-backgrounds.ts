export type PageId = 'home' | 'live' | 'movies' | 'series' | 'settings';

export interface HeaderTemplate {
  key: string;
  label: string;
  source: number; // require() result
}

/**
 * All static require() calls in one place.
 * React Native requires static paths for bundled images.
 */
const IMAGES = {
  // General
  'blue-wavy': require('../../assets/images/parallax-headers/general/blue-minimalist-wavy.jpg'),
  'blue-leafs': require('../../assets/images/parallax-headers/general/blue-minimalist-flowing-leafs.jpg'),
  'blue-zigzag': require('../../assets/images/parallax-headers/general/blue-zigzag-wave.webp'),
  'green-abstract': require('../../assets/images/parallax-headers/general/green-paper-cut-abstract.jpg'),
  'red-wavy': require('../../assets/images/parallax-headers/general/red-minimalist-wavy.avif'),
  // Home
  'rick-morty-portal': require('../../assets/images/parallax-headers/home/rick-and-morty-portal.jpg'),
  // Live
  'champions-league': require('../../assets/images/parallax-headers/live/header-champions-league.jpg'),
  // Movies / Series
  'breaking-bad': require('../../assets/images/parallax-headers/movies/breaking-bad-wallpaper.jpg'),
  'game-of-thrones': require('../../assets/images/parallax-headers/movies/game-of-thrones.jpg'),
  'jack-sparrow': require('../../assets/images/parallax-headers/movies/jack-sparrow.jpg'),
  'last-of-us': require('../../assets/images/parallax-headers/movies/last-of-us.jpg'),
  'lost': require('../../assets/images/parallax-headers/movies/lost.jpg'),
  'rick-morty-colorful': require('../../assets/images/parallax-headers/movies/rick-and-morty-colorful.jpg'),
  'rick-morty': require('../../assets/images/parallax-headers/movies/rick-and-morty.jpg'),
  'wolf-of-wall-street': require('../../assets/images/parallax-headers/movies/wolf-of-wall-street.jpg'),
} as const;

/** All templates keyed by image key for quick lookup */
const ALL_TEMPLATES: Record<string, HeaderTemplate> = {
  'blue-wavy': { key: 'blue-wavy', label: 'Blue Wavy', source: IMAGES['blue-wavy'] },
  'blue-leafs': { key: 'blue-leafs', label: 'Blue Leafs', source: IMAGES['blue-leafs'] },
  'blue-zigzag': { key: 'blue-zigzag', label: 'Blue Zigzag', source: IMAGES['blue-zigzag'] },
  'green-abstract': { key: 'green-abstract', label: 'Green Abstract', source: IMAGES['green-abstract'] },
  'red-wavy': { key: 'red-wavy', label: 'Red Wavy', source: IMAGES['red-wavy'] },
  'rick-morty-portal': { key: 'rick-morty-portal', label: 'Rick & Morty Portal', source: IMAGES['rick-morty-portal'] },
  'champions-league': { key: 'champions-league', label: 'Champions League', source: IMAGES['champions-league'] },
  'breaking-bad': { key: 'breaking-bad', label: 'Breaking Bad', source: IMAGES['breaking-bad'] },
  'game-of-thrones': { key: 'game-of-thrones', label: 'Game of Thrones', source: IMAGES['game-of-thrones'] },
  'jack-sparrow': { key: 'jack-sparrow', label: 'Jack Sparrow', source: IMAGES['jack-sparrow'] },
  'last-of-us': { key: 'last-of-us', label: 'The Last of Us', source: IMAGES['last-of-us'] },
  'lost': { key: 'lost', label: 'Lost', source: IMAGES['lost'] },
  'rick-morty-colorful': { key: 'rick-morty-colorful', label: 'Rick & Morty Colorful', source: IMAGES['rick-morty-colorful'] },
  'rick-morty': { key: 'rick-morty', label: 'Rick & Morty', source: IMAGES['rick-morty'] },
  'wolf-of-wall-street': { key: 'wolf-of-wall-street', label: 'Wolf of Wall Street', source: IMAGES['wolf-of-wall-street'] },
};

/** General templates shown for every page */
const GENERAL_TEMPLATES: HeaderTemplate[] = [
  ALL_TEMPLATES['blue-wavy'],
  ALL_TEMPLATES['blue-leafs'],
  ALL_TEMPLATES['blue-zigzag'],
  ALL_TEMPLATES['green-abstract'],
  ALL_TEMPLATES['red-wavy'],
];

/** Templates available per page (page-specific + general) */
export const HEADER_TEMPLATES: Record<PageId, HeaderTemplate[]> = {
  home: [
    ALL_TEMPLATES['rick-morty-portal'],
    ...GENERAL_TEMPLATES,
  ],
  live: [
    ALL_TEMPLATES['champions-league'],
    ...GENERAL_TEMPLATES,
  ],
  movies: [
    ALL_TEMPLATES['breaking-bad'],
    ALL_TEMPLATES['game-of-thrones'],
    ALL_TEMPLATES['jack-sparrow'],
    ALL_TEMPLATES['last-of-us'],
    ALL_TEMPLATES['lost'],
    ALL_TEMPLATES['rick-morty-colorful'],
    ALL_TEMPLATES['rick-morty'],
    ALL_TEMPLATES['wolf-of-wall-street'],
    ...GENERAL_TEMPLATES,
  ],
  series: [
    ALL_TEMPLATES['breaking-bad'],
    ALL_TEMPLATES['game-of-thrones'],
    ALL_TEMPLATES['last-of-us'],
    ALL_TEMPLATES['lost'],
    ALL_TEMPLATES['rick-morty-colorful'],
    ALL_TEMPLATES['rick-morty'],
    ...GENERAL_TEMPLATES,
  ],
  settings: [
    ...GENERAL_TEMPLATES,
  ],
};

/** Default template key per page (matches current hardcoded images) */
export const DEFAULT_BACKGROUNDS: Record<PageId, string> = {
  home: 'blue-wavy',
  live: 'champions-league',
  movies: 'green-abstract',
  series: 'green-abstract',
  settings: '', // no image by default (keeps gear icon)
};

/** Resolve a template key to its require() source */
export function getTemplateSource(key: string): number | null {
  return ALL_TEMPLATES[key]?.source ?? null;
}
