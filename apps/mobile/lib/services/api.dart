import 'dart:async';
import 'dart:convert';
import 'dart:io';
import 'package:http/http.dart' as http;
import '../models/models.dart';

class ApiException implements Exception {
  final int status;
  final String message;
  ApiException(this.status, this.message);
  @override
  String toString() => 'API $status: $message';
}

class ApiClient {
  final String baseUrl;
  String? _accessToken;
  String? _refreshToken;

  // No hardcoded default — the APK ships to real phones, not emulators.
  // The URL is supplied by [ServerConfig] (SharedPreferences / --dart-define).
  // Passing a null/empty [baseUrl] is a programmer error and will throw on
  // first request, which is intentional — better a loud crash than a silent
  // timeout against an unreachable host like 10.0.2.2.
  static const String _defaultBase =
      String.fromEnvironment('API_URL', defaultValue: '');

  ApiClient({required String baseUrl})
      : assert(baseUrl.isNotEmpty, 'ApiClient requires a non-empty baseUrl'),
        baseUrl = baseUrl;

  void setTokens({String? access, String? refresh}) {
    _accessToken = access;
    _refreshToken = refresh;
  }

  String? get accessToken => _accessToken;

  Map<String, String> _headers({bool json = true}) => {
        if (json) 'Content-Type': 'application/json',
        if (_accessToken != null) 'Authorization': 'Bearer $_accessToken',
      };

  static const Duration _httpTimeout = Duration(seconds: 15);

  Future<Map<String, dynamic>> _decode(http.Response res) async {
    if (res.statusCode >= 200 && res.statusCode < 300) {
      if (res.body.isEmpty) return {};
      try {
        final decoded = jsonDecode(res.body);
        if (decoded is Map<String, dynamic>) return decoded;
        throw ApiException(res.statusCode,
            'Unexpected response shape (not an object): ${res.body}');
      } catch (e) {
        throw ApiException(res.statusCode, 'Bad JSON: ${res.body}');
      }
    }
    throw ApiException(res.statusCode, res.body);
  }

  /// Wraps an HTTP call so a hang becomes a visible timeout error instead of
  /// an infinite spinner. Also normalises socket / timeout / DNS errors.
  Future<T> _safeCall<T>(Future<T> Function() fn) async {
    try {
      return await fn().timeout(_httpTimeout);
    } on TimeoutException catch (e) {
      throw ApiException(0,
          'Request timed out after ${_httpTimeout.inSeconds}s (URL=$baseUrl)');
    } on SocketException catch (e) {
      throw ApiException(0, 'Socket error: ${e.message} (URL=$baseUrl)');
    } on HttpException catch (e) {
      throw ApiException(0, 'HTTP error: ${e.message}');
    } on FormatException catch (e) {
      throw ApiException(0, 'Bad response format: ${e.message}');
    } catch (e) {
      throw ApiException(0, 'Unexpected error: $e');
    }
  }

  Future<Map<String, dynamic>> login(String email, String password) async {
    return _safeCall(() async {
      final res = await http.post(
        Uri.parse('$baseUrl/auth/login'),
        headers: _headers(),
        body: jsonEncode({'email': email, 'password': password}),
      );
      return _decode(res);
    });
  }

  Future<Map<String, dynamic>> loginMfa(
      String mfaPendingToken, String totpCode) async {
    return _safeCall(() async {
      final res = await http.post(
        Uri.parse('$baseUrl/auth/login/mfa'),
        headers: _headers(),
        body: jsonEncode(
            {'mfaPendingToken': mfaPendingToken, 'totpCode': totpCode}),
      );
      return _decode(res);
    });
  }

  Future<List<Category>> fetchCategories() async {
    final res = await http.get(Uri.parse('$baseUrl/categories'),
        headers: _headers(json: false));
    final data = await _decode(res);
    return (data as List)
        .map((e) => Category.fromJson(e as Map<String, dynamic>))
        .toList();
  }

