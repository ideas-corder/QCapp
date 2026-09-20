import 'package:flutter/material.dart';
import '../services/api.dart';
import '../services/server_config.dart';
import 'home_screen.dart';

class LoginScreen extends StatefulWidget {
  final ApiClient api;
  /// Notified when the user picks a new base URL on this screen, so the parent
  /// can rebuild the [ApiClient] with a fresh URL. Optional — only screens
  /// that own the [ApiClient] lifecycle (e.g. main.dart's bootstrap) need it.
  final ValueChanged<String>? onBaseUrlChanged;

  const LoginScreen({
    super.key,
    required this.api,
    this.onBaseUrlChanged,
  });

  @override
  State<LoginScreen> createState() => _LoginScreenState();
}

class _LoginScreenState extends State<LoginScreen> {
  final _email = TextEditingController(text: 'admin@qc.local');
  final _password = TextEditingController(text: 'Admin@123');
  final _totp = TextEditingController();
  String? _mfaPendingToken;
  String? _error;
  bool _loading = false;

  Future<void> _submit() async {
    setState(() {
      _error = null;
      _loading = true;
    });
    try {
      if (_mfaPendingToken == null) {
        final r = await widget.api.login(_email.text, _password.text);
        if (r['mode'] == 'mfa_required') {
          setState(() => _mfaPendingToken = r['mfaPendingToken'] as String);
          return;
        }
        widget.api.setTokens(
          access: r['accessToken'] as String?,
          refresh: r['refreshToken'] as String?,
        );
      } else {
        final r = await widget.api.loginMfa(_mfaPendingToken!, _totp.text);
        widget.api.setTokens(
          access: r['accessToken'] as String?,
          refresh: r['refreshToken'] as String?,
        );
      }
      if (!mounted) return;
      Navigator.pushReplacement(
        context,
        MaterialPageRoute(
            builder: (_) => HomeScreen(api: widget.api)),
      );
    } catch (e) {
      setState(() => _error = e.toString());
    } finally {
      if (mounted) setState(() => _loading = false);
    }
  }

