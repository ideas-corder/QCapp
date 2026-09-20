class Category {
  final String id;
  final String name;
  final String? description;

  Category({required this.id, required this.name, this.description});

  factory Category.fromJson(Map<String, dynamic> j) => Category(
        id: j['id'] as String,
        name: j['name'] as String,
        description: j['description'] as String?,
      );
}

class Supplier {
  final String id;
  final String? vendorId; // D365 F&O vendor account, e.g. VEN-005036
  final String name;

  Supplier({required this.id, required this.name, this.vendorId});

  factory Supplier.fromJson(Map<String, dynamic> j) => Supplier(
        id: j['id'] as String,
        name: j['name'] as String,
        vendorId: j['vendorId'] as String?,
      );
}

class Defect {
  final String severity; // CRITICAL / MAJOR / MINOR
  final String description;
  final int quantity;
  final String remarks;

  Defect({
    required this.severity,
    required this.description,
    this.quantity = 1,
    this.remarks = '',
  });

  Map<String, dynamic> toJson() => {
        'severity': severity,
        'description': description,
        'quantity': quantity,
        'remarks': remarks,
      };
}

class PhotoRef {
  final String localPath;
  final String? remoteUrl;

  PhotoRef({required this.localPath, this.remoteUrl});

  Map<String, dynamic> toJson() => {
        if (remoteUrl != null) 'url': remoteUrl,
        'localPath': localPath,
      };
}

/// Local inspection record — kept in sqflite until synced.
class InspectionDraft {
  final String id; // local UUID
  final String submissionUuid; // sent to API for idempotency
  final String categoryId;
  final String supplierId;
  final String isCustomSupplier;
  final String customSupplierName;
  final String poNumber;
  final String itemNumber;
  final String itemDescription;
  final int lotSize;
  final String inspectionLevel;
  final String inspectionType; // INLINE | FINAL
  final double aqlLimitMajor;
  final double aqlLimitMinor;
  final String codeLetter;
  final int sampleSize;
  final int criticalAc;
  final int criticalRe;
  final int majorAc;
  final int majorRe;
  final int minorAc;
  final int minorRe;
  final int totalCritical;
  final int totalMajor;
  final int totalMinor;
  final String overallResult;
  final String inspectorName;
  final String inspectorNotes;
  final String signatureBase64;
  final String syncStatus; // PENDING_SYNC, SYNCED, FAILED
  final String defectsJson; // serialized list
  final String photoPaths; // comma-separated local file paths
  final int createdAt;
  final int updatedAt;

  InspectionDraft({
    required this.id,
    required this.submissionUuid,
    required this.categoryId,
    required this.supplierId,
    this.isCustomSupplier = '',
    this.customSupplierName = '',
    this.poNumber = '',
    this.itemNumber = '',
    this.itemDescription = '',
    required this.lotSize,
    this.inspectionLevel = 'General Level II',
    this.inspectionType = 'FINAL',
    this.aqlLimitMajor = 2.5,
    this.aqlLimitMinor = 4.0,
    this.codeLetter = '',
    this.sampleSize = 0,
    this.criticalAc = 0,
    this.criticalRe = 1,
    this.majorAc = 0,
    this.majorRe = 1,
    this.minorAc = 0,
    this.minorRe = 1,
    this.totalCritical = 0,
    this.totalMajor = 0,
    this.totalMinor = 0,
    this.overallResult = 'PENDING_REVIEW',
    this.inspectorName = '',
    this.inspectorNotes = '',
    this.signatureBase64 = '',
    this.syncStatus = 'PENDING_SYNC',
    this.defectsJson = '[]',
    this.photoPaths = '',
    required this.createdAt,
    required this.updatedAt,
  });

