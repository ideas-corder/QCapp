import 'dart:convert';
import 'dart:io';
import 'package:flutter/material.dart';
import 'package:image_picker/image_picker.dart';
import 'package:signature/signature.dart';
import 'package:uuid/uuid.dart';
import '../models/aql.dart';
import '../models/models.dart';
import '../services/api.dart';
import '../services/local_db.dart';
import '../services/sync_service.dart';

class InspectionFormScreen extends StatefulWidget {
  final ApiClient api;
  const InspectionFormScreen({super.key, required this.api});

  @override
  State<InspectionFormScreen> createState() => _InspectionFormScreenState();
}

class _InspectionFormScreenState extends State<InspectionFormScreen> {
  final _form = GlobalKey<FormState>();
  final _db = LocalDb();
  late final SyncService _sync = SyncService(api: widget.api, db: _db);

  final _po = TextEditingController();
  final _itemNumber = TextEditingController();
  final _itemDescription = TextEditingController();
  final _lotSize = TextEditingController(text: '100');
  final _inspectorName = TextEditingController();
  final _inspectorNotes = TextEditingController();
  final _customSupplier = TextEditingController();

  String _level = 'General Level II';
  String _inspectionType = 'FINAL';
  double _aqlMajor = 2.5;
  double _aqlMinor = 4.0;

  List<Category> _categories = [];
  List<Supplier> _suppliers = [];
  Category? _selectedCategory;
  Supplier? _selectedSupplier;
  bool _useCustomSupplier = false;

  final List<Defect> _defects = [];
  final List<File> _photos = [];
  final _picker = ImagePicker();
  final _signatureCtrl = SignatureController(
    penStrokeWidth: 2,
    penColor: Colors.black,
    exportBackgroundColor: Colors.white,
  );

  bool _saving = false;
  String? _error;

  @override
  void initState() {
    super.initState();
    _loadOptions();
    _inspectorName.text = '';
  }

  Future<void> _loadOptions() async {
    try {
      final results = await Future.wait([
        widget.api.fetchCategories(),
        widget.api.fetchSuppliers(),
      ]);
      setState(() {
        _categories = results[0] as List<Category>;
        _suppliers = results[1] as List<Supplier>;
      });
    } catch (e) {
      setState(() => _error = e.toString());
    }
  }

  AqlResult? get _aql {
    final ls = int.tryParse(_lotSize.text) ?? 0;
    if (ls <= 0) return null;
    return calculateSampling(
      lotSize: ls,
      inspectionLevel: _level,
      aqlLimitMajor: _aqlMajor,
      aqlLimitMinor: _aqlMinor,
    );
  }

  Future<void> _addPhoto() async {
    final picked =
        await _picker.pickImage(source: ImageSource.camera, imageQuality: 70);
    if (picked != null) {
      setState(() => _photos.add(File(picked.path)));
    }
  }

  void _addDefect() {
    showDialog<void>(
      context: context,
      builder: (ctx) {
        final descCtrl = TextEditingController();
        final qtyCtrl = TextEditingController(text: '1');
        final remCtrl = TextEditingController();
        String severity = 'MAJOR';
        return StatefulBuilder(builder: (ctx, setLocal) {
          return AlertDialog(
            title: const Text('Add defect'),
            content: SingleChildScrollView(
              child: Column(
                mainAxisSize: MainAxisSize.min,
                children: [
                  DropdownButtonFormField<String>(
                    value: severity,
                    decoration: const InputDecoration(labelText: 'Severity'),
                    items: const [
                      DropdownMenuItem(
                          value: 'CRITICAL', child: Text('Critical')),
                      DropdownMenuItem(value: 'MAJOR', child: Text('Major')),
                      DropdownMenuItem(value: 'MINOR', child: Text('Minor')),
                    ],
                    onChanged: (v) => setLocal(() => severity = v!),
                  ),
                  TextField(
                    controller: descCtrl,
                    decoration:
                        const InputDecoration(labelText: 'Description'),
                  ),
                  TextField(
                    controller: qtyCtrl,
                    decoration: const InputDecoration(labelText: 'Quantity'),
                    keyboardType: TextInputType.number,
                  ),
                  TextField(
                    controller: remCtrl,
                    decoration:
                        const InputDecoration(labelText: 'Remarks (optional)'),
                  ),
                ],
              ),
            ),
            actions: [
              TextButton(
                onPressed: () => Navigator.pop(ctx),
                child: const Text('Cancel'),
              ),
              ElevatedButton(
                onPressed: () {
                  if (descCtrl.text.trim().isEmpty) return;
                  setState(() {
                    _defects.add(Defect(
                      severity: severity,
                      description: descCtrl.text.trim(),
                      quantity: int.tryParse(qtyCtrl.text) ?? 1,
                      remarks: remCtrl.text.trim(),
                    ));
                  });
                  Navigator.pop(ctx);
                },
                child: const Text('Add'),
              ),
            ],
          );
        });
      },
    );
  }

