import 'package:shared_preferences/shared_preferences.dart';

/// Persisted runtime API endpoint. Lets the mobile app point at any backend
/// (LAN IP, ngrok URL, deployed server) — there is no hardcoded emulator
/// default, because the APK ships to real phones.
///
/// Resolution order:
///   1. Value stored in SharedPreferences (set via the login-screen gear
///      menu, or the first-launch setup screen).
///   2. Compile-time value passed with `--dart-define=API_URL=...` (for
///      dev / CI builds that bake in a known URL).
///
/// Returns `null` from [resolveBaseUrl] when nothing is configured yet, so
/// the UI can force the user to enter a URL before login is even shown.
class ServerConfig {
  static const String _prefsKey = 'api_base_url';

  /// Compile-time override. Empty string when no `--dart-define` was passed.
  static const String _compileTimeBase =
      String.fromEnvironment('API_URL', defaultValue: '');

  /// Returns the URL the API client should use right now, or `null` if the
  /// user hasn't configured one yet.
  static Future<String?> resolveBaseUrl() async {
    final prefs = await SharedPreferences.getInstance();
    final stored = prefs.getString(_prefsKey);
    if (stored != null && stored.isNotEmpty) return stored;
    if (_compileTimeBase.isNotEmpty) return _compileTimeBase;
    return null;
  }

  /// Returns the best value *available without touching SharedPreferences* —
  /// currently only the compile-time value. Used to seed the input on the
  /// first-launch setup screen so devs who pass `--dart-define` see it
  /// pre-filled.
  static String? presetBaseUrl() {
    if (_compileTimeBase.isNotEmpty) return _compileTimeBase;
    return null;
  }

  /// Persist a new base URL. The caller must rebuild the [ApiClient] for it
  /// to take effect (the client holds a final `baseUrl`).
  static Future<void> setBaseUrl(String url) async {
    final prefs = await SharedPreferences.getInstance();
    await prefs.setString(_prefsKey, url);
  }

  /// Forget any persisted override so we fall back to the compile-time value
  /// (or `null` if none). Used by the gear's Reset button.
  static Future<void> clearBaseUrl() async {
    final prefs = await SharedPreferences.getInstance();
    await prefs.remove(_prefsKey);
  }
}
