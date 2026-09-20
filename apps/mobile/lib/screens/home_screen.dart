import 'package:flutter/material.dart';
import '../services/api.dart';
import '../services/local_db.dart';
import '../services/sync_service.dart';
import 'inspection_form_screen.dart';
import 'history_screen.dart';
import 'login_screen.dart';

class HomeScreen extends StatefulWidget {
  final ApiClient api;
  const HomeScreen({super.key, required this.api});

  @override
  State<HomeScreen> createState() => _HomeScreenState();
}

class _HomeScreenState extends State<HomeScreen> {
  final _db = LocalDb();
  late final SyncService _sync = SyncService(api: widget.api, db: _db);
  Map<String, dynamic>? _stats;
  int _pending = 0;
  bool _loading = true;
  String? _error;

  @override
  void initState() {
    super.initState();
    _load();
  }

  Future<void> _load() async {
    setState(() => _loading = true);
    try {
      final results = await Future.wait([
        widget.api.fetchDashboard(),
        _db.listPending(),
      ]);
      _stats = results[0] as Map<String, dynamic>;
      _pending = (results[1] as List).length;
      _error = null;
    } catch (e) {
      _error = e.toString();
    } finally {
      if (mounted) setState(() => _loading = false);
    }
  }

  Future<void> _doSync() async {
    final res = await _sync.pushAll();
    if (!mounted) return;
    ScaffoldMessenger.of(context).showSnackBar(
      SnackBar(content: Text('Sync: ${res.synced} ok, ${res.failed} failed')),
    );
    await _load();
  }

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      appBar: AppBar(
        title: const Text('QC Inspector'),
        actions: [
          IconButton(
            icon: const Icon(Icons.sync),
            tooltip: 'Sync now',
            onPressed: _doSync,
          ),
          IconButton(
            icon: const Icon(Icons.logout),
            onPressed: () {
              widget.api.setTokens(access: null, refresh: null);
              Navigator.pushReplacement(
                context,
                MaterialPageRoute(
                  builder: (_) => LoginScreen(
                    api: widget.api,
                    // No URL-lifecycle owner here; the AppBar gear still works
                    // but a new base URL requires re-login from the top.
                    onBaseUrlChanged: (_) {},
                  ),
                ),
              );
            },
          ),
        ],
      ),
      body: _loading
          ? const Center(child: CircularProgressIndicator())
          : RefreshIndicator(
              onRefresh: _load,
              child: ListView(
                padding: const EdgeInsets.all(16),
                children: [
                  if (_error != null)
                    Card(
                      color: Colors.red.shade50,
                      child: Padding(
                        padding: const EdgeInsets.all(12),
                        child: Text(_error!,
                            style: TextStyle(color: Colors.red.shade800)),
                      ),
                    ),
                  if (_pending > 0)
                    Card(
                      color: Colors.orange.shade50,
                      child: ListTile(
                        leading: const Icon(Icons.cloud_upload,
                            color: Colors.orange),
                        title: Text('$_pending inspections pending sync'),
                        trailing: TextButton(
                          onPressed: _doSync,
                          child: const Text('Sync now'),
                        ),
                      ),
                    ),
                  if (_stats != null) ...[
                    Row(
                      children: [
                        _StatCard(
                          label: 'Total',
                          value: '${_stats!['totalInspections'] ?? 0}',
                        ),
                        _StatCard(
                          label: 'Passed',
                          value: '${_stats!['totalPassed'] ?? 0}',
                          color: Colors.green,
                        ),
                        _StatCard(
                          label: 'Failed',
                          value: '${_stats!['totalFailed'] ?? 0}',
                          color: Colors.red,
                        ),
                      ],
                    ),
                    const SizedBox(height: 8),
                    Card(
                      child: ListTile(
                        title: const Text('Pass rate'),
                        trailing: Text(
                          '${_stats!['passRatePercentage'] ?? 0}%',
                          style: const TextStyle(
                              fontSize: 20, fontWeight: FontWeight.bold),
                        ),
                      ),
                    ),
                  ],
                  const SizedBox(height: 16),
                  Card(
                    child: Column(
                      children: [
                        ListTile(
                          leading: const Icon(Icons.add_circle,
                              color: Colors.blue),
                          title: const Text('New inspection'),
                          subtitle: const Text(
                              'Capture photos, defects, and signature'),
                          trailing: const Icon(Icons.chevron_right),
                          onTap: () async {
                            await Navigator.push(
                              context,
                              MaterialPageRoute(
                                builder: (_) =>
                                    InspectionFormScreen(api: widget.api),
                              ),
                            );
                            await _load();
                          },
                        ),
                        const Divider(height: 1),
                        ListTile(
                          leading: const Icon(Icons.history),
                          title: const Text('Inspection history'),
                          trailing: const Icon(Icons.chevron_right),
                          onTap: () async {
                            await Navigator.push(
                              context,
                              MaterialPageRoute(
                                builder: (_) =>
                                    HistoryScreen(api: widget.api),
                              ),
                            );
                            await _load();
                          },
                        ),
                      ],
                    ),
                  ),
                ],
              ),
            ),
    );
  }
}

class _StatCard extends StatelessWidget {
  final String label;
  final String value;
  final Color? color;
  const _StatCard({required this.label, required this.value, this.color});

  @override
  Widget build(BuildContext context) {
    return Expanded(
      child: Card(
        child: Padding(
          padding: const EdgeInsets.all(12),
          child: Column(
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              Text(label,
                  style: const TextStyle(color: Colors.black54, fontSize: 12)),
              const SizedBox(height: 4),
              Text(value,
                  style: TextStyle(
                      fontSize: 24,
                      fontWeight: FontWeight.bold,
                      color: color)),
            ],
          ),
        ),
      ),
    );
  }
}
