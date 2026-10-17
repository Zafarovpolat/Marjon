import 'package:flutter/material.dart';

import '../../theme/tokens.dart';

/// Показывается один раз при первом запуске, до экрана входа: функционал
/// приложения виден без авторизации (требование ревью магазинов приложений).
class OnboardingPage extends StatefulWidget {
  const OnboardingPage({super.key, required this.onDone});
  final VoidCallback onDone;

  @override
  State<OnboardingPage> createState() => _OnboardingPageState();
}

class _Pill extends StatelessWidget {
  const _Pill(this.text, this.bg, this.fg);
  final String text;
  final Color bg;
  final Color fg;
  @override
  Widget build(BuildContext context) => Container(
        padding: const EdgeInsets.symmetric(horizontal: 8, vertical: 3),
        decoration: BoxDecoration(color: bg, borderRadius: BorderRadius.circular(99)),
        child: Text(text, style: TextStyle(fontSize: 10, fontWeight: FontWeight.w700, color: fg)),
      );
}

class _Card extends StatelessWidget {
  const _Card({required this.child});
  final Widget child;
  @override
  Widget build(BuildContext context) => Container(
        width: double.infinity,
        padding: const EdgeInsets.all(12),
        decoration: BoxDecoration(color: MC.card, borderRadius: BorderRadius.circular(16), border: Border.all(color: MC.border)),
        child: child,
      );
}

class _OrdersMock extends StatelessWidget {
  const _OrdersMock();
  @override
  Widget build(BuildContext context) {
    Widget row(String num, String table, String sum, Widget status) => Padding(
          padding: const EdgeInsets.symmetric(vertical: 6),
          child: Row(children: [
            Text('#$num', style: const TextStyle(fontSize: 13, fontWeight: FontWeight.w700, color: MC.textPrimary)),
            const SizedBox(width: 10),
            Expanded(child: Text(table, style: const TextStyle(fontSize: 12, color: MC.textSecondary))),
            Text(sum, style: const TextStyle(fontSize: 12, fontWeight: FontWeight.w600, color: MC.textPrimary)),
            const SizedBox(width: 8),
            status,
          ]),
        );
    return _Card(
      child: Column(mainAxisSize: MainAxisSize.min, children: [
        row('1042', 'Стол 05', '248 000', const _Pill('Готовится', MC.amber100, MC.amber700)),
        const Divider(height: 1, color: MC.borderLight),
        row('1041', 'Стол 02', '132 000', const _Pill('Готов', MC.teal50, MC.teal700)),
        const Divider(height: 1, color: MC.borderLight),
        row('1040', 'Доставка', '96 000', const _Pill('Закрыт', MC.green100, MC.green600)),
      ]),
    );
  }
}

class _StaffMock extends StatelessWidget {
  const _StaffMock();
  @override
  Widget build(BuildContext context) {
    Widget avatar(String initials, Color c) => Container(
          width: 40, height: 40,
          decoration: BoxDecoration(color: c.withValues(alpha: 0.15), shape: BoxShape.circle),
          alignment: Alignment.center,
          child: Text(initials, style: TextStyle(fontSize: 13, fontWeight: FontWeight.w700, color: c)),
        );
    return Column(mainAxisSize: MainAxisSize.min, children: [
      _Card(child: Row(children: [
        const Expanded(child: Text('Главный филиал', style: TextStyle(fontSize: 13, fontWeight: FontWeight.w700, color: MC.textPrimary))),
        _Pill('Чиланзар', MC.teal50, MC.teal700),
      ])),
      const SizedBox(height: 10),
      _Card(child: Row(mainAxisAlignment: MainAxisAlignment.spaceAround, children: [
        avatar('АЮ', MC.teal600),
        avatar('БР', MC.purple500),
        avatar('ОН', MC.blue500),
        avatar('НИ', MC.green500),
        avatar('+7', MC.textMuted),
      ])),
    ]);
  }
}

