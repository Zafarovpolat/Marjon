import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:marjon_mobile/core/theme.dart';
import 'package:marjon_mobile/widgets/common.dart';

void main() {
  // ── Pure-function tests ────────────────────────────────────────────────────

  group('fmtNum', () {
    test('formats integer string', () {
      expect(fmtNum('1234567'), '1 234 567');
    });
    test('formats double string with cents', () {
      expect(fmtNum('9900.50'), '9 901'); // rounds
    });
    test('handles null', () {
      expect(fmtNum(null), '0');
    });
    test('handles numeric value', () {
      expect(fmtNum(250000), '250 000');
    });
  });

  group('toDouble', () {
    test('parses string', () => expect(toDouble('3.14'), 3.14));
    test('returns double as-is', () => expect(toDouble(2.5), 2.5));
    test('returns 0 for null', () => expect(toDouble(null), 0.0));
  });

  group('toInt', () {
    test('parses string', () => expect(toInt('7'), 7));
    test('converts double', () => expect(toInt(3.9), 3));
    test('returns 0 for null', () => expect(toInt(null), 0));
  });

  group('orderStatusLabel', () {
    test('maps new', () => expect(orderStatusLabel('new'), 'Новый'));
    test('maps accepted', () => expect(orderStatusLabel('accepted'), 'Принят'));
    test('maps cooking', () => expect(orderStatusLabel('cooking'), 'Готовится'));
    test('maps ready', () => expect(orderStatusLabel('ready'), 'Готов'));
    test('maps completed', () => expect(orderStatusLabel('completed'), 'Закрыт'));
    test('maps cancelled', () => expect(orderStatusLabel('cancelled'), 'Отменён'));
    test('returns key unchanged for unknown status', () {
      expect(orderStatusLabel('__bad__'), '__bad__');
    });
  });

  group('waitTime', () {
    test('returns empty for null', () => expect(waitTime(null), ''));
    test('returns positive minutes', () {
      final iso = DateTime.now()
          .subtract(const Duration(minutes: 5))
          .toIso8601String();
      expect(waitTime(iso), '5 мин');
    });
  });

  group('waitColor', () {
    test('green for <10 min', () {
      final iso = DateTime.now()
          .subtract(const Duration(minutes: 3))
          .toIso8601String();
      expect(waitColor(iso), AppTheme.success);
    });
    test('yellow for 10-20 min', () {
      final iso = DateTime.now()
          .subtract(const Duration(minutes: 15))
          .toIso8601String();
      expect(waitColor(iso), AppTheme.warning);
    });
    test('red for >20 min', () {
      final iso = DateTime.now()
          .subtract(const Duration(minutes: 25))
          .toIso8601String();
      expect(waitColor(iso), AppTheme.danger);
    });
  });

  group('responsiveCols', () {
    test('2 cols on narrow phone', () => expect(responsiveCols(300), 2));
    test('3 cols on wide phone', () => expect(responsiveCols(620), 3));
    test('4 cols on tablet', () => expect(responsiveCols(900), 4));
  });

  // ── Widget tests ──────────────────────────────────────────────────────────

  Widget wrap(Widget child) => MaterialApp(
    theme: AppTheme.darkTheme,
    home: Scaffold(body: child),
  );

  group('EmptyState widget', () {
    testWidgets('renders icon and message', (tester) async {
      await tester.pumpWidget(wrap(
        const EmptyState(icon: Icons.inbox, message: 'Пусто'),
      ));
      expect(find.text('Пусто'), findsOneWidget);
      expect(find.byIcon(Icons.inbox), findsOneWidget);
    });
  });

  group('StatusBadge widget', () {
    testWidgets('shows Russian label for new', (tester) async {
      await tester.pumpWidget(wrap(const StatusBadge('new')));
      expect(find.text('Новый'), findsOneWidget);
    });
    testWidgets('shows Russian label for ready', (tester) async {
      await tester.pumpWidget(wrap(const StatusBadge('ready')));
      expect(find.text('Готов'), findsOneWidget);
    });
  });

  group('ResponsiveBox widget', () {
    testWidgets('centers content on wide screen', (tester) async {
      tester.view.physicalSize = const Size(1200, 900);
      tester.view.devicePixelRatio = 1.0;
      addTearDown(() {
        tester.view.resetPhysicalSize();
        tester.view.resetDevicePixelRatio();
      });
      await tester.pumpWidget(wrap(
        ResponsiveBox(child: const Text('content')),
      ));
      expect(find.text('content'), findsOneWidget);
      final box = tester.renderObject<RenderBox>(
        find.descendant(
          of: find.byType(ResponsiveBox),
          matching: find.byType(ConstrainedBox)).first,
      );
      expect(box.size.width, lessThanOrEqualTo(800));
    });

    testWidgets('fills width on phone', (tester) async {
      tester.view.physicalSize = const Size(360, 800);
      tester.view.devicePixelRatio = 1.0;
      addTearDown(() {
        tester.view.resetPhysicalSize();
        tester.view.resetDevicePixelRatio();
      });
      await tester.pumpWidget(wrap(
        ResponsiveBox(child: const Text('content')),
      ));
      expect(find.text('content'), findsOneWidget);
    });
  });

  group('LoadingCenter widget', () {
    testWidgets('shows CircularProgressIndicator', (tester) async {
      await tester.pumpWidget(wrap(const LoadingCenter()));
      expect(find.byType(CircularProgressIndicator), findsOneWidget);
    });
  });
}
