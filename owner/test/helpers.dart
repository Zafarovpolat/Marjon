import 'dart:convert';
import 'dart:typed_data';

import 'package:dio/dio.dart';
import 'package:flutter/material.dart';
import 'package:flutter/services.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:marjon_owner/src/net/api.dart';
import 'package:marjon_owner/src/session.dart';
import 'package:provider/provider.dart';
import 'package:shared_preferences/shared_preferences.dart';

/// Thrown by a route handler to simulate an unreachable server.
class NetDown implements Exception {}

/// A canned HTTP response with a status code.
class Reply {
  Reply(this.body, {this.status = 200});
  final Object? body;
  final int status;
}

typedef Handler = Object? Function(RequestOptions o);

/// In-memory Dio adapter: routes are keyed "METHOD /path" (path without /api/v1 and query).
class FakeAdapter implements HttpClientAdapter {
  FakeAdapter(this.routes);
  final Map<String, Handler> routes;
  final List<RequestOptions> log = [];

  Iterable<RequestOptions> calls(String key) => log.where((o) => '${o.method} ${_path(o)}' == key);

  static String _path(RequestOptions o) {
    final p = o.uri.path;
    final i = p.indexOf('/api/v1');
    return i >= 0 ? p.substring(i + 7) : p;
  }

  @override
  Future<ResponseBody> fetch(RequestOptions options, Stream<Uint8List>? requestStream, Future<void>? cancelFuture) async {
    log.add(options);
    final h = routes['${options.method} ${_path(options)}'] ?? routes['${options.method} *'];
    if (h == null) return _json({'detail': 'no route ${options.method} ${_path(options)}'}, 404);
    try {
      final r = h(options);
      if (r is Reply) return _json(r.body, r.status);
      return _json(r, 200);
    } on NetDown {
      throw DioException.connectionError(requestOptions: options, reason: 'down');
    }
  }

  ResponseBody _json(Object? body, int status) => ResponseBody.fromString(jsonEncode(body), status, headers: {
        Headers.contentTypeHeader: ['application/json'],
      });

  @override
  void close({bool force = false}) {}
}

bool _fontsLoaded = false;

/// The real app fonts, so text metrics (and overflow checks) match a device instead of the Ahem test font.
Future<void> loadAppFonts() async {
  TestWidgetsFlutterBinding.ensureInitialized();
  if (_fontsLoaded) return;
  _fontsLoaded = true;
  const families = {
    'GolosText': ['GolosText-400', 'GolosText-500', 'GolosText-600', 'GolosText-700'],
    'Manrope': ['Manrope-600', 'Manrope-700', 'Manrope-800'],
    'JetBrainsMono': ['JetBrainsMono-500', 'JetBrainsMono-700'],
  };
  for (final e in families.entries) {
    final loader = FontLoader(e.key);
    for (final f in e.value) {
      loader.addFont(rootBundle.load('assets/fonts/$f.ttf'));
    }
    await loader.load();
  }
}

/// Fresh preferences + a fake network for one test. Pass tokens in [prefs] to start signed in.
Future<FakeAdapter> setUpApi(Map<String, Handler> routes, {Map<String, Object> prefs = const {}}) async {
  await loadAppFonts();
  SharedPreferences.setMockInitialValues({'seen_onboarding': true, ...prefs});
  await Api.i.restore();
  Api.i.onSignedOut = null;
  final a = FakeAdapter(routes);
  Api.i.dio.httpClientAdapter = a;
  return a;
}

/// Phone-sized surface so screens lay out like on a device.
void usePhone(WidgetTester tester) {
  tester.view.physicalSize = const Size(1080, 2400);
  tester.view.devicePixelRatio = 3;
  addTearDown(tester.view.resetPhysicalSize);
  addTearDown(tester.view.resetDevicePixelRatio);
}

/// A page inside a MaterialApp with the session provider (some pages read it).
Widget host(Widget child, {Session? session}) => ChangeNotifierProvider<Session>.value(
      value: session ?? Session(),
      child: MaterialApp(home: child),
    );

const signedIn = {'access': 'A1', 'refresh': 'R1'};

/// Arbitrary logical screen size (dp) at 3x density.
void useScreen(WidgetTester tester, double w, double h) {
  tester.view.physicalSize = Size(w * 3, h * 3);
  tester.view.devicePixelRatio = 3;
  addTearDown(tester.view.resetPhysicalSize);
  addTearDown(tester.view.resetDevicePixelRatio);
}
