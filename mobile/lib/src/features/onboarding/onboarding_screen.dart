import 'package:flutter/material.dart';

import '../../theme/tokens.dart';

/// Показывается один раз при первом запуске, до экрана входа в терминал:
/// функционал приложения виден без авторизации (требование ревью магазинов приложений).
class OnboardingScreen extends StatefulWidget {
  const OnboardingScreen({super.key, required this.onDone});
  final VoidCallback onDone;

  @override
  State<OnboardingScreen> createState() => _OnboardingScreenState();
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

class _PaymentMock extends StatelessWidget {
  const _PaymentMock();
  @override
  Widget build(BuildContext context) {
    Widget chip(String label, bool on) => Container(
          padding: const EdgeInsets.symmetric(horizontal: 10, vertical: 7),
          decoration: BoxDecoration(
            color: on ? MC.teal600 : MC.n100,
            borderRadius: BorderRadius.circular(99),
          ),
          child: Text(label, style: TextStyle(fontSize: 11, fontWeight: FontWeight.w700, color: on ? Colors.white : MC.textSecondary)),
        );
    return Column(mainAxisSize: MainAxisSize.min, children: [
      _Card(child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
        const Text('К оплате', style: TextStyle(fontSize: 11, color: MC.textMuted)),
        const SizedBox(height: 2),
        const Text('248 000 сум', style: TextStyle(fontSize: 22, fontWeight: FontWeight.w800, color: MC.textPrimary)),
      ])),
      const SizedBox(height: 10),
      Wrap(spacing: 8, runSpacing: 8, alignment: WrapAlignment.center, children: [
        chip('Наличные', false), chip('Карта', true), chip('Payme', false), chip('Click', false), chip('Uzum', false),
      ]),
    ]);
  }
}

class _OrderMock extends StatelessWidget {
  const _OrderMock();
  @override
  Widget build(BuildContext context) {
    Widget item(String name, int qty, String price) => Padding(
          padding: const EdgeInsets.symmetric(vertical: 6),
          child: Row(children: [
            Expanded(child: Text(name, style: const TextStyle(fontSize: 13, color: MC.textPrimary))),
            Container(
              width: 26, height: 26,
              decoration: BoxDecoration(color: MC.teal50, borderRadius: BorderRadius.circular(8)),
              alignment: Alignment.center,
              child: Text('$qty', style: const TextStyle(fontSize: 12, fontWeight: FontWeight.w700, color: MC.teal700)),
            ),
            const SizedBox(width: 10),
            SizedBox(width: 70, child: Text(price, textAlign: TextAlign.right,
                style: const TextStyle(fontSize: 12, fontWeight: FontWeight.w600, color: MC.textPrimary))),
          ]),
        );
    return Column(mainAxisSize: MainAxisSize.min, children: [
      _Card(child: Column(mainAxisSize: MainAxisSize.min, children: [
        item('Плов Ташкентский', 2, '70 000'),
        const Divider(height: 1, color: MC.borderLight),
        item('Мастава', 1, '35 000'),
        const Divider(height: 1, color: MC.borderLight),
        item('Салат Ачичук', 1, '15 000'),
      ])),
      const SizedBox(height: 10),
      Container(
        width: double.infinity,
        padding: const EdgeInsets.symmetric(vertical: 12),
        decoration: BoxDecoration(color: MC.teal600, borderRadius: BorderRadius.circular(14)),
        alignment: Alignment.center,
        child: const Text('На кухню · 120 000', style: TextStyle(fontSize: 13, fontWeight: FontWeight.w700, color: Colors.white)),
      ),
    ]);
  }
}

class _KitchenMock extends StatelessWidget {
  const _KitchenMock();
  @override
  Widget build(BuildContext context) {
    Widget ticket(String table, String items, Color c, String status) => Container(
          width: double.infinity,
          padding: const EdgeInsets.all(12),
          decoration: BoxDecoration(color: MC.card, borderRadius: BorderRadius.circular(14), border: Border(left: BorderSide(color: c, width: 4))),
          child: Row(children: [
            Expanded(child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
              Text(table, style: const TextStyle(fontSize: 12, fontWeight: FontWeight.w700, color: MC.textPrimary)),
              const SizedBox(height: 2),
              Text(items, style: const TextStyle(fontSize: 11, color: MC.textSecondary)),
            ])),
            Text(status, style: TextStyle(fontSize: 11, fontWeight: FontWeight.w700, color: c)),
          ]),
        );
    return Column(mainAxisSize: MainAxisSize.min, children: [
      ticket('Стол 05 · Плов ×2', 'Мастава, Салат', MC.purple500, 'Готовится'),
      const SizedBox(height: 8),
      ticket('Стол 02 · Шашлык ×3', 'Лагман', MC.amber500, 'Новый'),
      const SizedBox(height: 8),
      ticket('Доставка #1040', 'Чай зелёный ×2', MC.green500, 'Готов'),
    ]);
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

class _OnboardingScreenState extends State<OnboardingScreen> {
  final _controller = PageController();
  int _page = 0;

  static const _slides = [
    _Slide(Icons.storefront_rounded, MC.teal600, 'Marjon Staff',
        'Рабочий терминал для официантов, кассиров и кухни — весь ресторан в одном приложении на телефоне.', mock: _FloorMock.new),
    _Slide(Icons.point_of_sale_rounded, MC.success, 'Касса и оплата',
        'Пробивайте заказы, принимайте наличные, карту, Payme, Click, Uzum — и печатайте чек прямо с телефона.', mock: _PaymentMock.new),
    _Slide(Icons.table_restaurant_rounded, MC.purple500, 'Столы и заказы',
        'Открывайте стол, добавляйте блюда и отправляйте заказ на кухню одним касанием.', mock: _OrderMock.new),
    _Slide(Icons.soup_kitchen_rounded, MC.warning, 'Кухня и бар в реальном времени',
        'Новые заказы приходят мгновенно — готовьте и отмечайте блюда готовыми без бумажных талонов.', mock: _KitchenMock.new),
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

class _FloorMock extends StatelessWidget {
  const _FloorMock();

  @override
  Widget build(BuildContext context) {
    const tables = [
      ('01', 'Свободен', MC.green500),
      ('02', 'Занят · 2', MC.amber500),
      ('03', 'Готовится', MC.purple500),
      ('04', 'Свободен', MC.green500),
      ('05', 'Занят · 4', MC.amber500),
      ('06', 'Свободен', MC.green500),
    ];
    return Column(mainAxisSize: MainAxisSize.min, children: [
      GridView.count(
        shrinkWrap: true,
        physics: const NeverScrollableScrollPhysics(),
        crossAxisCount: 3,
        mainAxisSpacing: 10,
        crossAxisSpacing: 10,
        childAspectRatio: 1.3,
        children: [
          for (final t in tables)
            Container(
              decoration: BoxDecoration(
                color: t.$3.withValues(alpha: 0.12),
                borderRadius: BorderRadius.circular(14),
                border: Border.all(color: t.$3, width: 2),
              ),
              child: Column(mainAxisAlignment: MainAxisAlignment.center, children: [
                Text(t.$1, style: const TextStyle(fontSize: 15, fontWeight: FontWeight.w700, color: MC.textPrimary)),
                const SizedBox(height: 2),
                Text(t.$2, style: const TextStyle(fontSize: 10, color: MC.textSecondary)),
              ]),
            ),
        ],
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
