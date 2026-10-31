import { SeverityLevel } from '@/tokens';

export interface FlowRecord {
  id: string;
  recordIndex: number;
  timestamp: string | null;
  sourceIp: string;
  destinationIp: string;
  protocol: 'TCP' | 'UDP' | 'ICMP' | 'OTHER';
  port: number;
  service?: string;
  flowDuration: number;
  sourceBytes: number;
  destinationBytes: number;
  totalPackets: number;
  packetRate: number;
  synCount?: number;
  urgCount?: number;
  state?: string;
  label: 0 | 1; // 0 = benign, 1 = malicious
  attackCategory: 'Benign' | 'DDoS' | 'Brute Force' | 'Malware C2' | 'SQL Injection' | 'Port Scan' | 'Phishing' | 'Exploits' | 'Generic';
  country?: string;
}

export interface SonarEvent {
  id: string;
  recordIndex: number;
  timestamp: string | null;
  sourceIp: string;
  destinationIp: string;
  protocol: 'TCP' | 'UDP' | 'ICMP' | 'OTHER';
  port: number;
  service?: string;
  flowDuration: number | null;
  sourceBytes: number | null;
  destinationBytes: number | null;
  totalPackets: number | null;
  predictedMalicious: boolean;
  maliciousProbability: number | null;
  detectionSource?: 'suricata' | 'model';
  sensorPriority?: number | null;
  sensorCategory?: string;
  flowId?: string;
  eventType?: string;
  severity: SeverityLevel;
  attackCategory: string;
  country: string;
  
  // Deterministic 2.5D Polar Coordinates
  angle: number;         // 0 to 360 degrees
  radius: number;        // 0.15 to 0.95 normalized radius from center
  elevation: number;     // 0 to 1 normalized vertical pillar height
  
  // Model explanation features
  contributingFeatures: {
    feature: string;
    value: number | string;
    contribution: number; // SHAP / weight value
  }[];
}

export type IncidentStatus = 'New' | 'Investigating' | 'Reviewed' | 'Dismissed';

export interface IncidentRecord {
  id: string;
  timestamp: string;
  title: string;
  attackType: string;
  sourceIp: string;
  destinationIp: string;
  protocol: string;
  port: number;
  severity: SeverityLevel;
  detectionSource?: 'suricata' | 'model';
  riskScore: number | null; // 0 to 100 percentage
  probability: number | null; // 0 to 1
  status: IncidentStatus;
  analystNotes: string;
  country: string;
  assignedAnalyst?: string;
  features: Record<string, number | string | null>;
}

export interface ConfusionMatrix {
  truePositive: number;
  falsePositive: number;
  trueNegative: number;
  falseNegative: number;
}

export interface ModelMetrics {
  id: string;
  name: string;
  type: string;
  version: string;
  isBaseline: boolean;
  accuracy: number;
  precision: number;
  recall: number;
  f1Score: number;
  rocAuc: number;
  prAuc: number;
  falsePositiveRate: number;
  falseNegativeRate: number;
  inferenceLatencyMs: number;
  trainSamples: number;
  testSamples: number;
  confusionMatrix: ConfusionMatrix;
  featureImportances: {
    feature: string;
    importance: number;
    description: string;
  }[];
  rocCurve: { fpr: number; tpr: number }[];
  prCurve: { recall: number; precision: number }[];
  calibrationCurve: { meanPredicted: number; fractionOfPositives: number }[];
}

export interface DatasetSummary {
  isDemo?: boolean;
  id: string;
  name: string;
  filename: string;
  uploadedAt: string;
  totalRecords: number;
  benignCount: number;
  maliciousCount: number;
  sizeBytes: number;
  columns: string[];
  missingValues: Record<string, number>;
  classBalanceRatio: number;
}

export interface ThreatOverviewMetrics {
  dataSource?: 'suricata' | 'analysis';
  isDemo?: boolean;
  datasetName?: string;
  totalFlows: number;
  threatsDetected: number;
  threatPercentage: number;
  uniqueIps: number;
  activeAttacks: number;
  benignCount: number;
  suspiciousCount: number;
  maliciousCount: number;
  activeModelId: string;
}
