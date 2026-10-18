import 'package:flutter_test/flutter_test.dart';
import 'package:marjon_owner/src/net/api.dart';
import 'package:marjon_owner/src/session.dart';
import 'package:shared_preferences/shared_preferences.dart';

import '../helpers.dart';

void main() {
  group('json helpers', () {
    test('asJson tolerates non-maps', () {
      expect(asJson({'a': 1}), {'a': 1});
      expect(asJson(null), isEmpty);
      expect(asJson([1]), isEmpty);
    });

    test('asJsonList unwraps lists and paginated envelopes', () {
      expect(asJsonList([{'a': 1}, 'junk', {'b': 2}]).length, 2);
      expect(asJsonList({'items': [{'a': 1}]}).length, 1);
      expect(asJsonList({'rows': [{'a': 1}]}).length, 1);
      expect(asJsonList({'data': [{'a': 1}]}).length, 1);
      expect(asJsonList(null), isEmpty);
      expect(asJsonList({'items': 'x'}), isEmpty);
    });
  });

  group('Api', () {
    test('login by phone stores tokens and returns the profile', () async {
      final a = await setUpApi({
        'POST /auth/login': (o) => {'access_token': 'A', 'refresh_token': 'R'},
        'GET /auth/me': (o) => {'id': 'u1', 'name': 'Owner'},
      });
      final me = await Api.i.login('+998901112233', 'pw');
      expect(me['name'], 'Owner');
      final body = a.calls('POST /auth/login').single.data as Map;
      expect(body, {'phone': '+998901112233', 'password': 'pw'});
      expect(a.calls('GET /auth/me').single.headers['Authorization'], 'Bearer A');
      expect(Api.i.hasTokens, true);
      final p = await SharedPreferences.getInstance();
      expect(p.getString('refresh'), 'R');
    });

    test('an email login uses the email field', () async {
      final a = await setUpApi({
        'POST /auth/login': (o) => {'access_token': 'A', 'refresh_token': 'R'},
        'GET /auth/me': (o) => {'id': 'u1'},
      });
      await Api.i.login('owner@x.uz', 'pw');
      expect((a.calls('POST /auth/login').single.data as Map).keys, contains('email'));
    });

    test('login does not send a stale bearer token', () async {
      final a = await setUpApi({
        'POST /auth/login': (o) => {'access_token': 'A2', 'refresh_token': 'R2'},
        'GET /auth/me': (o) => {'id': 'u1'},
      }, prefs: signedIn);
      await Api.i.login('x', 'y');
      expect(a.calls('POST /auth/login').single.headers.containsKey('Authorization'), false);
    });

    test('maps backend detail, validation lists and network errors', () async {
      await setUpApi({
        'GET /a': (o) => Reply({'detail': 'Нет прав'}, status: 403),
        'GET /b': (o) => Reply({'detail': [{'msg': 'bad'}, {'msg': 'worse'}]}, status: 422),
        'GET /c': (o) => throw NetDown(),
      });
      await expectLater(Api.i.get('/a'), throwsA(predicate((e) => e is ApiError && e.message == 'Нет прав' && e.status == 403 && !e.network)));
      await expectLater(Api.i.get('/b'), throwsA(predicate((e) => e is ApiError && e.message == 'bad; worse')));
      await expectLater(Api.i.get('/c'), throwsA(predicate((e) => e is ApiError && e.network && e.message == 'Нет связи с сервером')));
    });

    test('a 401 refreshes the tokens once and retries the request', () async {
      var first = true;
      final a = await setUpApi({
        'GET /pos/orders': (o) {
          if (first) {
            first = false;
            return Reply({'detail': 'expired'}, status: 401);
          }
          return [{'id': 'o1'}];
        },
        'POST /auth/refresh': (o) => {'access_token': 'A2', 'refresh_token': 'R2'},
      }, prefs: signedIn);
      final r = await Api.i.get('/pos/orders');
      expect((r as List).length, 1);
      expect(a.calls('POST /auth/refresh').length, 1);
      expect((a.calls('POST /auth/refresh').single.data as Map)['refresh_token'], 'R1');
      expect(a.calls('GET /pos/orders').last.headers['Authorization'], 'Bearer A2');
      final p = await SharedPreferences.getInstance();
      expect(p.getString('refresh'), 'R2');
    });

    test('concurrent 401s share a single refresh', () async {
      final seen = <String>{};
      final a = await setUpApi({
        'GET /x': (o) {
          final h = '${o.headers['Authorization']}';
          seen.add(h);
          return h == 'Bearer A1' ? Reply({'detail': 'e'}, status: 401) : {'ok': true};
        },
        'POST /auth/refresh': (o) => {'access_token': 'A2', 'refresh_token': 'R2'},
      }, prefs: signedIn);
      await Future.wait([Api.i.get('/x'), Api.i.get('/x'), Api.i.get('/x')]);
      expect(a.calls('POST /auth/refresh').length, 1);
    });

    test('failed refresh signs the user out', () async {
      var signedOut = false;
      await setUpApi({
        'GET /x': (o) => Reply({'detail': 'e'}, status: 401),
        'POST /auth/refresh': (o) => Reply({'detail': 'revoked'}, status: 401),
      }, prefs: signedIn);
      Api.i.onSignedOut = () async => signedOut = true;
      await expectLater(Api.i.get('/x'), throwsA(predicate((e) => e is ApiError && e.status == 401)));
      expect(signedOut, true);
      expect(Api.i.hasTokens, false);
    });

    test('a bad password on login is a plain error, not a refresh loop', () async {
      final a = await setUpApi({'POST /auth/login': (o) => Reply({'detail': 'Неверный пароль'}, status: 401)}, prefs: signedIn);
      await expectLater(Api.i.login('x', 'y'), throwsA(predicate((e) => e is ApiError && e.message == 'Неверный пароль')));
      expect(a.calls('POST /auth/refresh'), isEmpty);
    });

    test('logout revokes the refresh token and clears storage', () async {
      final a = await setUpApi({'POST /auth/logout': (o) => {}}, prefs: signedIn);
      await Api.i.logout();
      expect((a.calls('POST /auth/logout').single.data as Map)['refresh_token'], 'R1');
      expect(Api.i.hasTokens, false);
      final p = await SharedPreferences.getInstance();
      expect(p.getString('access'), isNull);
    });

    test('logout still clears the device when the server is unreachable', () async {
      await setUpApi({'POST /auth/logout': (o) => throw NetDown()}, prefs: signedIn);
      await Api.i.logout();
      expect(Api.i.hasTokens, false);
    });

    test('restore reads the legacy token key', () async {
      await setUpApi({}, prefs: {'token': 'LEGACY'});
      expect(Api.i.hasTokens, true);
    });
  });

  group('Session', () {
    test('init without tokens is ready and signed out', () async {
      await setUpApi({});
      final s = Session();
      await s.init();
      expect(s.ready, true);
      expect(s.signedIn, false);
    });

    test('init with valid tokens restores the profile', () async {
      await setUpApi({'GET /auth/me': (o) => {'id': 'u1', 'name': 'Owner', 'phone': '+998901112233'}}, prefs: signedIn);
      final s = Session();
      await s.init();
      expect(s.signedIn, true);
      expect(s.displayName, 'Owner');
    });

    test('init with a dead session ends signed out', () async {
      await setUpApi({
        'GET /auth/me': (o) => Reply({'detail': 'no'}, status: 401),
        'POST /auth/refresh': (o) => Reply({'detail': 'no'}, status: 401),
      }, prefs: signedIn);
      final s = Session();
      await s.init();
      expect(s.ready, true);
      expect(s.signedIn, false);
    });

    test('displayName falls back to phone, then email', () async {
      await setUpApi({});
      final s = Session()..user = {'phone': '+998', 'email': 'a@b.c'};
      expect(s.displayName, '+998');
      s.user = {'email': 'a@b.c'};
      expect(s.displayName, 'a@b.c');
    });

    test('login and logout notify listeners', () async {
      await setUpApi({
        'POST /auth/login': (o) => {'access_token': 'A', 'refresh_token': 'R'},
        'GET /auth/me': (o) => {'id': 'u1', 'name': 'Owner'},
        'POST /auth/logout': (o) => {},
      });
      final s = Session();
      var n = 0;
      s.addListener(() => n++);
      await s.login('x', 'y');
      expect(s.signedIn, true);
      await s.logout();
      expect(s.signedIn, false);
      expect(n, 2);
    });

    test('a session expiry elsewhere signs the session out', () async {
      await setUpApi({
        'GET /auth/me': (o) => {'id': 'u1'},
        'GET /x': (o) => Reply({'detail': 'e'}, status: 401),
        'POST /auth/refresh': (o) => Reply({'detail': 'e'}, status: 401),
      }, prefs: signedIn);
      final s = Session();
      await s.init();
      expect(s.signedIn, true);
      await expectLater(Api.i.get('/x'), throwsA(isA<ApiError>()));
      expect(s.signedIn, false);
    });
  });
}