  int get _criticalCount =>
      _defects.where((d) => d.severity == 'CRITICAL').fold(0, (s, d) => s + d.quantity);
  int get _majorCount =>
      _defects.where((d) => d.severity == 'MAJOR').fold(0, (s, d) => s + d.quantity);
  int get _minorCount =>
      _defects.where((d) => d.severity == 'MINOR').fold(0, (s, d) => s + d.quantity);

  String _verdict() {
    final a = _aql;
    if (a == null) return 'PENDING_REVIEW';
    return evaluateOutcome(
      totalCritical: _criticalCount,
      totalMajor: _majorCount,
      totalMinor: _minorCount,
      aql: a,
    );
  }

  Future<String?> _signatureBase64() async {
    if (_signatureCtrl.isEmpty) return null;
    final bytes = await _signatureCtrl.toPngBytes();
    if (bytes == null) return null;
    return 'data:image/png;base64,${base64Encode(bytes)}';
  }

  Future<void> _submit() async {
    if (!_form.currentState!.validate()) return;
    if (_selectedCategory == null) {
      setState(() => _error = 'Select a category');
      return;
    }
    if (!_useCustomSupplier && _selectedSupplier == null) {
      setState(() => _error = 'Select a supplier');
      return;
    }
    if (_useCustomSupplier && _customSupplier.text.trim().isEmpty) {
      setState(() => _error = 'Enter custom supplier name');
      return;
    }
    setState(() {
      _saving = true;
      _error = null;
    });

    try {
      final aql = _aql!;
      final sig = await _signatureBase64() ?? '';
      // We need a supplierId — for custom suppliers we keep the selected one
      // on the local row (or skip sync if none). For simplicity we require a
      // real supplier selection on the server side.
      if (_useCustomSupplier) {
        // Use a placeholder supplierId — the server will reject without one.
        // In a real product you'd have a "custom supplier" flow on the API.
        setState(() => _error = 'Custom suppliers require a base record; pick from the list.');
        return;
      }
      final now = DateTime.now().millisecondsSinceEpoch;
      final draft = InspectionDraft(
        id: const Uuid().v4(),
        submissionUuid: const Uuid().v4(),
        categoryId: _selectedCategory!.id,
        supplierId: _selectedSupplier!.id,
        poNumber: _po.text.trim(),
        itemNumber: _itemNumber.text.trim(),
        itemDescription: _itemDescription.text.trim(),
        lotSize: int.parse(_lotSize.text),
        inspectionLevel: _level,
        inspectionType: _inspectionType,
        aqlLimitMajor: _aqlMajor,
        aqlLimitMinor: _aqlMinor,
        codeLetter: aql.codeLetter,
        sampleSize: aql.sampleSize,
        criticalAc: aql.criticalAc,
        criticalRe: aql.criticalRe,
        majorAc: aql.majorAc,
        majorRe: aql.majorRe,
        minorAc: aql.minorAc,
        minorRe: aql.minorRe,
        totalCritical: _criticalCount,
        totalMajor: _majorCount,
        totalMinor: _minorCount,
        overallResult: _verdict(),
        inspectorName: _inspectorName.text.trim(),
        inspectorNotes: _inspectorNotes.text.trim(),
        signatureBase64: sig,
        syncStatus: 'PENDING_SYNC',
        defectsJson:
            jsonEncode(_defects.map((d) => d.toJson()).toList()),
        photoPaths: _photos.map((p) => p.path).join(','),
        createdAt: now,
        updatedAt: now,
      );
      await _db.upsert(draft);

      // Try sync right away; if it fails the row stays PENDING_SYNC for later.
      final res = await _sync.pushAll();

      if (!mounted) return;
      ScaffoldMessenger.of(context).showSnackBar(
        SnackBar(content: Text(
          res.failed > 0
              ? 'Saved locally — sync failed (${res.errors.first})'
              : 'Submitted (${res.synced} synced)',
        )),
      );
      Navigator.pop(context);
    } catch (e) {
      setState(() => _error = e.toString());
    } finally {
      if (mounted) setState(() => _saving = false);
    }
  }

