import 'package:flutter/material.dart';
import '../services/api.dart';

class HistoryScreen extends StatefulWidget {
  final ApiClient api;
  const HistoryScreen({super.key, required this.api});

  @override
  State<HistoryScreen> createState() => _HistoryScreenState();
}

class _HistoryScreenState extends State<HistoryScreen> {
  bool _loading = true;
  String? _error;
  List<Map<String, dynamic>> _items = [];

  @override
  void initState() {
    super.initState();
    _load();
  }

  Future<void> _load() async {
    setState(() => _loading = true);
    try {
      final data = await widget.api.listInspections(pageSize: 50);
      _items = (data['data'] as List).cast<Map<String, dynamic>>();
      _error = null;
    } catch (e) {
      _error = e.toString();
    } finally {
      if (mounted) setState(() => _loading = false);
    }
  }

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      appBar: AppBar(
        title: const Text('Inspection History'),
        actions: [
          IconButton(icon: const Icon(Icons.refresh), onPressed: _load),
        ],
      ),
      body: _loading
          ? const Center(child: CircularProgressIndicator())
          : _error != null
              ? Center(
                  child: Padding(
                    padding: const EdgeInsets.all(16),
                    child: Text(_error!, style: const TextStyle(color: Colors.red)),
                  ),
                )
              : _items.isEmpty
                  ? const Center(child: Text('No inspections yet'))
                  : RefreshIndicator(
                      onRefresh: _load,
                      child: ListView.separated(
                        itemCount: _items.length,
                        separatorBuilder: (_, __) => const Divider(height: 1),
                        itemBuilder: (ctx, i) {
                          final it = _items[i];
                          final cat = (it['category'] as Map?)?['name'] ?? '—';
                          final sup = (it['supplier'] as Map?)?['name'] ?? '—';
                          final result = it['overallResult'] as String;
                          final color = result == 'PASS'
                              ? Colors.green
                              : result == 'FAIL'
                                  ? Colors.red
                                  : Colors.orange;
                          return ListTile(
                            leading: CircleAvatar(
                              backgroundColor: color.withOpacity(0.15),
                              child: Text(result[0],
                                  style: TextStyle(color: color)),
                            ),
                            title: Text(
                                '${it['poNumber'] ?? '—'} · ${it['itemNumber'] ?? '—'}'),
                            subtitle: Text('$cat · $sup · lot ${it['lotSize']}'),
                            trailing: Column(
                              mainAxisAlignment: MainAxisAlignment.center,
                              crossAxisAlignment: CrossAxisAlignment.end,
                              children: [
                                Text(
                                  result,
                                  style: TextStyle(
                                      color: color, fontWeight: FontWeight.bold),
                                ),
                                Text(
                                  DateTime.parse(it['createdAt'] as String)
                                      .toLocal()
                                      .toString()
                                      .split(' ')
                                      .first,
                                  style: const TextStyle(
                                      fontSize: 11, color: Colors.black54),
                                ),
                              ],
                            ),
                          );
                        },
                      ),
                    ),
    );
  }
}
