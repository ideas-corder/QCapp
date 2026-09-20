// AQL sampling math — ported verbatim from com.example.data.model.AqlSampling
// in the original Android source so the API and mobile stay aligned.

export interface AqlResult {
  codeLetter: string;
  sampleSize: number;
  criticalAc: number;
  criticalRe: number;
  majorAc: number;
  majorRe: number;
  minorAc: number;
  minorRe: number;
}

export const INSPECTION_LEVELS = [
  'General Level I',
  'General Level II',
  'General Level III',
] as const;

export const AQL_LIMITS = [0.65, 1.0, 1.5, 2.5, 4.0] as const;

export type InspectionLevel = (typeof INSPECTION_LEVELS)[number];

function getCodeLetter(lotSize: number, level: string): string {
  if (level === 'General Level I') {
    if (lotSize >= 2 && lotSize <= 15) return 'A';
    if (lotSize >= 16 && lotSize <= 25) return 'B';
    if (lotSize >= 26 && lotSize <= 90) return 'C';
    if (lotSize >= 91 && lotSize <= 150) return 'D';
    if (lotSize >= 151 && lotSize <= 280) return 'E';
    if (lotSize >= 281 && lotSize <= 500) return 'F';
    if (lotSize >= 501 && lotSize <= 1200) return 'G';
    if (lotSize >= 1201 && lotSize <= 3200) return 'H';
    if (lotSize >= 3201 && lotSize <= 10000) return 'J';
    if (lotSize >= 10001 && lotSize <= 35000) return 'K';
    if (lotSize >= 35001 && lotSize <= 150000) return 'L';
    if (lotSize >= 150001 && lotSize <= 500000) return 'M';
    return 'N';
  }
  if (level === 'General Level III') {
    if (lotSize >= 2 && lotSize <= 8) return 'B';
    if (lotSize >= 9 && lotSize <= 15) return 'C';
    if (lotSize >= 16 && lotSize <= 25) return 'D';
    if (lotSize >= 26 && lotSize <= 50) return 'E';
    if (lotSize >= 51 && lotSize <= 90) return 'F';
    if (lotSize >= 91 && lotSize <= 150) return 'G';
    if (lotSize >= 151 && lotSize <= 280) return 'H';
    if (lotSize >= 281 && lotSize <= 500) return 'J';
    if (lotSize >= 501 && lotSize <= 1200) return 'K';
    if (lotSize >= 1201 && lotSize <= 3200) return 'L';
    if (lotSize >= 3201 && lotSize <= 10000) return 'M';
    if (lotSize >= 10001 && lotSize <= 35000) return 'N';
    if (lotSize >= 35001 && lotSize <= 150000) return 'P';
    if (lotSize >= 150001 && lotSize <= 500000) return 'Q';
    return 'R';
  }
  // General Level II (default)
  if (lotSize >= 2 && lotSize <= 8) return 'A';
  if (lotSize >= 9 && lotSize <= 15) return 'B';
  if (lotSize >= 16 && lotSize <= 25) return 'C';
  if (lotSize >= 26 && lotSize <= 50) return 'D';
  if (lotSize >= 51 && lotSize <= 90) return 'E';
  if (lotSize >= 91 && lotSize <= 150) return 'F';
  if (lotSize >= 151 && lotSize <= 280) return 'G';
  if (lotSize >= 281 && lotSize <= 500) return 'H';
  if (lotSize >= 501 && lotSize <= 1200) return 'J';
  if (lotSize >= 1201 && lotSize <= 3200) return 'K';
  if (lotSize >= 3201 && lotSize <= 10000) return 'L';
  if (lotSize >= 10001 && lotSize <= 35000) return 'M';
  if (lotSize >= 35001 && lotSize <= 150000) return 'N';
  if (lotSize >= 150001 && lotSize <= 500000) return 'P';
  return 'Q';
}

