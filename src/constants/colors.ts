// ============================================================
// TORVUS — Design Tokens
// src/constants/colors.ts
//
// Single source of truth for all app colors.
// Import from '@/constants/colors' in new screens.
// ============================================================

export const Colors = {
  // Backgrounds
  bg:       '#0E0D0B',
  bg2:      '#141311',
  bg3:      '#181714',

  // Borders
  border1:  '#1E1D1A',
  border2:  '#252320',
  border3:  '#2A2926',

  // Text
  text:     '#F2F0EB',
  textMid:  '#888',
  textDim:  '#555',
  textFaint:'#3A3835',

  // Accent
  accent:   '#EF6C3E',
  accentDim:'#EF6C3E22',

  // Semantic
  error:    '#EF3E3E',
} as const;

// Platform header padding (Android needs extra room for status bar)
export const HEADER_PADDING_TOP = { ios: 8, android: 16 } as const;