  Future<List<Supplier>> fetchSuppliers() async {
    final res = await http.get(Uri.parse('$baseUrl/suppliers'),
        headers: _headers(json: false));
    final data = await _decode(res);
    return (data as List)
        .map((e) => Supplier.fromJson(e as Map<String, dynamic>))
        .toList();
  }

  Future<String> uploadPhoto(File file) async {
    final req = http.MultipartRequest(
      'POST',
      Uri.parse('$baseUrl/uploads/photo'),
    );
    if (_accessToken != null) {
      req.headers['Authorization'] = 'Bearer $_accessToken';
    }
    req.files.add(await http.MultipartFile.fromPath('file', file.path));
    final streamed = await req.send();
    final res = await http.Response.fromStream(streamed);
    final data = await _decode(res);
    return '${baseUrl}${data['url']}';
  }

  Future<Map<String, dynamic>> submitInspection({
    required InspectionDraft draft,
    required List<Defect> defects,
    required List<String> uploadedPhotoUrls,
  }) async {
    final payload = {
      'submissionUuid': draft.submissionUuid,
      'debitNote': '',
      'categoryId': draft.categoryId,
      'supplierId': draft.supplierId,
      'isCustomSupplier': draft.isCustomSupplier.isNotEmpty,
      'customSupplierName': draft.customSupplierName,
      'poNumber': draft.poNumber,
      'itemNumber': draft.itemNumber,
      'itemDescription': draft.itemDescription,
      'lotSize': draft.lotSize,
      'inspectionLevel': draft.inspectionLevel,
      'inspectionType': draft.inspectionType,
      'aqlLimitMajor': draft.aqlLimitMajor,
      'aqlLimitMinor': draft.aqlLimitMinor,
      'codeLetter': draft.codeLetter,
      'sampleSize': draft.sampleSize,
      'criticalAc': draft.criticalAc,
      'criticalRe': draft.criticalRe,
      'majorAc': draft.majorAc,
      'majorRe': draft.majorRe,
      'minorAc': draft.minorAc,
      'minorRe': draft.minorRe,
      'totalCritical': draft.totalCritical,
      'totalMajor': draft.totalMajor,
      'totalMinor': draft.totalMinor,
      'overallResult': draft.overallResult,
      'inspectorName': draft.inspectorName,
      'inspectorNotes': draft.inspectorNotes,
      'signatureBase64': draft.signatureBase64,
      'defects': defects.map((d) => d.toJson()).toList(),
      'photos': uploadedPhotoUrls
          .map((u) => {'url': u, 'mimeType': 'image/jpeg'})
          .toList(),
    };
    final res = await http.post(
      Uri.parse('$baseUrl/inspections'),
      headers: _headers(),
      body: jsonEncode(payload),
    );
    return _decode(res);
  }

  Future<Map<String, dynamic>> fetchDashboard() async {
    final res = await http.get(Uri.parse('$baseUrl/inspections/dashboard'),
        headers: _headers(json: false));
    return _decode(res);
  }

  Future<Map<String, dynamic>> fetchInspection(String id) async {
    final res = await http.get(Uri.parse('$baseUrl/inspections/$id'),
        headers: _headers(json: false));
    return _decode(res);
  }

  Future<Map<String, dynamic>> listInspections({
    int page = 1,
    int pageSize = 25,
    String? results,
    String? sortBy,
    String? dateRange,
  }) async {
    final qp = <String, String>{
      'page': '$page',
      'pageSize': '$pageSize',
      if (results != null) 'results': results,
      if (sortBy != null) 'sortBy': sortBy,
      if (dateRange != null) 'dateRange': dateRange,
    };
    final uri = Uri.parse('$baseUrl/inspections')
        .replace(queryParameters: qp);
    final res = await http.get(uri, headers: _headers(json: false));
    return _decode(res);
  }
}
