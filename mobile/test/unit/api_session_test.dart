import 'package:flutter_test/flutter_test.dart';
import 'package:marjon_mobile/src/net/api.dart';
import 'package:marjon_mobile/src/net/store.dart';
import 'package:marjon_mobile/src/session/session.dart';

import '../helpers.dart';

Map<String, Object?> loginTokens() => {'access_token': 'T-1', 'refresh_token': 'R-1'};

void main() {
  group('Api', () {
    test('login posts the employee\'s own phone + password and returns tokens', () async {
      final a = await setUpApi({'POST /auth/login': (o) => loginTokens()});
      final d = await Api.i.login('+998901112233', 'pw');
      expect(d['access_token'], 'T-1');
      expect((a.calls('POST /auth/login').single.data as Map)['phone'], '+998901112233');
    });

    test('maps backend detail to ApiError', () async {
      await setUpApi({'POST /auth/login': (o) => Reply({'detail': 'Неверный телефон или пароль'}, status: 401)});
      try {
        await Api.i.login('x', 'y');
        fail('should throw');
      } on ApiError catch (e) {
        expect(e.message, 'Неверный телефон или пароль');
        expect(e.status, 401);
        expect(e.network, false);
      }
    });

    test('joins validation error lists', () async {
      await setUpApi({'GET /auth/me': (o) => Reply({'detail': [{'msg': 'field required'}, {'msg': 'too short'}]}, status: 422)});
      try {
        await Api.i.me();
        fail('should throw');
      } on ApiError catch (e) {
        expect(e.message, 'field required; too short');
      }
    });

    test('network failure is flagged', () async {
      await setUpApi({'GET /auth/me': (o) => throw NetDown()});
      try {
        await Api.i.me();
        fail('should throw');
      } on ApiError catch (e) {
        expect(e.network, true);
        expect(e.message, 'Нет связи с сервером');
      }
    });

    test('staff token is sent as bearer, org token used as fallback', () async {
      final a = await setUpApi({'GET /auth/me': (o) => {'id': 'u'}}, prefs: {'marjon_org_token': 'ORG', 'marjon_token': 'STAFF'});
      await Api.i.me();
      expect(a.log.last.headers['Authorization'], 'Bearer STAFF');
      Store.staffToken = null;
      await Api.i.me();
      expect(a.log.last.headers['Authorization'], 'Bearer ORG');
    });

    test('org-scoped calls fall back to the staff token when there is no shared terminal', () async {
      final a = await setUpApi({'POST /auth/pin-login': (o) => {'access_token': 'T'}}, prefs: {'marjon_token': 'STAFF'});
      await Api.i.loginByPin('1234', null);
      expect(a.calls('POST /auth/pin-login').single.headers['Authorization'], 'Bearer STAFF');
    });

    test('terminal (org) 401 refreshes the token once and retries', () async {
      var first = true;
      final a = await setUpApi({
        'GET /image-backgrounds/active': (o) {
          if (first) {
            first = false;
            return Reply({'detail': 'expired'}, status: 401);
          }
          return {'url': 'bg.png'};
        },
        'POST /auth/refresh': (o) => {'access_token': 'ORG-2', 'refresh_token': 'REF-2'},
      }, prefs: {'marjon_org_token': 'ORG-1', 'marjon_org_refresh': 'REF-1'});
      final r = await Api.i.activeBackground();
      expect(r, {'url': 'bg.png'});
      expect(Store.orgToken, 'ORG-2');
      expect(Store.orgRefresh, 'REF-2');
      expect(a.calls('POST /auth/refresh').length, 1);
      expect(a.calls('GET /image-backgrounds/active').last.headers['Authorization'], 'Bearer ORG-2');
    });

    test('staff 401 triggers onStaffUnauthorized', () async {
      await setUpApi({'GET /pos/orders': (o) => Reply({'detail': 'no'}, status: 401)}, prefs: {'marjon_token': 'S'});
      var fired = false;
      Api.i.onStaffUnauthorized = () => fired = true;
      await expectLater(Api.i.orders(), throwsA(isA<ApiError>()));
      expect(fired, true);
    });

    test('GET falls back to the cache when offline', () async {
      var online = true;
      await setUpApi({'GET /inventory/products': (o) => online ? [{'id': 'p1', 'name': 'Плов'}] : throw NetDown()});
      expect((await Api.i.products()).length, 1);
      online = false;
      final cached = await Api.i.products();
      expect(cached.first['name'], 'Плов');
    });

    test('server errors are not served from cache', () async {
      var ok = true;
      await setUpApi({'GET /inventory/products': (o) => ok ? [{'id': 'p1'}] : Reply({'detail': 'boom'}, status: 500)});
      await Api.i.products();
      ok = false;
      await expectLater(Api.i.products(), throwsA(isA<ApiError>()));
    });

    test('offline write is queued and flushed in order when back online', () async {
      var online = false;
      final a = await setUpApi({
        'PATCH /kitchen/orders/o1/ready': (o) => online ? {'ok': true} : throw NetDown(),
        'PATCH /kitchen/orders/o2/ready': (o) => online ? {'ok': true} : throw NetDown(),
      });
      expect((await Api.i.orderReady('o1'))['queued'], true);
      await Api.i.orderReady('o2');
      expect(Api.i.queued, 2);
      online = true;
      final sent = await Api.i.flushQueue();
      expect(sent, 2);
      expect(Api.i.queued, 0);
      final order = a.log.where((o) => o.method == 'PATCH' && o.path.contains('/ready')).map((o) => o.path).toList();
      expect(order.sublist(order.length - 2), ['/kitchen/orders/o1/ready', '/kitchen/orders/o2/ready']);
    });

    test('a rejected queued write is dropped, not retried forever', () async {
      var online = false;
      await setUpApi({'PATCH /kitchen/orders/o1/ready': (o) => online ? Reply({'detail': 'gone'}, status: 404) : throw NetDown()});
      await Api.i.orderReady('o1');
      online = true;
      await Api.i.flushQueue();
      expect(Api.i.queued, 0);
    });

    test('baseUrl prefers a custom server and trims slashes', () async {
      await setUpApi({}, prefs: {'marjon_server_url': 'http://10.0.0.5:8000/api/v1//'});
      expect(Api.i.baseUrl, 'http://10.0.0.5:8000/api/v1');
    });

    test('local desktop mode routes to port 8765', () async {
      await setUpApi({}, prefs: {'local_desktop_ip': '192.168.1.10'});
      expect(Api.i.baseUrl, 'http://192.168.1.10:8765/api/v1');
    });

    test('verifyPin uses the returned token without touching the session', () async {
      final a = await setUpApi({
        'POST /auth/pin-login': (o) => {'access_token': 'T-PIN'},
        'GET /auth/me': (o) => {'id': 'u1'},
      }, prefs: {'marjon_org_token': 'ORG', 'marjon_token': 'STAFF'});
      final me = await Api.i.verifyPin('1234', 'u1');
      expect(me['id'], 'u1');
      expect(Store.staffToken, 'STAFF');
      expect(a.calls('GET /auth/me').last.headers['Authorization'], 'Bearer T-PIN');
    });
  });

  group('Session', () {
    test('modeForRole picks the first known role', () {
      expect(Session.modeForRole({'role_slugs': ['kitchen']}), 'kitchen');
      expect(Session.modeForRole({'role_slugs': ['waiter']}), 'waiter');
      expect(Session.modeForRole({'role_slugs': ['courier']}), 'courier');
      expect(Session.modeForRole({'role_slugs': ['unknown']}), 'cashier');
      expect(Session.modeForRole(null), 'cashier');
    });

    test('login signs the employee straight into their own branch', () async {
      await setUpApi({
        'POST /auth/login': (o) => loginTokens(),
        'GET /auth/me': (o) => {'id': 'u1', 'name': 'Waiter', 'role_slugs': ['waiter'], 'branch_id': 'b1'},
        'GET /companies/me/branches': (o) => [
              {'id': 'b1', 'name': 'Central'},
            ],
      });
      final s = Session();
      await s.login('+998901112233', 'pw');
      expect(s.staffIn, true);
      expect(s.hasBranch, true);
      expect(s.branchId, 'b1');
      expect(s.branch?['name'], 'Central');
      expect(s.mode, 'waiter');
      expect(s.userName, 'Waiter');
      expect(Store.staffToken, 'T-1');
    });

    test('login falls back to the HR employee record when User.branch_id is unset', () async {
      // The real owner-panel staff editor only ever sends User.branch_id for the
      // monoblock role; cashier/waiter/kitchen/courier get their branch from a
      // separate HR Employee record instead.
      await setUpApi({
        'POST /auth/login': (o) => loginTokens(),
        'GET /auth/me': (o) => {'id': 'u1', 'name': 'Waiter', 'role_slugs': ['waiter'], 'branch_id': null},
        'GET /hr/employees/me': (o) => {'id': 'e1', 'branch_id': 'b1', 'position': 'Официант'},
        'GET /companies/me/branches': (o) => [
              {'id': 'b1', 'name': 'Central'},
            ],
      });
      final s = Session();
      await s.login('+998901112233', 'pw');
      expect(s.staffIn, true);
      expect(s.branchId, 'b1');
      expect(s.branch?['name'], 'Central');
    });

    test('wrong credentials surface the server error and leave the session out', () async {
      await setUpApi({'POST /auth/login': (o) => Reply({'detail': 'Неверный телефон или пароль'}, status: 401)});
      final s = Session();
      await expectLater(s.login('+998901112233', 'nope'), throwsA(predicate((e) => e is ApiError && e.message == 'Неверный телефон или пароль')));
      expect(s.staffIn, false);
      expect(Store.staffToken, isNull);
    });

    test('an account with no branch assigned is rejected', () async {
      await setUpApi({
        'POST /auth/login': (o) => loginTokens(),
        'GET /auth/me': (o) => {'id': 'u1', 'name': 'Waiter', 'role_slugs': ['waiter'], 'branch_id': null},
      });
      final s = Session();
      await expectLater(s.login('+998901112233', 'pw'), throwsA(isA<ApiError>()));
      expect(s.staffIn, false);
      expect(Store.staffToken, isNull);
    });

    test('logoutStaff clears everything — this device belongs to one employee', () async {
      await setUpApi({
        'POST /auth/login': (o) => loginTokens(),
        'GET /auth/me': (o) => {'id': 'u1', 'name': 'Waiter', 'role_slugs': ['waiter'], 'branch_id': 'b1'},
        'GET /companies/me/branches': (o) => [
              {'id': 'b1', 'name': 'Central'},
            ],
      });
      final s = Session();
      await s.login('+998901112233', 'pw');
      expect(s.staffIn, true);
      s.logoutStaff();
      expect(s.staffIn, false);
      expect(s.hasBranch, false);
      expect(s.staffUser, isNull);
      expect(Store.staffToken, isNull);
    });

    test('switchMode ignores unknown modes and persists valid ones', () async {
      await setUpApi({});
      final s = Session();
      s.switchMode('kitchen');
      expect(s.mode, 'kitchen');
      expect(Store.mode, 'kitchen');
      s.switchMode('hacker');
      expect(s.mode, 'kitchen');
    });

    test('setOnline notifies only on change', () async {
      await setUpApi({});
      final s = Session();
      var n = 0;
      s.addListener(() => n++);
      s.setOnline(true);
      expect(n, 0);
      s.setOnline(false);
      expect(n, 1);
      expect(s.online, false);
    });
  });
}
