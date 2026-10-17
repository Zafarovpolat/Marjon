import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';

import '../helpers.dart';
import 'layout_sweep_test.dart' show pagesUnderTest;

// Whatever the server answers — nothing, a string, an empty object, an error page —
// no screen may crash. It must show its empty / error state instead.

final _payloads = <String, Object?>{
  'null body': null,
  'plain string': 'Bad Gateway',
  'empty object': <String, Object?>{},
  'empty list': <Object?>[],
  'list of junk': [1, 'a', null, true],
  'object with wrong types': {'items': 'nope', 'name': 5, 'price': 'abc', 'id': 7},
};

void main() {
  for (final p in _payloads.entries) {
    for (final e in pagesUnderTest().entries) {
      testWidgets('${e.key} survives "${p.key}"', (tester) async {
        tester.view.physicalSize = const Size(1080, 2400);
        tester.view.devicePixelRatio = 3;
        addTearDown(tester.view.resetPhysicalSize);
        addTearDown(tester.view.resetDevicePixelRatio);
        await setUpApi({
          'GET *': (o) => p.value,
          'POST *': (o) => p.value,
          'PATCH *': (o) => p.value,
        }, prefs: signedIn);
        await tester.pumpWidget(host(e.value()));
        await tester.pumpAndSettle();
      });
    }
  }

  for (final status in [401, 403, 404, 500, 502]) {
    for (final e in pagesUnderTest().entries) {
      testWidgets('${e.key} survives HTTP $status', (tester) async {
        tester.view.physicalSize = const Size(1080, 2400);
        tester.view.devicePixelRatio = 3;
        addTearDown(tester.view.resetPhysicalSize);
        addTearDown(tester.view.resetDevicePixelRatio);
        await setUpApi({
          'GET *': (o) => Reply({'detail': 'server said no'}, status: status),
          'POST /auth/refresh': (o) => Reply({'detail': 'no'}, status: 401),
        }, prefs: signedIn);
        await tester.pumpWidget(host(e.value()));
        await tester.pumpAndSettle();
      });
    }
  }

  for (final e in pagesUnderTest().entries) {
    testWidgets('${e.key} survives an unreachable server', (tester) async {
      tester.view.physicalSize = const Size(1080, 2400);
      tester.view.devicePixelRatio = 3;
      addTearDown(tester.view.resetPhysicalSize);
      addTearDown(tester.view.resetDevicePixelRatio);
      await setUpApi({'GET *': (o) => throw NetDown()}, prefs: signedIn);
      await tester.pumpWidget(host(e.value()));
      await tester.pumpAndSettle();
    });
  }
}
