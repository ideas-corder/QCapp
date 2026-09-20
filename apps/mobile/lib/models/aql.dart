/// AQL sampling math — ported verbatim from com.example.data.model.AqlSampling
/// and from apps/api/src/common/aql.ts. Keep all three in sync.

class AqlResult {
  final String codeLetter;
  final int sampleSize;
  final int criticalAc;
  final int criticalRe;
  final int majorAc;
  final int majorRe;
  final int minorAc;
  final int minorRe;

  const AqlResult({
    required this.codeLetter,
    required this.sampleSize,
    required this.criticalAc,
    required this.criticalRe,
    required this.majorAc,
    required this.majorRe,
    required this.minorAc,
    required this.minorRe,
  });
}

const List<String> kInspectionLevels = [
  'General Level I',
  'General Level II',
  'General Level III',
];

const List<double> kAqlLimits = [0.65, 1.0, 1.5, 2.5, 4.0];

String _codeLetter(int lotSize, String level) {
  if (level == 'General Level I') {
    if (lotSize >= 2 && lotSize <= 15) return 'A';
    if (lotSize <= 25) return 'B';
    if (lotSize <= 90) return 'C';
    if (lotSize <= 150) return 'D';
    if (lotSize <= 280) return 'E';
    if (lotSize <= 500) return 'F';
    if (lotSize <= 1200) return 'G';
    if (lotSize <= 3200) return 'H';
    if (lotSize <= 10000) return 'J';
    if (lotSize <= 35000) return 'K';
    if (lotSize <= 150000) return 'L';
    if (lotSize <= 500000) return 'M';
    return 'N';
  }
  if (level == 'General Level III') {
    if (lotSize <= 8) return 'B';
    if (lotSize <= 15) return 'C';
    if (lotSize <= 25) return 'D';
    if (lotSize <= 50) return 'E';
    if (lotSize <= 90) return 'F';
    if (lotSize <= 150) return 'G';
    if (lotSize <= 280) return 'H';
    if (lotSize <= 500) return 'J';
    if (lotSize <= 1200) return 'K';
    if (lotSize <= 3200) return 'L';
    if (lotSize <= 10000) return 'M';
    if (lotSize <= 35000) return 'N';
    if (lotSize <= 150000) return 'P';
    if (lotSize <= 500000) return 'Q';
    return 'R';
  }
  // General Level II (default)
  if (lotSize <= 8) return 'A';
  if (lotSize <= 15) return 'B';
  if (lotSize <= 25) return 'C';
  if (lotSize <= 50) return 'D';
  if (lotSize <= 90) return 'E';
  if (lotSize <= 150) return 'F';
  if (lotSize <= 280) return 'G';
  if (lotSize <= 500) return 'H';
  if (lotSize <= 1200) return 'J';
  if (lotSize <= 3200) return 'K';
  if (lotSize <= 10000) return 'L';
  if (lotSize <= 35000) return 'M';
  if (lotSize <= 150000) return 'N';
  if (lotSize <= 500000) return 'P';
  return 'Q';
}

const Map<String, int> _sampleSizes = {
  'A': 2,
  'B': 3,
  'C': 5,
  'D': 8,
  'E': 13,
  'F': 20,
  'G': 32,
  'H': 50,
  'J': 80,
  'K': 125,
  'L': 200,
  'M': 315,
  'N': 500,
  'P': 800,
  'Q': 1250,
  'R': 2000,
};

List<int> _acRe(int sampleSize, double aqlLimit) {
  if (sampleSize <= 2) return [0, 1];
  if (sampleSize <= 5) return [0, 1];
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
  if (aqlLimit <= 0.65) return [3, 4];
  if (aqlLimit <= 1.0) return [5, 6];
  if (aqlLimit <= 1.5) return [7, 8];
  if (aqlLimit <= 2.5) return [10, 11];
  return [14, 15];
}

AqlResult calculateSampling({
  required int lotSize,
  String inspectionLevel = 'General Level II',
  double aqlLimitMajor = 2.5,
  double aqlLimitMinor = 4.0,
}) {
  if (lotSize <= 0) {
    return const AqlResult(
      codeLetter: 'A',
      sampleSize: 2,
      criticalAc: 0,
      criticalRe: 1,
      majorAc: 0,
      majorRe: 1,
      minorAc: 0,
      minorRe: 1,
    );
  }
  final letter = _codeLetter(lotSize, inspectionLevel);
  final size = (_sampleSizes[letter] ?? 80).clamp(0, lotSize);
  final major = _acRe(size, aqlLimitMajor);
  final minor = _acRe(size, aqlLimitMinor);
  return AqlResult(
    codeLetter: letter,
    sampleSize: size,
    criticalAc: 0,
    criticalRe: 1,
    majorAc: major[0],
    majorRe: major[1],
    minorAc: minor[0],
    minorRe: minor[1],
  );
}

/// Returns PASS / FAIL using the same logic as the API.
String evaluateOutcome({
  required int totalCritical,
  required int totalMajor,
  required int totalMinor,
  required AqlResult aql,
}) {
  if (totalCritical >= aql.criticalRe) return 'FAIL';
  if (totalMajor >= aql.majorRe) return 'FAIL';
  if (totalMinor >= aql.minorRe) return 'FAIL';
  return 'PASS';
}