const SAMPLE_SIZES: Record<string, number> = {
  A: 2,
  B: 3,
  C: 5,
  D: 8,
  E: 13,
  F: 20,
  G: 32,
  H: 50,
  J: 80,
  K: 125,
  L: 200,
  M: 315,
  N: 500,
  P: 800,
  Q: 1250,
  R: 2000,
};

function getSampleSize(codeLetter: string, lotSize: number): number {
  const standard = SAMPLE_SIZES[codeLetter] ?? 80;
  return Math.min(standard, lotSize);
}

function getAcRe(
  sampleSize: number,
  aqlLimit: number,
): [number, number] {
  if (sampleSize <= 2) return [0, 1];
  if (sampleSize <= 5) {
    return aqlLimit <= 1.5 ? [0, 1] : [0, 1];
  }
  if (sampleSize <= 13) {
    if (aqlLimit <= 1.0) return [0, 1];
    return [1, 2];
  }
  if (sampleSize <= 32) {
    if (aqlLimit <= 0.65) return [0, 1];
    if (aqlLimit <= 1.5) return [1, 2];
    if (aqlLimit <= 2.5) return [2, 3];
    return [3, 4];
  }
  if (sampleSize <= 80) {
    if (aqlLimit <= 1.0) return [1, 2];
    if (aqlLimit <= 1.5) return [2, 3];
    if (aqlLimit <= 2.5) return [3, 4];
    return [5, 6];
  }
  if (sampleSize <= 125) {
    if (aqlLimit <= 0.65) return [1, 2];
    if (aqlLimit <= 1.0) return [2, 3];
    if (aqlLimit <= 1.5) return [3, 4];
    if (aqlLimit <= 2.5) return [5, 6];
    return [7, 8];
  }
  if (sampleSize <= 200) {
    if (aqlLimit <= 0.65) return [2, 3];
    if (aqlLimit <= 1.0) return [3, 4];
    if (aqlLimit <= 1.5) return [5, 6];
    if (aqlLimit <= 2.5) return [7, 8];
    return [10, 11];
  }
  // > 200
  if (aqlLimit <= 0.65) return [3, 4];
  if (aqlLimit <= 1.0) return [5, 6];
  if (aqlLimit <= 1.5) return [7, 8];
  if (aqlLimit <= 2.5) return [10, 11];
  return [14, 15];
}

export function calculateSampling(
  lotSize: number,
  inspectionLevel: string = 'General Level II',
  aqlLimitMajor: number = 2.5,
  aqlLimitMinor: number = 4.0,
): AqlResult {
  if (lotSize <= 0) {
    return {
      codeLetter: 'A',
      sampleSize: 2,
      criticalAc: 0,
      criticalRe: 1,
      majorAc: 0,
      majorRe: 1,
      minorAc: 0,
      minorRe: 1,
    };
  }
  const codeLetter = getCodeLetter(lotSize, inspectionLevel);
  const sampleSize = getSampleSize(codeLetter, lotSize);
  const [majorAc, majorRe] = getAcRe(sampleSize, aqlLimitMajor);
  const [minorAc, minorRe] = getAcRe(sampleSize, aqlLimitMinor);
  return {
    codeLetter,
    sampleSize,
    criticalAc: 0,
    criticalRe: 1,
    majorAc,
    majorRe,
    minorAc,
    minorRe,
  };
}

/**
 * Compute pass/fail against the AC/RE numbers.
 * Critical is always auto-fail at RE=1 (matches original behavior).
 */
export function evaluateOutcome(input: {
  totalCritical: number;
  totalMajor: number;
  totalMinor: number;
  aql: AqlResult;
}): 'PASS' | 'FAIL' {
  const { totalCritical, totalMajor, totalMinor, aql } = input;
  if (totalCritical >= aql.criticalRe) return 'FAIL';
  if (totalMajor >= aql.majorRe) return 'FAIL';
  if (totalMinor >= aql.minorRe) return 'FAIL';
  return 'PASS';
}