  Future<void> _openServerSettings() async {
    final current = await ServerConfig.resolveBaseUrl();
    if (!mounted) return;

    final controller = TextEditingController(text: current ?? '');
    final formKey = GlobalKey<FormState>();

    await showModalBottomSheet<void>(
      context: context,
      isScrollControlled: true,
      builder: (ctx) {
        return Padding(
          padding: EdgeInsets.only(
            left: 16,
            right: 16,
            top: 16,
            bottom: MediaQuery.of(ctx).viewInsets.bottom + 16,
          ),
          child: SingleChildScrollView(
            child: Form(
              key: formKey,
              child: Column(
                mainAxisSize: MainAxisSize.min,
                crossAxisAlignment: CrossAxisAlignment.stretch,
                children: [
                  Row(
                    children: [
                      const Icon(Icons.dns_outlined),
                      const SizedBox(width: 8),
                      const Text(
                        'Server URL',
                        style: TextStyle(
                            fontSize: 18, fontWeight: FontWeight.bold),
                      ),
                      const Spacer(),
                      IconButton(
                        icon: const Icon(Icons.close),
                        onPressed: () => Navigator.of(ctx).pop(),
                      ),
                    ],
                  ),
                  const SizedBox(height: 4),
                  const Text(
                    'Enter the base URL of the QC Inspector API server. '
                    'On your phone this should be your PC\'s LAN IP, an '
                    'ngrok URL, or a deployed server. Switch back to this '
                    'menu whenever the URL changes.',
                    style: TextStyle(color: Colors.black54, fontSize: 12),
                  ),
                  const SizedBox(height: 16),
                  TextFormField(
                    controller: controller,
                    keyboardType: TextInputType.url,
                    autofocus: true,
                    decoration: const InputDecoration(
                      labelText: 'Base URL',
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
                  Row(
                    children: [
                      TextButton.icon(
                        icon: const Icon(Icons.restore),
                        label: const Text('Reset'),
                        onPressed: () async {
                          await ServerConfig.clearBaseUrl();
                          if (!ctx.mounted) return;
                          Navigator.of(ctx).pop();
                          widget.onBaseUrlChanged?.call('');
                        },
                      ),
                      const Spacer(),
                      FilledButton.icon(
                        icon: const Icon(Icons.check),
                        label: const Text('Save & retry'),
                        onPressed: () async {
                          if (!formKey.currentState!.validate()) return;
                          final url = controller.text.trim();
                          await ServerConfig.setBaseUrl(url);
                          if (!ctx.mounted) return;
                          Navigator.of(ctx).pop();
                          widget.onBaseUrlChanged?.call(url);
                        },
                      ),
                    ],
                  ),
                ],
              ),
            ),
          ),
        );
      },
    );
  }

  @override
  Widget build(BuildContext context) {
    final inMfa = _mfaPendingToken != null;
    return Scaffold(
      backgroundColor: const Color(0xFFF5F5F4),
      appBar: AppBar(
        backgroundColor: const Color(0xFFF5F5F4),
        elevation: 0,
        actions: [
          IconButton(
            tooltip: 'Server URL',
            icon: const Icon(Icons.dns_outlined),
            onPressed: _openServerSettings,
          ),
        ],
      ),
      body: Center(
        child: Card(
          margin: const EdgeInsets.all(24),
          child: Padding(
            padding: const EdgeInsets.all(24),
            child: ConstrainedBox(
              constraints: const BoxConstraints(maxWidth: 360),
              child: Column(
                mainAxisSize: MainAxisSize.min,
                crossAxisAlignment: CrossAxisAlignment.stretch,
                children: [
                  const Text(
                    'QC Inspector',
                    textAlign: TextAlign.center,
                    style: TextStyle(fontSize: 22, fontWeight: FontWeight.bold),
                  ),
                  const SizedBox(height: 4),
                  const Text(
                    'Sign in to continue',
                    textAlign: TextAlign.center,
                    style: TextStyle(color: Colors.black54),
                  ),
                  Text(
                    'API: ${widget.api.baseUrl}',
                    textAlign: TextAlign.center,
                    style: const TextStyle(color: Colors.black38, fontSize: 11),
                  ),
                  const SizedBox(height: 24),
                  if (_error != null)
                    Container(
                      margin: const EdgeInsets.only(bottom: 12),
                      padding: const EdgeInsets.all(10),
                      decoration: BoxDecoration(
                        color: Colors.red.shade50,
                        borderRadius: BorderRadius.circular(6),
                        border: Border.all(color: Colors.red.shade200),
                      ),
                      child: Text(_error!,
                          style: TextStyle(color: Colors.red.shade800)),
                    ),
                  if (!inMfa) ...[
                    TextField(
                      controller: _email,
                      decoration: const InputDecoration(labelText: 'Email'),
                      keyboardType: TextInputType.emailAddress,
                    ),
                    const SizedBox(height: 8),
                    TextField(
                      controller: _password,
                      decoration: const InputDecoration(labelText: 'Password'),
                      obscureText: true,
                    ),
                  ] else ...[
                    const Text('Enter the 6-digit code from your authenticator.'),
                    const SizedBox(height: 12),
                    TextField(
                      controller: _totp,
                      decoration:
                          const InputDecoration(labelText: 'Authenticator code'),
                      keyboardType: TextInputType.number,
                      maxLength: 6,
                    ),
                  ],
                  const SizedBox(height: 12),
                  ElevatedButton(
                    onPressed: _loading ? null : _submit,
                    child: _loading
                        ? const SizedBox(
                            height: 18,
                            width: 18,
                            child: CircularProgressIndicator(strokeWidth: 2),
                          )
                        : Text(inMfa ? 'Verify' : 'Sign in'),
                  ),
                ],
              ),
            ),
          ),
        ),
      ),
    );
  }
}
