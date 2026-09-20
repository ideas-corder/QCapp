import 'package:flutter/material.dart';
import '../services/server_config.dart';

/// Shown on first launch (or after the gear's **Reset**) when no backend
/// URL has been configured. There is intentionally no "Use default" / no
/// emulator alias — the app is built to run on real phones, and the user
/// must point it at a real, reachable server before login is allowed.
class ServerSetupScreen extends StatefulWidget {
  /// Called once the user successfully saves a URL. The caller must
  /// instantiate an [ApiClient] with the returned value and switch to the
  /// real app shell.
  final ValueChanged<String> onSaved;

  const ServerSetupScreen({super.key, required this.onSaved});

  @override
  State<ServerSetupScreen> createState() => _ServerSetupScreenState();
}

class _ServerSetupScreenState extends State<ServerSetupScreen> {
  final _formKey = GlobalKey<FormState>();
  late final TextEditingController _controller =
      TextEditingController(text: ServerConfig.presetBaseUrl() ?? '');
  bool _saving = false;

  @override
  void dispose() {
    _controller.dispose();
    super.dispose();
  }

  Future<void> _save() async {
    if (!_formKey.currentState!.validate()) return;
    final url = _controller.text.trim();
    setState(() => _saving = true);
    try {
      await ServerConfig.setBaseUrl(url);
      if (!mounted) return;
      widget.onSaved(url);
    } finally {
      if (mounted) setState(() => _saving = false);
    }
  }

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      backgroundColor: const Color(0xFFF5F5F4),
      body: SafeArea(
        child: Center(
          child: SingleChildScrollView(
            padding: const EdgeInsets.all(24),
            child: ConstrainedBox(
              constraints: const BoxConstraints(maxWidth: 420),
              child: Card(
                child: Padding(
                  padding: const EdgeInsets.all(24),
                  child: Form(
                    key: _formKey,
                    child: Column(
                      mainAxisSize: MainAxisSize.min,
                      crossAxisAlignment: CrossAxisAlignment.stretch,
                      children: [
                        const Icon(Icons.dns_outlined,
                            size: 48, color: Color(0xFF0369A1)),
                        const SizedBox(height: 12),
                        const Text(
                          'QC Inspector',
                          textAlign: TextAlign.center,
                          style: TextStyle(
                              fontSize: 22, fontWeight: FontWeight.bold),
                        ),
                        const SizedBox(height: 4),
                        const Text(
                          'Welcome',
                          textAlign: TextAlign.center,
                          style: TextStyle(color: Colors.black54),
                        ),
                        const SizedBox(height: 20),
                        const Text(
                          'Before you sign in, please enter the address of your '
                          'QC Inspector API server.',
                          textAlign: TextAlign.center,
                          style:
                              TextStyle(color: Colors.black54, fontSize: 13),
                        ),
                        const SizedBox(height: 20),
                        TextFormField(
                          controller: _controller,
                          keyboardType: TextInputType.url,
                          autofocus: true,
                          decoration: const InputDecoration(
                            labelText: 'Server URL',
                            hintText: 'http://192.168.1.10:3002',
                            prefixIcon: Icon(Icons.link),
                          ),
                          validator: (v) {
                            final s = (v ?? '').trim();
                            if (s.isEmpty) return 'Enter a URL';
                            if (!(s.startsWith('http://') ||
                                s.startsWith('https://'))) {
                              return 'Must start with http:// or https://';
                            }
                            return null;
                          },
                        ),
                        const SizedBox(height: 16),
                        ElevatedButton.icon(
                          icon: const Icon(Icons.check),
                          label: Text(_saving ? 'Saving…' : 'Continue'),
                          onPressed: _saving ? null : _save,
                        ),
                        const SizedBox(height: 8),
                        const Text(
                          'Examples:\n'
                          '• http://192.168.1.10:3002  (PC on same Wi-Fi)\n'
                          '• https://qc.example.com     (deployed server)\n'
                          '• https://abc.ngrok.app     (ngrok tunnel)',
                          style:
                              TextStyle(color: Colors.black45, fontSize: 11),
                        ),
                      ],
                    ),
                  ),
                ),
              ),
            ),
          ),
        ),
      ),
    );
  }
}