  @override
  Widget build(BuildContext context) {
    final aql = _aql;
    final verdict = _verdict();
    final verdictColor =
        verdict == 'PASS' ? Colors.green : verdict == 'FAIL' ? Colors.red : Colors.orange;

    return Scaffold(
      appBar: AppBar(title: const Text('New Inspection')),
      body: SafeArea(
        child: Form(
          key: _form,
          child: ListView(
            padding: const EdgeInsets.all(16),
            children: [
              if (_error != null)
                Container(
                  padding: const EdgeInsets.all(10),
                  margin: const EdgeInsets.only(bottom: 12),
                  color: Colors.red.shade50,
                  child: Text(_error!, style: TextStyle(color: Colors.red.shade800)),
                ),
              TextFormField(
                controller: _po,
                decoration: const InputDecoration(labelText: 'PO Number'),
              ),
              const SizedBox(height: 8),
              TextFormField(
                controller: _itemNumber,
                decoration: const InputDecoration(labelText: 'Item Number'),
              ),
              const SizedBox(height: 8),
              TextFormField(
                controller: _itemDescription,
                decoration: const InputDecoration(labelText: 'Item Description'),
                maxLines: 2,
              ),
              const SizedBox(height: 12),
              DropdownButtonFormField<Category>(
                value: _selectedCategory,
                decoration: const InputDecoration(labelText: 'Category'),
                items: _categories
                    .map((c) => DropdownMenuItem(value: c, child: Text(c.name)))
                    .toList(),
                onChanged: (v) => setState(() => _selectedCategory = v),
                validator: (v) => v == null ? 'Required' : null,
              ),
              const SizedBox(height: 8),
              SwitchListTile(
                value: _useCustomSupplier,
                title: const Text('Custom supplier'),
                onChanged: (v) => setState(() => _useCustomSupplier = v),
                contentPadding: EdgeInsets.zero,
              ),
              if (!_useCustomSupplier)
                DropdownButtonFormField<Supplier>(
                  value: _selectedSupplier,
                  decoration: const InputDecoration(labelText: 'Supplier'),
                  items: _suppliers
                      .map((s) => DropdownMenuItem(
                          value: s,
                          child: Text(
                            s.vendorId != null
                                ? '${s.vendorId} — ${s.name}'
                                : s.name,
                          )))
                      .toList(),
                  onChanged: (v) => setState(() => _selectedSupplier = v),
                  validator: (v) => v == null ? 'Required' : null,
                )
              else
                TextFormField(
                  controller: _customSupplier,
                  decoration: const InputDecoration(labelText: 'Custom supplier name'),
                ),
              const SizedBox(height: 16),
              TextFormField(
                controller: _lotSize,
                decoration: const InputDecoration(labelText: 'Lot Size'),
                keyboardType: TextInputType.number,
                onChanged: (_) => setState(() {}),
                validator: (v) =>
                    (int.tryParse(v ?? '') ?? 0) <= 0 ? 'Required' : null,
              ),
              const SizedBox(height: 8),
              DropdownButtonFormField<String>(
                value: _level,
                decoration: const InputDecoration(labelText: 'Inspection Level'),
                items: kInspectionLevels
                    .map((l) => DropdownMenuItem(value: l, child: Text(l)))
                    .toList(),
                onChanged: (v) => setState(() => _level = v!),
              ),
              const SizedBox(height: 8),
              DropdownButtonFormField<String>(
                value: _inspectionType,
                decoration: const InputDecoration(labelText: 'Inspection Type'),
                items: const [
                  DropdownMenuItem(value: 'INLINE', child: Text('Inline (during production)')),
                  DropdownMenuItem(value: 'FINAL', child: Text('Final (pre-shipment)')),
                ],
                onChanged: (v) => setState(() => _inspectionType = v!),
              ),
              const SizedBox(height: 8),
              Row(children: [
                Expanded(
                  child: _SliderField(
                    label: 'AQL Major',
                    value: _aqlMajor,
                    options: kAqlLimits,
                    onChanged: (v) => setState(() => _aqlMajor = v),
                  ),
                ),
                const SizedBox(width: 8),
                Expanded(
                  child: _SliderField(
                    label: 'AQL Minor',
                    value: _aqlMinor,
                    options: kAqlLimits,
                    onChanged: (v) => setState(() => _aqlMinor = v),
                  ),
                ),
              ]),
              const SizedBox(height: 12),
              if (aql != null)
                Card(
                  color: Colors.blue.shade50,
                  child: Padding(
                    padding: const EdgeInsets.all(12),
                    child: Column(
                      crossAxisAlignment: CrossAxisAlignment.start,
                      children: [
                        Text('Code Letter: ${aql.codeLetter} · Sample: ${aql.sampleSize}'),
                        const SizedBox(height: 4),
                        Text('Major AC/RE: ${aql.majorAc}/${aql.majorRe}'),
                        Text('Minor AC/RE: ${aql.minorAc}/${aql.minorRe}'),
                      ],
                    ),
                  ),
                ),
              const SizedBox(height: 16),
              Card(
                child: Padding(
                  padding: const EdgeInsets.all(12),
                  child: Column(
                    crossAxisAlignment: CrossAxisAlignment.start,
                    children: [
                      Row(
                        children: [
                          const Expanded(
                              child: Text('Photos',
                                  style: TextStyle(fontWeight: FontWeight.bold))),
                          IconButton(
                            icon: const Icon(Icons.camera_alt),
                            onPressed: _addPhoto,
                          ),
                        ],
                      ),
                      Wrap(
                        spacing: 6,
                        runSpacing: 6,
                        children: [
                          for (var i = 0; i < _photos.length; i++)
                            Stack(
                              children: [
                                Image.file(_photos[i],
                                    width: 72, height: 72, fit: BoxFit.cover),
                                Positioned(
                                  right: 0,
                                  top: 0,
                                  child: GestureDetector(
                                    onTap: () =>
                                        setState(() => _photos.removeAt(i)),
                                    child: Container(
                                      color: Colors.black54,
                                      child: const Icon(Icons.close,
                                          size: 16, color: Colors.white),
                                    ),
                                  ),
                                ),
                              ],
                            ),
                          if (_photos.isEmpty)
                            const Text('No photos captured',
                                style: TextStyle(color: Colors.black45)),
                        ],
                      ),
                    ],
                  ),
                ),
              ),
              const SizedBox(height: 12),
              Card(
                child: Padding(
                  padding: const EdgeInsets.all(12),
                  child: Column(
                    crossAxisAlignment: CrossAxisAlignment.start,
                    children: [
                      Row(
                        children: [
                          const Expanded(
                              child: Text('Defects',
                                  style: TextStyle(fontWeight: FontWeight.bold))),
                          TextButton.icon(
                            icon: const Icon(Icons.add),
                            label: const Text('Add'),
                            onPressed: _addDefect,
                          ),
                        ],
                      ),
                      if (_defects.isEmpty)
                        const Text('No defects recorded',
                            style: TextStyle(color: Colors.black45)),
                      ..._defects.map((d) => ListTile(
                            dense: true,
                            contentPadding: EdgeInsets.zero,
                            leading: Icon(
                              d.severity == 'CRITICAL'
                                  ? Icons.error
                                  : d.severity == 'MAJOR'
                                      ? Icons.warning
                                      : Icons.info,
                              color: d.severity == 'CRITICAL'
                                  ? Colors.red
                                  : d.severity == 'MAJOR'
                                      ? Colors.orange
                                      : Colors.amber,
                            ),
                            title: Text(d.description),
                            subtitle: Text('${d.severity} · qty ${d.quantity}'),
                            trailing: IconButton(
                              icon: const Icon(Icons.delete_outline),
                              onPressed: () =>
                                  setState(() => _defects.remove(d)),
                            ),
                          )),
                      const SizedBox(height: 4),
                      Text('Counts: C $_criticalCount · M $_majorCount · m $_minorCount'),
                    ],
                  ),
                ),
              ),
              const SizedBox(height: 12),
              TextFormField(
                controller: _inspectorName,
                decoration: const InputDecoration(labelText: 'Inspector Name'),
              ),
              const SizedBox(height: 8),
              TextFormField(
                controller: _inspectorNotes,
                decoration:
                    const InputDecoration(labelText: 'Inspector Notes'),
                maxLines: 3,
              ),
              const SizedBox(height: 16),
              const Text('Signature',
                  style: TextStyle(fontWeight: FontWeight.bold)),
              Container(
                height: 140,
                decoration: BoxDecoration(
                  color: Colors.white,
                  border: Border.all(color: Colors.black26),
                ),
                child: Signature(
                  controller: _signatureCtrl,
                  backgroundColor: Colors.white,
                ),
              ),
              Align(
                alignment: Alignment.centerRight,
                child: TextButton(
                  onPressed: () => _signatureCtrl.clear(),
                  child: const Text('Clear signature'),
                ),
              ),
              const SizedBox(height: 12),
              Container(
                padding: const EdgeInsets.all(12),
                decoration: BoxDecoration(
                  color: verdictColor.withOpacity(0.1),
                  borderRadius: BorderRadius.circular(8),
                  border: Border.all(color: verdictColor),
                ),
                child: Row(
                  children: [
                    Icon(Icons.fact_check, color: verdictColor),
                    const SizedBox(width: 8),
                    Text('Verdict: $verdict',
                        style: TextStyle(
                            fontSize: 18,
                            fontWeight: FontWeight.bold,
                            color: verdictColor)),
                  ],
                ),
              ),
              const SizedBox(height: 16),
              ElevatedButton(
                onPressed: _saving ? null : _submit,
                child: _saving
                    ? const SizedBox(
                        height: 18,
                        width: 18,
                        child: CircularProgressIndicator(strokeWidth: 2),
                      )
                    : const Text('Submit inspection'),
              ),
            ],
          ),
        ),
      ),
    );
  }
}

class _SliderField extends StatelessWidget {
  final String label;
  final double value;
  final List<double> options;
  final ValueChanged<double> onChanged;
  const _SliderField({
    required this.label,
    required this.value,
    required this.options,
    required this.onChanged,
  });

  @override
  Widget build(BuildContext context) {
    return InputDecorator(
      decoration: InputDecoration(labelText: label),
      child: DropdownButton<double>(
        value: value,
        isExpanded: true,
        underline: const SizedBox(),
        items: options
            .map((o) => DropdownMenuItem(value: o, child: Text(o.toString())))
            .toList(),
        onChanged: (v) {
          if (v != null) onChanged(v);
        },
      ),
    );
  }
}
