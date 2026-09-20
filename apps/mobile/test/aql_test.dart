import 'package:flutter_test/flutter_test.dart';
import 'package:qc_inspector/models/aql.dart';

void main() {
  group('AQL sampling', () {
    test('lot 0 returns defaults', () {
      final r = calculateSampling(lotSize: 0);
      expect(r.codeLetter, 'A');
      expect(r.sampleSize, 2);
      expect(r.criticalRe, 1);
    });

    test('Level II lot 100 -> code F -> sample 20', () {
      final r = calculateSampling(lotSize: 100);
      expect(r.codeLetter, 'F');
      expect(r.sampleSize, 20);
    });

    test('Level III lot 100 -> code G -> sample 32', () {
      final r = calculateSampling(
        lotSize: 100,
        inspectionLevel: 'General Level III',
      );
      expect(r.codeLetter, 'G');
      expect(r.sampleSize, 32);
    });

    test('evaluateOutcome fails on critical >= 1', () {
      final r = calculateSampling(lotSize: 100);
      expect(
        evaluateOutcome(
          totalCritical: 1,
          totalMajor: 0,
          totalMinor: 0,
          aql: r,
        ),
        'FAIL',
      );
    });

    test('evaluateOutcome passes when all defects below rejection', () {
      final r = calculateSampling(lotSize: 100);
      expect(
        evaluateOutcome(
          totalCritical: 0,
          totalMajor: 0,
          totalMinor: 1,
          aql: r,
        ),
        'PASS',
      );
    });
  });
}
