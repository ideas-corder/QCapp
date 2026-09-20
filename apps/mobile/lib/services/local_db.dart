import 'dart:async';
import 'package:path/path.dart' as p;
import 'package:path_provider/path_provider.dart';
import 'package:sqflite/sqflite.dart';
import '../models/models.dart';

class LocalDb {
  Database? _db;

  Future<Database> _open() async {
    if (_db != null) return _db!;
    final dir = await getApplicationDocumentsDirectory();
    final path = p.join(dir.path, 'qc_inspector.db');
    _db = await openDatabase(
      path,
      version: 2,
      onCreate: (db, version) async {
        await db.execute('''
          CREATE TABLE inspections (
            id TEXT PRIMARY KEY,
            submission_uuid TEXT NOT NULL,
            category_id TEXT NOT NULL,
            supplier_id TEXT NOT NULL,
            is_custom_supplier TEXT NOT NULL DEFAULT '',
            custom_supplier_name TEXT NOT NULL DEFAULT '',
            po_number TEXT NOT NULL DEFAULT '',
            item_number TEXT NOT NULL DEFAULT '',
            item_description TEXT NOT NULL DEFAULT '',
            lot_size INTEGER NOT NULL,
            inspection_level TEXT NOT NULL,
            inspection_type TEXT NOT NULL DEFAULT 'FINAL',
            aql_limit_major REAL NOT NULL,
            aql_limit_minor REAL NOT NULL,
            code_letter TEXT NOT NULL DEFAULT '',
            sample_size INTEGER NOT NULL,
            critical_ac INTEGER NOT NULL,
            critical_re INTEGER NOT NULL,
            major_ac INTEGER NOT NULL,
            major_re INTEGER NOT NULL,
            minor_ac INTEGER NOT NULL,
            minor_re INTEGER NOT NULL,
            total_critical INTEGER NOT NULL,
            total_major INTEGER NOT NULL,
            total_minor INTEGER NOT NULL,
            overall_result TEXT NOT NULL,
            inspector_name TEXT NOT NULL DEFAULT '',
            inspector_notes TEXT NOT NULL DEFAULT '',
            signature_base64 TEXT NOT NULL DEFAULT '',
            sync_status TEXT NOT NULL,
            defects_json TEXT NOT NULL DEFAULT '[]',
            photo_paths TEXT NOT NULL DEFAULT '',
            created_at INTEGER NOT NULL,
            updated_at INTEGER NOT NULL
          )
        ''');
        await db.execute(
          'CREATE INDEX ix_inspections_sync ON inspections (sync_status)',
        );
      },
      onUpgrade: (db, oldVersion, newVersion) async {
        // v1 → v2: add inspection_type for offline drafts.
        if (oldVersion < 2) {
          await db.execute(
            "ALTER TABLE inspections ADD COLUMN inspection_type TEXT NOT NULL DEFAULT 'FINAL'",
          );
        }
      },
    );
    return _db!;
  }

  Future<void> upsert(InspectionDraft d) async {
    final db = await _open();
    await db.insert(
      'inspections',
      d.toRow(),
      conflictAlgorithm: ConflictAlgorithm.replace,
    );
  }

  Future<void> delete(String id) async {
    final db = await _open();
    await db.delete('inspections', where: 'id = ?', whereArgs: [id]);
  }

  Future<InspectionDraft?> findById(String id) async {
    final db = await _open();
    final rows =
        await db.query('inspections', where: 'id = ?', whereArgs: [id]);
    if (rows.isEmpty) return null;
    return InspectionDraft.fromRow(rows.first);
  }

  Future<List<InspectionDraft>> listAll({
    String? syncStatus,
    int limit = 100,
  }) async {
    final db = await _open();
    final rows = await db.query(
      'inspections',
      where: syncStatus != null ? 'sync_status = ?' : null,
      whereArgs: syncStatus != null ? [syncStatus] : null,
      orderBy: 'updated_at DESC',
      limit: limit,
    );
    return rows.map((r) => InspectionDraft.fromRow(r)).toList();
  }

  Future<List<InspectionDraft>> listPending() async {
    return listAll(syncStatus: 'PENDING_SYNC');
  }
}