class _FinanceMock extends StatelessWidget {
  const _FinanceMock();
  @override
  Widget build(BuildContext context) {
    const income = [0.55, 0.70, 0.48, 0.90, 0.75, 0.95, 0.60];
    const expense = [0.30, 0.35, 0.40, 0.42, 0.28, 0.50, 0.33];
    return _Card(
      child: SizedBox(
        height: 120,
        child: Row(crossAxisAlignment: CrossAxisAlignment.end, children: [
          for (var i = 0; i < income.length; i++) ...[
            Expanded(child: Row(crossAxisAlignment: CrossAxisAlignment.end, children: [
              Expanded(child: FractionallySizedBox(heightFactor: income[i], alignment: Alignment.bottomCenter,
                  child: Container(decoration: const BoxDecoration(color: MC.green500, borderRadius: BorderRadius.vertical(top: Radius.circular(4)))))),
              const SizedBox(width: 2),
              Expanded(child: FractionallySizedBox(heightFactor: expense[i], alignment: Alignment.bottomCenter,
                  child: Container(decoration: const BoxDecoration(color: MC.red500, borderRadius: BorderRadius.vertical(top: Radius.circular(4)))))),
            ])),
            if (i < income.length - 1) const SizedBox(width: 4),
          ],
        ]),
      ),
    );
  }
}

class _TopDishesMock extends StatelessWidget {
  const _TopDishesMock();
  @override
  Widget build(BuildContext context) {
    const dishes = [
      ('Плов Ташкентский', 0.92, '1 240 000', MC.teal600),
      ('Мастава', 0.68, '910 000', MC.blue500),
      ('Шашлык из баранины', 0.55, '740 000', MC.purple500),
      ('Лагман', 0.38, '510 000', MC.amber500),
    ];
    return _Card(
      child: Column(crossAxisAlignment: CrossAxisAlignment.start, mainAxisSize: MainAxisSize.min, children: [
        const Text('Топ блюд по выручке', style: TextStyle(fontSize: 12, fontWeight: FontWeight.w700, color: MC.textPrimary)),
        const SizedBox(height: 10),
        for (final d in dishes) ...[
          Row(children: [
            Expanded(child: Text(d.$1, maxLines: 1, overflow: TextOverflow.ellipsis,
                style: const TextStyle(fontSize: 11, color: MC.textSecondary))),
            Text(d.$3, style: const TextStyle(fontSize: 11, fontWeight: FontWeight.w700, color: MC.textPrimary)),
          ]),
          const SizedBox(height: 4),
          ClipRRect(
            borderRadius: BorderRadius.circular(4),
            child: LinearProgressIndicator(value: d.$2, minHeight: 8, color: d.$4, backgroundColor: MC.n100),
          ),
          const SizedBox(height: 8),
        ],
      ]),
    );
  }
}

class _Slide {
  const _Slide(this.icon, this.color, this.title, this.text, {this.mock});
  final IconData icon;
  final Color color;
  final String title;
  final String text;
  final Widget Function()? mock;
}

class _OnboardingPageState extends State<OnboardingPage> {
  final _controller = PageController();
  int _page = 0;

  static const _slides = [
    _Slide(Icons.storefront_rounded, MC.teal600, 'Marjon Owner',
        'Управляйте рестораном или кафе из одного приложения — на телефоне, где бы вы ни были.', mock: _DashboardMock.new),
    _Slide(Icons.analytics_rounded, MC.blue500, 'Дашборд и аналитика',
        'Выручка, средний чек, приход и расход — в реальном времени, с графиками динамики продаж.', mock: _TopDishesMock.new),
    _Slide(Icons.receipt_long_rounded, MC.purple500, 'Заказы и чеки',
        'История заказов и статусов, кастомизация внешнего вида чека и печать — ровно то, что уйдёт на принтер.', mock: _OrdersMock.new),
    _Slide(Icons.people_alt_rounded, MC.green500, 'Персонал и филиалы',
        'Сотрудники, залы и столы нескольких точек — управление без привлечения разработчиков.', mock: _StaffMock.new),
    _Slide(Icons.account_balance_wallet_rounded, MC.amber500, 'Финансы и оплата',
        'Доходы, расходы и приём платежей через Payme, Click, Uzum — всё в одном месте.', mock: _FinanceMock.new),
  ];

  @override
  void dispose() {
    _controller.dispose();
    super.dispose();
  }

  void _next() {
    if (_page < _slides.length - 1) {
      _controller.nextPage(duration: const Duration(milliseconds: 280), curve: Curves.easeOut);
    } else {
      widget.onDone();
    }
  }