  InspectionDraft copyWith({
    String? categoryId,
    String? supplierId,
    String? customSupplierName,
    String? poNumber,
    String? itemNumber,
    String? itemDescription,
    int? lotSize,
    String? inspectionLevel,
    String? inspectionType,
    double? aqlLimitMajor,
    double? aqlLimitMinor,
    String? codeLetter,
    int? sampleSize,
    int? criticalAc,
    int? criticalRe,
    int? majorAc,
    int? majorRe,
    int? minorAc,
    int? minorRe,
    int? totalCritical,
    int? totalMajor,
    int? totalMinor,
    String? overallResult,
    String? inspectorName,
    String? inspectorNotes,
    String? signatureBase64,
    String? syncStatus,
    String? defectsJson,
    String? photoPaths,
  }) {
    return InspectionDraft(
      id: id,
      submissionUuid: submissionUuid,
      categoryId: categoryId ?? this.categoryId,
      supplierId: supplierId ?? this.supplierId,
      isCustomSupplier: isCustomSupplier,
      customSupplierName: customSupplierName ?? this.customSupplierName,
      poNumber: poNumber ?? this.poNumber,
      itemNumber: itemNumber ?? this.itemNumber,
      itemDescription: itemDescription ?? this.itemDescription,
      lotSize: lotSize ?? this.lotSize,
      inspectionLevel: inspectionLevel ?? this.inspectionLevel,
      inspectionType: inspectionType ?? this.inspectionType,
      aqlLimitMajor: aqlLimitMajor ?? this.aqlLimitMajor,
      aqlLimitMinor: aqlLimitMinor ?? this.aqlLimitMinor,
      codeLetter: codeLetter ?? this.codeLetter,
      sampleSize: sampleSize ?? this.sampleSize,
      criticalAc: criticalAc ?? this.criticalAc,
      criticalRe: criticalRe ?? this.criticalRe,
      majorAc: majorAc ?? this.majorAc,
      majorRe: majorRe ?? this.majorRe,
      minorAc: minorAc ?? this.minorAc,
      minorRe: minorRe ?? this.minorRe,
      totalCritical: totalCritical ?? this.totalCritical,
      totalMajor: totalMajor ?? this.totalMajor,
      totalMinor: totalMinor ?? this.totalMinor,
      overallResult: overallResult ?? this.overallResult,
      inspectorName: inspectorName ?? this.inspectorName,
      inspectorNotes: inspectorNotes ?? this.inspectorNotes,
      signatureBase64: signatureBase64 ?? this.signatureBase64,
      syncStatus: syncStatus ?? this.syncStatus,
      defectsJson: defectsJson ?? this.defectsJson,
      photoPaths: photoPaths ?? this.photoPaths,
      createdAt: createdAt,
      updatedAt: DateTime.now().millisecondsSinceEpoch,
    );
  }

  Map<String, dynamic> toRow() => {
        'id': id,
        'submission_uuid': submissionUuid,
        'category_id': categoryId,
        'supplier_id': supplierId,
        'is_custom_supplier': isCustomSupplier,
        'custom_supplier_name': customSupplierName,
        'po_number': poNumber,
        'item_number': itemNumber,
        'item_description': itemDescription,
        'lot_size': lotSize,
        'inspection_level': inspectionLevel,
        'inspection_type': inspectionType,
        'aql_limit_major': aqlLimitMajor,
        'aql_limit_minor': aqlLimitMinor,
        'code_letter': codeLetter,
        'sample_size': sampleSize,
        'critical_ac': criticalAc,
        'critical_re': criticalRe,
        'major_ac': majorAc,
        'major_re': majorRe,
        'minor_ac': minorAc,
        'minor_re': minorRe,
        'total_critical': totalCritical,
        'total_major': totalMajor,
        'total_minor': totalMinor,
        'overall_result': overallResult,
        'inspector_name': inspectorName,
        'inspector_notes': inspectorNotes,
        'signature_base64': signatureBase64,
        'sync_status': syncStatus,
        'defects_json': defectsJson,
        'photo_paths': photoPaths,
        'created_at': createdAt,
        'updated_at': updatedAt,
      };

  static InspectionDraft fromRow(Map<String, dynamic> r) => InspectionDraft(
        id: r['id'] as String,
        submissionUuid: r['submission_uuid'] as String,
        categoryId: r['category_id'] as String,
        supplierId: r['supplier_id'] as String,
        isCustomSupplier: (r['is_custom_supplier'] as String?) ?? '',
        customSupplierName: (r['custom_supplier_name'] as String?) ?? '',
        poNumber: (r['po_number'] as String?) ?? '',
        itemNumber: (r['item_number'] as String?) ?? '',
        itemDescription: (r['item_description'] as String?) ?? '',
        lotSize: r['lot_size'] as int,
        inspectionLevel: (r['inspection_level'] as String?) ?? 'General Level II',
        inspectionType: (r['inspection_type'] as String?) ?? 'FINAL',
        aqlLimitMajor: (r['aql_limit_major'] as num).toDouble(),
        aqlLimitMinor: (r['aql_limit_minor'] as num).toDouble(),
        codeLetter: (r['code_letter'] as String?) ?? '',
        sampleSize: r['sample_size'] as int,
        criticalAc: r['critical_ac'] as int,
        criticalRe: r['critical_re'] as int,
        majorAc: r['major_ac'] as int,
        majorRe: r['major_re'] as int,
        minorAc: r['minor_ac'] as int,
        minorRe: r['minor_re'] as int,
        totalCritical: r['total_critical'] as int,
        totalMajor: r['total_major'] as int,
        totalMinor: r['total_minor'] as int,
        overallResult: (r['overall_result'] as String?) ?? 'PENDING_REVIEW',
        inspectorName: (r['inspector_name'] as String?) ?? '',
        inspectorNotes: (r['inspector_notes'] as String?) ?? '',
        signatureBase64: (r['signature_base64'] as String?) ?? '',
        syncStatus: (r['sync_status'] as String?) ?? 'PENDING_SYNC',
        defectsJson: (r['defects_json'] as String?) ?? '[]',
        photoPaths: (r['photo_paths'] as String?) ?? '',
        createdAt: r['created_at'] as int,
        updatedAt: r['updated_at'] as int,
      );
}
