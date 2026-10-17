import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:marjon_owner/src/app.dart';
import 'package:marjon_owner/src/features/onboarding/onboarding_page.dart';
import 'package:marjon_owner/src/session.dart';
import 'package:provider/provider.dart';

import '../helpers.dart';

void main() {
  testWidgets('first launch shows onboarding before login, and finishing it reaches login', (tester) async {
    usePhone(tester);
    await setUpApi({}, prefs: {'seen_onboarding': false});
    final s = Session();
    await tester.runAsync(s.init);
    await tester.pumpWidget(ChangeNotifierProvider<Session>.value(value: s, child: const OwnerApp()));
    await tester.pump(const Duration(milliseconds: 400));
    expect(find.byType(OnboardingPage), findsOneWidget);
    expect(find.text('Войти'), findsNothing);

    await tester.tap(find.text('Пропустить'));
    await tester.pump(const Duration(milliseconds: 400));
    await tester.runAsync(() => Future<void>.delayed(const Duration(milliseconds: 50)));
    await tester.pump(const Duration(milliseconds: 400));
    expect(find.byType(OnboardingPage), findsNothing);
    expect(find.text('Войти'), findsOneWidget);
    expect(s.onboardingSeen, true);
  });
}
