import 'dart:async';
import 'dart:convert';
import 'dart:io';
import 'package:connectivity_plus/connectivity_plus.dart';
import 'api.dart';
import 'local_db.dart';
import '../models/models.dart';

class SyncResult {
  final int synced;
  final int failed;
  final List<String> errors;
  SyncResult(this.synced, this.failed, this.errors);
}

class SyncService {
  final ApiClient api;
  final LocalDb db;
  final Connectivity _connectivity = Connectivity();

  SyncService({required this.api, required this.db});

  Future<bool> isOnline() async {
    final results = await _connectivity.checkConnectivity();
    return results.any((r) => r != ConnectivityResult.none);
  }

  /// Push every PENDING_SYNC draft to the API. Photos are uploaded first,
  /// then the inspection payload (which references the uploaded URLs).
  Future<SyncResult> pushAll() async {
    if (!await isOnline()) {
      return SyncResult(0, 0, ['Device is offline']);
    }
    final pending = await db.listPending();
    int ok = 0;
    int fail = 0;
    final errors = <String>[];
    for (final draft in pending) {
      try {
        await _pushOne(draft);
        await db.upsert(draft.copyWith(syncStatus: 'SYNCED'));
        ok++;
      } catch (e) {
        await db.upsert(draft.copyWith(syncStatus: 'FAILED'));
        fail++;
        errors.add('${draft.id}: $e');
      }
    }
    return SyncResult(ok, fail, errors);
  }

  Future<void> _pushOne(InspectionDraft draft) async {
    final paths = draft.photoPaths
        .split(',')
        .where((p) => p.trim().isNotEmpty)
        .toList();

    // Upload photos first
    final uploadedUrls = <String>[];
    for (final path in paths) {
      final file = File(path);
      if (!await file.exists()) continue;
      final url = await api.uploadPhoto(file);
      uploadedUrls.add(url);
    }

    // Decode defects
    final defectsRaw = jsonDecode(draft.defectsJson) as List<dynamic>;
    final defects = defectsRaw
        .map((e) => Defect(
              severity: (e as Map<String, dynamic>)['severity'] as String,
              description: e['description'] as String,
              quantity: (e['quantity'] as int?) ?? 1,
              remarks: (e['remarks'] as String?) ?? '',
            ))
        .toList();

    await api.submitInspection(
      draft: draft,
      defects: defects,
      uploadedPhotoUrls: uploadedUrls,
    );
  }
}
