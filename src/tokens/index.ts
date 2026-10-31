/**
 * Aegisyn AI - Midnight Sonar Design Tokens & Type Definitions
 * Strict design parity with specifications
 */

export const colors = {
  // Backgrounds & Surfaces
  abyssBlack: '#071013',      // Main background
  deepPetrol: '#0D2023',      // Secondary background / card surfaces
  graphiteTeal: '#142B2D',    // Panel surface & borders

  // Accents
  sonarMint: '#58D5B1',       // Primary accent / scan beam / normal telemetry
  paleAqua: '#A4E8D5',        // Secondary accent / highlights

  // Risk Classification
  lowRisk: '#53C6A5',         // Low risk / Soft Teal
  softTeal: '#53C6A5',
  mediumRisk: '#EAB65B',      // Medium risk / Amber
  amber: '#EAB65B',
  highRisk: '#F18A50',        // High risk / Signal Orange
  signalOrange: '#F18A50',
  criticalRisk: '#F45B69',    // Critical risk / Alert Coral
  alertCoral: '#F45B69',

  // Typography
  arcticWhite: '#EAF4F0',     // Primary text
  mutedSteel: '#8EA5A3',      // Secondary text / technical labels

  // Operational Overlays
  gridLine: 'rgba(88, 213, 177, 0.12)',
  gridLineSubtle: 'rgba(88, 213, 177, 0.05)',
  radarGlow: 'rgba(88, 213, 177, 0.15)',
  cardBorder: 'rgba(88, 213, 177, 0.18)',
  cardBorderActive: 'rgba(88, 213, 177, 0.45)',
} as const;

export type ColorToken = keyof typeof colors;

export const spacing = {
  0: '0px',
  1: '4px',    // Exception for micro-badges / borders
  2: '8px',    // 8pt grid base
  3: '12px',   // Exception for compact tag padding
  4: '16px',   // 2 * 8pt
  5: '20px',
  6: '24px',   // 3 * 8pt
  8: '32px',   // 4 * 8pt
  10: '40px',  // 5 * 8pt
  12: '48px',  // 6 * 8pt
  16: '64px',  // 8 * 8pt
  20: '80px',  // 10 * 8pt
} as const;

export type SpacingToken = keyof typeof spacing;

export const radii = {
  none: '0px',
  sm: '4px',
  md: '8px',
  lg: '12px',
  xl: '16px',
  full: '9999px',
} as const;

export type RadiusToken = keyof typeof radii;

export const typography = {
  fontFamily: {
    heading: 'var(--font-space-grotesk), "Space Grotesk", sans-serif',
    body: 'var(--font-inter), "Inter", sans-serif',
    mono: 'var(--font-jetbrains-mono), "JetBrains Mono", monospace',
  },
  fontSize: {
    xs: ['11px', { lineHeight: '16px', letterSpacing: '0.04em' }],
    sm: ['12px', { lineHeight: '18px', letterSpacing: '0.02em' }],
    base: ['14px', { lineHeight: '20px', letterSpacing: '0em' }],
    md: ['16px', { lineHeight: '24px', letterSpacing: '-0.01em' }],
    lg: ['18px', { lineHeight: '26px', letterSpacing: '-0.01em' }],
    xl: ['20px', { lineHeight: '28px', letterSpacing: '-0.02em' }],
    '2xl': ['24px', { lineHeight: '32px', letterSpacing: '-0.02em' }],
    '3xl': ['30px', { lineHeight: '36px', letterSpacing: '-0.03em' }],
    '4xl': ['36px', { lineHeight: '42px', letterSpacing: '-0.03em' }],
  },
} as const;

export const motion = {
  duration: {
    instant: '75ms',
    fast: '150ms',
    normal: '300ms',
    slow: '500ms',
    pulse: '2000ms',
    sweepRotation: '6500ms', // 6.5s per revolution (5-8s spec)
  },
  easing: {
    linear: 'linear',
    easeOut: 'cubic-bezier(0.16, 1, 0.3, 1)',
    easeInOut: 'cubic-bezier(0.4, 0, 0.2, 1)',
    radarSweep: 'linear',
  },
} as const;

export const severityThresholds = {
  low: { min: 0.0, max: 0.40, label: 'Low', color: colors.lowRisk, pulseScale: 1.0 },
  medium: { min: 0.40, max: 0.65, label: 'Medium', color: colors.mediumRisk, pulseScale: 1.25 },
  high: { min: 0.65, max: 0.85, label: 'High', color: colors.highRisk, pulseScale: 1.5 },
  critical: { min: 0.85, max: 1.00, label: 'Critical', color: colors.criticalRisk, pulseScale: 2.0 },
} as const;

export type SeverityLevel = keyof typeof severityThresholds;

export function getSeverityFromProbability(prob: number): SeverityLevel {
  if (prob >= severityThresholds.critical.min) return 'critical';
  if (prob >= severityThresholds.high.min) return 'high';
  if (prob >= severityThresholds.medium.min) return 'medium';
  return 'low';
}

export function getSeverityColor(severity: SeverityLevel): string {
  return severityThresholds[severity]?.color ?? colors.lowRisk;
}
