/**
 * Deterministic Sonar Coordinate Layout Engine
 * Converts network flow records into polar (r, theta) and 2.5D elevation (z) coordinates.
 *
 * Rules:
 * 1. Coordinates are purely analytical and do NOT represent physical geography or sensor bearings.
 * 2. Positions are strictly deterministic: identical records produce identical positions.
 * 3. Radial distance maps to logical network threat zones.
 */

import { SeverityLevel } from '@/tokens';

export interface SonarCoordinate {
  angle: number;       // Angle in degrees [0, 360)
  angleRad: number;    // Angle in radians [0, 2*PI)
  radius: number;      // Normalized radius [0.15, 0.95]
  elevation: number;   // Normalized 2.5D elevation [0.0, 1.0]
  zone: string;        // Logical network ring zone description
}

/**
 * Simple 32-bit FNV-1a deterministic hash
 */
export function hashString(str: string): number {
  let hash = 2166136261;
  for (let i = 0; i < str.length; i++) {
    hash ^= str.charCodeAt(i);
    hash = Math.imul(hash, 16777619);
  }
  return hash >>> 0;
}

/**
 * Computes deterministic polar coordinates for any flow record
 */
export function calculateSonarCoordinates(
  recordId: string,
  sourceIp: string,
  destinationIp: string,
  protocol: string,
  port: number,
  severity: SeverityLevel,
  probability: number
): SonarCoordinate {
  // Stable record key for hashing
  const recordKey = `${recordId}-${sourceIp}-${destinationIp}-${protocol}-${port}`;
  const h1 = hashString(recordKey);
  const h2 = hashString(`${recordKey}-jitter`);

  // 1. Angular coordinate: 0 to 360 degrees
  const angle = (h1 % 36000) / 100;
  const angleRad = (angle * Math.PI) / 180;

  // 2. Radial coordinate based on documented network risk tiers
  // Ring 1 (0.18 - 0.36): Core / Internal DMZ (Low risk benign flows)
  // Ring 2 (0.37 - 0.56): Boundary / Perimeter Gateway (Medium risk anomalies)
  // Ring 3 (0.57 - 0.76): External Ingress / Untrusted Edge (High risk intrusions)
  // Ring 4 (0.77 - 0.94): Critical Threat Perimeter (Critical C2 / DDoS)
  let baseRadius = 0.25;
  let zone = 'Core Internal DMZ';

  switch (severity) {
    case 'low':
      baseRadius = 0.22;
      zone = 'Core Internal Segment';
      break;
    case 'medium':
      baseRadius = 0.44;
      zone = 'Perimeter Gateway Zone';
      break;
    case 'high':
      baseRadius = 0.66;
      zone = 'External Ingress Boundary';
      break;
    case 'critical':
      baseRadius = 0.84;
      zone = 'Critical Threat Perimeter';
      break;
  }

  // Slight deterministic radial jitter to prevent overlap within band
  const jitterRange = 0.08;
  const jitter = (((h2 % 1000) / 1000) - 0.5) * jitterRange;
  const radius = Math.max(0.16, Math.min(0.94, baseRadius + jitter));

  // 3. Elevation coordinate for 2.5D perspective
  // Benign = flat (0.05), Critical = elevated beacon (up to 1.0)
  const elevation = Math.max(0.05, Math.pow(probability, 1.5));

  return {
    angle,
    angleRad,
    radius,
    elevation,
    zone,
  };
}

/**
 * Projects polar coordinate (r, theta) to 2D Cartesian (x, y) centered at (cx, cy)
 */
export function polarToCartesian(
  angleDeg: number,
  normalizedRadius: number,
  cx: number,
  cy: number,
  maxRadius: number
): { x: number; y: number } {
  const rad = ((angleDeg - 90) * Math.PI) / 180; // 0 deg points up (north)
  const r = normalizedRadius * maxRadius;
  return {
    x: cx + r * Math.cos(rad),
    y: cy + r * Math.sin(rad),
  };
}

/**
 * Projects polar coordinate to 2.5D Isometric perspective
 * tilt: angle in degrees (e.g., 55 deg tilt gives realistic 3D command table look)
 */
export function polarToIsometric(
  angleDeg: number,
  normalizedRadius: number,
  elevation: number,
  cx: number,
  cy: number,
  maxRadius: number,
  tiltFactor: number = 0.55 // Y-compression ratio for isometric perspective
): { x: number; y: number; baseScreenY: number; pillarHeight: number } {
  const rad = ((angleDeg - 90) * Math.PI) / 180;
  const r = normalizedRadius * maxRadius;

  const groundX = cx + r * Math.cos(rad);
  const groundY = cy + r * Math.sin(rad) * tiltFactor;

  // Pillar height rises upwards (-y in screen space)
  const maxPillarPx = 64;
  const pillarHeight = elevation * maxPillarPx;
  const elevatedY = groundY - pillarHeight;

  return {
    x: groundX,
    y: elevatedY,
    baseScreenY: groundY,
    pillarHeight,
  };
}