  @override
  Widget build(BuildContext context) {
    final isLast = _page == _slides.length - 1;
    return Scaffold(
      backgroundColor: MC.bg,
      body: SafeArea(
        child: Column(children: [
          Align(
            alignment: Alignment.topRight,
            child: Padding(
              padding: const EdgeInsets.symmetric(horizontal: 12, vertical: 4),
              child: TextButton(
                onPressed: widget.onDone,
                child: const Text('Пропустить', style: TextStyle(color: MC.textMuted, fontWeight: FontWeight.w600)),
              ),
            ),
          ),
          Expanded(
            child: PageView.builder(
              controller: _controller,
              itemCount: _slides.length,
              onPageChanged: (i) => setState(() => _page = i),
              itemBuilder: (context, i) => _SlideView(slide: _slides[i]),
            ),
          ),
          Padding(
            padding: const EdgeInsets.fromLTRB(24, 8, 24, 28),
            child: Column(children: [
              Row(
                mainAxisAlignment: MainAxisAlignment.center,
                children: List.generate(_slides.length, (i) => AnimatedContainer(
                  duration: const Duration(milliseconds: 200),
                  margin: const EdgeInsets.symmetric(horizontal: 4),
                  width: i == _page ? 22 : 7,
                  height: 7,
                  decoration: BoxDecoration(
                    color: i == _page ? MC.teal600 : MC.border,
                    borderRadius: BorderRadius.circular(4),
                  ),
                )),
              ),
              const SizedBox(height: 20),
              SizedBox(
                width: double.infinity,
                child: ElevatedButton(
                  onPressed: _next,
                  style: ElevatedButton.styleFrom(padding: const EdgeInsets.symmetric(vertical: 14)),
                  child: Text(isLast ? 'Начать' : 'Далее', style: const TextStyle(fontSize: 15, fontWeight: FontWeight.w600)),
                ),
              ),
            ]),
          ),
        ]),
      ),
    );
  }
}

class _DashboardMock extends StatelessWidget {
  const _DashboardMock();

  @override
  Widget build(BuildContext context) {
    const bars = [0.45, 0.62, 0.38, 0.80, 0.70, 0.92, 0.60];
    Widget kpi(String label, String value) => Expanded(
          child: Container(
            padding: const EdgeInsets.all(10),
            decoration: BoxDecoration(color: MC.card, borderRadius: BorderRadius.circular(14), border: Border.all(color: MC.border)),
            child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
              Text(label, style: const TextStyle(fontSize: 10, color: MC.textMuted)),
              const SizedBox(height: 4),
              FittedBox(fit: BoxFit.scaleDown, alignment: Alignment.centerLeft,
                  child: Text(value, style: const TextStyle(fontSize: 14, fontWeight: FontWeight.w700, color: MC.textPrimary))),
            ]),
          ),
        );
    return Column(mainAxisSize: MainAxisSize.min, children: [
      Row(children: [kpi('Выручка', '12 480 000'), const SizedBox(width: 8), kpi('Средний чек', '86 000'), const SizedBox(width: 8), kpi('Заказы', '145')]),
      const SizedBox(height: 10),
      Container(
        padding: const EdgeInsets.all(12),
        decoration: BoxDecoration(color: MC.card, borderRadius: BorderRadius.circular(16), border: Border.all(color: MC.border)),
        child: SizedBox(
          height: 96,
          child: Row(crossAxisAlignment: CrossAxisAlignment.end, children: [
            for (var i = 0; i < bars.length; i++) ...[
              Expanded(child: FractionallySizedBox(
                heightFactor: bars[i],
                alignment: Alignment.bottomCenter,
                child: Container(decoration: BoxDecoration(
                  color: i == 2 || i == 5 ? MC.purple500 : MC.teal600,
                  borderRadius: const BorderRadius.vertical(top: Radius.circular(6)),
                )),
              )),
              if (i < bars.length - 1) const SizedBox(width: 6),
            ],
          ]),
        ),
      ),
    ]);
  }
}

class _SlideView extends StatelessWidget {
  const _SlideView({required this.slide});
  final _Slide slide;

  @override
  Widget build(BuildContext context) => Padding(
        padding: const EdgeInsets.symmetric(horizontal: 32),
        child: Column(
          mainAxisAlignment: MainAxisAlignment.center,
          children: [
            if (slide.mock != null) ...[
              slide.mock!(),
              const SizedBox(height: 28),
            ] else ...[
              Container(
                width: 132,
                height: 132,
                decoration: BoxDecoration(color: slide.color.withValues(alpha: 0.12), shape: BoxShape.circle),
                child: Icon(slide.icon, size: 62, color: slide.color),
              ),
              const SizedBox(height: 36),
            ],
            Text(slide.title,
                textAlign: TextAlign.center,
                style: const TextStyle(fontSize: 24, fontWeight: FontWeight.bold, color: MC.textPrimary)),
            const SizedBox(height: 14),
            Text(slide.text,
                textAlign: TextAlign.center,
                style: const TextStyle(fontSize: 15, color: MC.textMuted, height: 1.5)),
          ],
        ),
      );
}
