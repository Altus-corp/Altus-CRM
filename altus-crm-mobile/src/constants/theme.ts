/**
 * Altus CRM brand palette — ported 1:1 from the web app's design tokens
 * (app/crm/crm.css's `.crm2{...}` block: --red/--ink/--muted/--line/--bg/--card/--r/--sh).
 * The web CRM has no dark mode, so this app doesn't follow the device's dark/light setting
 * either — "dark" below is identical to "light" so existing ThemedView/ThemedText callers that
 * pass a `type`/`themeColor` keep working unchanged, regardless of device scheme.
 */

import '@/global.css';

import { Platform } from 'react-native';

const palette = {
  text: '#141414', // --ink
  ink2: '#3B3B3B', // --ink-2 (secondary headings)
  textSecondary: '#6B7280', // --muted
  faint: '#9CA3AF', // --faint
  background: '#F6F6F7', // --bg (page background)
  card: '#FFFFFF', // --card (surfaces)
  backgroundElement: '#F0F0F2', // --line-2 (hover / subtle fill)
  backgroundSelected: '#FDECEF', // --red-50 (selected / active state)
  border: '#E7E7EA', // --line
  accent: '#C8102E', // --red
  accentDark: '#A00D25', // --red-d
  accentTint: '#FDECEF', // --red-50
  accentTint2: '#F9D3DA', // --red-100
} as const;

export const Colors = { light: palette, dark: palette } as const;

export type ThemeColor = keyof typeof Colors.light & keyof typeof Colors.dark;

/** Priority-stage (bucket) colors — ported from app/lib/crm2/config.ts's TONES/BUCKETS. */
export const BucketTone = {
  closing: { bg: '#E4F4EC', border: '#C4E6D4', ink: '#1D6146', mark: '#3FA77A', label: 'Closing' },
  negotiation: { bg: '#FCF5D9', border: '#F1E3A6', ink: '#6E5604', mark: '#C9A227', label: 'Negotiation' },
  followup: { bg: '#FDEEE4', border: '#F7D6C0', ink: '#8A4317', mark: '#E08A4F', label: 'Follow-up' },
  approach: { bg: '#E8F2FB', border: '#CDE1F4', ink: '#1F4F7A', mark: '#4F93D2', label: 'Approach' },
  new: { bg: '#F1EDFB', border: '#DCD3F4', ink: '#4B3A8F', mark: '#7E6BC9', label: 'New' },
  lost: { bg: '#FBE8EC', border: '#F3CCD5', ink: '#8E2A40', mark: '#D9677E', label: 'Lost' },
} as const;

/** BANT value colors — ported from app/lib/bant.ts's BANT_TONE. */
export const BantTone: Record<string, { bg: string; ink: string }> = {
  Assumed: { bg: '#FCF5D9', ink: '#6E5604' },
  'Not Known': { bg: '#F1F1F1', ink: '#475569' },
  Confirmed: { bg: '#DCFCE7', ink: '#065F46' },
  High: { bg: '#DCFCE7', ink: '#065F46' },
};

export const Radius = { card: 10, small: 7, pill: 999 } as const;
export const CardShadow = {
  shadowColor: '#101014',
  shadowOffset: { width: 0, height: 1 },
  shadowOpacity: 0.06,
  shadowRadius: 2,
  elevation: 1,
} as const;

export const Fonts = Platform.select({
  ios: {
    /** iOS `UIFontDescriptorSystemDesignDefault` */
    sans: 'system-ui',
    /** iOS `UIFontDescriptorSystemDesignSerif` */
    serif: 'ui-serif',
    /** iOS `UIFontDescriptorSystemDesignRounded` */
    rounded: 'ui-rounded',
    /** iOS `UIFontDescriptorSystemDesignMonospaced` */
    mono: 'ui-monospace',
  },
  default: {
    sans: 'normal',
    serif: 'serif',
    rounded: 'normal',
    mono: 'monospace',
  },
  web: {
    sans: 'var(--font-display)',
    serif: 'var(--font-serif)',
    rounded: 'var(--font-rounded)',
    mono: 'var(--font-mono)',
  },
});

export const Spacing = {
  half: 2,
  one: 4,
  two: 8,
  three: 16,
  four: 24,
  five: 32,
  six: 64,
} as const;

export const BottomTabInset = Platform.select({ ios: 50, android: 80 }) ?? 0;
export const MaxContentWidth = 800;
