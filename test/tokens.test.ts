import { describe, it, expect } from 'vitest';
import {
  colors,
  getSeverityFromProbability,
  getSeverityColor,
  severityThresholds,
} from '../src/tokens';

describe('Midnight Sonar Design Tokens & Severity Logic', () => {
  it('correctly categorizes probabilities into documented severity tiers', () => {
    expect(getSeverityFromProbability(0.15)).toBe('low');
    expect(getSeverityFromProbability(0.39)).toBe('low');
    expect(getSeverityFromProbability(0.40)).toBe('medium');
    expect(getSeverityFromProbability(0.64)).toBe('medium');
    expect(getSeverityFromProbability(0.65)).toBe('high');
    expect(getSeverityFromProbability(0.84)).toBe('high');
    expect(getSeverityFromProbability(0.85)).toBe('critical');
    expect(getSeverityFromProbability(0.99)).toBe('critical');
  });

  it('provides brand-aligned hex codes for each severity tier', () => {
    expect(getSeverityColor('low')).toBe(colors.lowRisk);
    expect(getSeverityColor('medium')).toBe(colors.mediumRisk);
    expect(getSeverityColor('high')).toBe(colors.highRisk);
    expect(getSeverityColor('critical')).toBe(colors.criticalRisk);
    expect(severityThresholds.critical.min).toBeGreaterThan(severityThresholds.high.min);
  });

  it('defines valid hex codes in design tokens', () => {
    const hexRegex = /^#([0-9A-Fa-f]{3}|[0-9A-Fa-f]{6})$/;
    expect(hexRegex.test(colors.abyssBlack)).toBe(true);
    expect(hexRegex.test(colors.deepPetrol)).toBe(true);
    expect(hexRegex.test(colors.graphiteTeal)).toBe(true);
    expect(hexRegex.test(colors.sonarMint)).toBe(true);
    expect(hexRegex.test(colors.paleAqua)).toBe(true);
    expect(hexRegex.test(colors.alertCoral)).toBe(true);
  });
});
