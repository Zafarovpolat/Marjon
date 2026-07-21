import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:marjon_owner/widgets/common.dart';
import 'package:marjon_owner/core/theme.dart';

Widget _wrap(Widget child) => MaterialApp(theme: T.theme, home: Scaffold(body: child));

void main() {
  // ── fmtNum ──────────────────────────────────────────────────────────────────

  group('fmtNum', () {
    test('formats zero', () => expect(fmtNum(0), '0'));
    test('formats thousands with spaces', () => expect(fmtNum(1000000), '1 000 000'));
    test('compact: millions', () => expect(fmtNum(2500000, compact: true), '2.5M'));
    test('compact: thousands', () => expect(fmtNum(15000, compact: true), '15K'));
    test('compact: small', () => expect(fmtNum(500, compact: true), '500'));
  });

  // ── toDouble / toInt ─────────────────────────────────────────────────────────

  group('toDouble', () {
    test('null → 0', () => expect(toDouble(null), 0.0));
    test('string "3.5"', () => expect(toDouble('3.5'), 3.5));
    test('int 7', () => expect(toDouble(7), 7.0));
  });

  group('toInt', () {
    test('null → 0', () => expect(toInt(null), 0));
    test('double 3.9', () => expect(toInt(3.9), 3));
    test('string "42"', () => expect(toInt('42'), 42));
  });

  // ── fmtIsoDate ───────────────────────────────────────────────────────────────

  test('fmtIsoDate pads single-digit month and day', () {
    expect(fmtIsoDate(DateTime(2025, 1, 5)), '2025-01-05');
  });

  // ── ResponsiveBox ────────────────────────────────────────────────────────────

  group('ResponsiveBox', () {
    testWidgets('on phone width passes child through directly', (tester) async {
      tester.view.physicalSize = const Size(375, 812);
      tester.view.devicePixelRatio = 1.0;
      addTearDown(tester.view.resetPhysicalSize);

      await tester.pumpWidget(_wrap(
        ResponsiveBox(child: const Text('hello', key: ValueKey('txt'))),
      ));

      expect(find.byKey(const ValueKey('txt')), findsOneWidget);
      // No ConstrainedBox wrapping on phone
      expect(
        find.descendant(of: find.byType(Center), matching: find.byType(ConstrainedBox)),
        findsNothing,
      );
    });

    testWidgets('on tablet width wraps in Center + ConstrainedBox', (tester) async {
      tester.view.physicalSize = const Size(800, 1024);
      tester.view.devicePixelRatio = 1.0;
      addTearDown(tester.view.resetPhysicalSize);

      await tester.pumpWidget(_wrap(
        ResponsiveBox(child: const Text('hello', key: ValueKey('txt'))),
      ));

      expect(find.byKey(const ValueKey('txt')), findsOneWidget);
      expect(find.byType(ConstrainedBox), findsWidgets);
    });
  });

  // ── EmptyState ───────────────────────────────────────────────────────────────

  group('EmptyState', () {
    testWidgets('shows icon, message and sub', (tester) async {
      await tester.pumpWidget(_wrap(const EmptyState(
        icon: Icons.inbox,
        message: 'Нет данных',
        sub: 'Добавьте первую запись',
      )));

      expect(find.text('Нет данных'), findsOneWidget);
      expect(find.text('Добавьте первую запись'), findsOneWidget);
      expect(find.byIcon(Icons.inbox), findsOneWidget);
    });

    testWidgets('sub is optional', (tester) async {
      await tester.pumpWidget(_wrap(const EmptyState(
        icon: Icons.inbox,
        message: 'Нет данных',
      )));
      expect(find.text('Нет данных'), findsOneWidget);
    });
  });

  // ── SectionHeader ─────────────────────────────────────────────────────────────

  testWidgets('SectionHeader renders text', (tester) async {
    await tester.pumpWidget(_wrap(const SectionHeader('Популярные блюда')));
    expect(find.text('Популярные блюда'), findsOneWidget);
  });
}
