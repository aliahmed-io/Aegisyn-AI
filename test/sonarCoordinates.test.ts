import { describe, it, expect } from 'vitest';
import {
  hashString,
  calculateSonarCoordinates,
  polarToCartesian,
  polarToIsometric,
} from '../src/utils/sonarCoordinates';

describe('Sonar Coordinate Determinism Engine', () => {
  it('hashString produces identical 32-bit hashes for identical inputs', () => {
    const key = 'FLW-00042-185.62.190.32-10.0.5.14-TCP-443';
    const hash1 = hashString(key);
    const hash2 = hashString(key);
    expect(hash1).toBe(hash2);
    expect(typeof hash1).toBe('number');
    expect(hash1).toBeGreaterThan(0);
  });

  it('calculateSonarCoordinates gives strictly deterministic polar coordinates', () => {
    const recordId = 'FLW-00100';
    const srcIp = '203.0.113.45';
    const dstIp = '10.0.5.14';
    const proto = 'UDP';
    const port = 53;
    const severity = 'critical';
    const probability = 0.942;

    const coord1 = calculateSonarCoordinates(recordId, srcIp, dstIp, proto, port, severity, probability);
    const coord2 = calculateSonarCoordinates(recordId, srcIp, dstIp, proto, port, severity, probability);

    expect(coord1.angle).toBe(coord2.angle);
    expect(coord1.radius).toBe(coord2.radius);
    expect(coord1.elevation).toBe(coord2.elevation);
    expect(coord1.zone).toBe('Critical Threat Perimeter');

    // Angle must be in [0, 360)
    expect(coord1.angle).toBeGreaterThanOrEqual(0);
    expect(coord1.angle).toBeLessThan(360);

    // Radius must be bounded
    expect(coord1.radius).toBeGreaterThanOrEqual(0.15);
    expect(coord1.radius).toBeLessThanOrEqual(0.95);
  });

  it('assigns higher elevation for critical high-probability threats', () => {
    const lowCoord = calculateSonarCoordinates('FLW-1', '10.0.1.1', '10.0.1.2', 'TCP', 80, 'low', 0.1);
    const critCoord = calculateSonarCoordinates('FLW-2', '203.0.113.1', '10.0.1.2', 'TCP', 443, 'critical', 0.95);

    expect(critCoord.elevation).toBeGreaterThan(lowCoord.elevation);
  });

  it('projects to valid screen coordinates in 2D Cartesian space', () => {
    const cx = 400;
    const cy = 300;
    const maxR = 250;
    const pt = polarToCartesian(0, 0.5, cx, cy, maxR);

    // 0 degrees points up (north): x = cx, y = cy - 0.5*maxR
    expect(pt.x).toBeCloseTo(cx, 1);
    expect(pt.y).toBeCloseTo(cy - 125, 1);
  });

  it('projects to valid 2.5D isometric perspective with non-negative pillar height', () => {
    const cx = 400;
    const cy = 300;
    const maxR = 250;
    const isoPt = polarToIsometric(90, 0.8, 0.9, cx, cy, maxR);

    expect(isoPt.pillarHeight).toBeGreaterThan(0);
    expect(isoPt.y).toBeLessThan(isoPt.baseScreenY); // elevated above ground
  });
});
