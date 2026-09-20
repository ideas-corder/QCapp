import 'package:flutter/material.dart';
import 'screens/login_screen.dart';
import 'screens/server_setup_screen.dart';
import 'services/api.dart';
import 'services/server_config.dart';

Future<void> main() async {
  WidgetsFlutterBinding.ensureInitialized();
  final stored = await ServerConfig.resolveBaseUrl();
  runApp(QcInspectorApp(initialBaseUrl: stored));
}

class QcInspectorApp extends StatefulWidget {
  final String? initialBaseUrl;
  const QcInspectorApp({super.key, this.initialBaseUrl});

  @override
  State<QcInspectorApp> createState() => _QcInspectorAppState();
}

class _QcInspectorAppState extends State<QcInspectorApp> {
  ApiClient? _api;

  @override
  void initState() {
    super.initState();
    final url = widget.initialBaseUrl;
    if (url != null) {
      _api = ApiClient(baseUrl: url);
    }
  }

  Future<void> _onUrlSaved(String url) async {
    setState(() {
      _api = ApiClient(baseUrl: url);
    });
  }

  /// User chose **Reset** in the gear menu — wipe the URL and bounce back
  /// to the setup screen.
  Future<void> _onUrlReset() async {
    await ServerConfig.clearBaseUrl();
    if (!mounted) return;
    setState(() {
      _api = null;
    });
  }

  @override
  Widget build(BuildContext context) {
    return MaterialApp(
      title: 'QC Inspector',
      theme: ThemeData(
        useMaterial3: true,
        colorScheme: ColorScheme.fromSeed(seedColor: const Color(0xFF0369A1)),
        appBarTheme: const AppBarTheme(centerTitle: false),
      ),
      home: _api == null
          ? ServerSetupScreen(onSaved: _onUrlSaved)
          : LoginScreen(
              api: _api!,
              onBaseUrlChanged: (newUrl) {
                if (newUrl.isEmpty) {
                  _onUrlReset();
                } else {
                  _onUrlSaved(newUrl);
                }
              },
            ),
    );
  }
}
