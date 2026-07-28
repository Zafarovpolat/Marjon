import 'package:flutter/material.dart';
import '../core/theme.dart';

class PrivacyPolicyPage extends StatelessWidget {
  const PrivacyPolicyPage({super.key});

  @override
  Widget build(BuildContext context) => Scaffold(
    backgroundColor: AppTheme.bg,
    appBar: AppBar(title: const Text('Политика конфиденциальности')),
    body: const SingleChildScrollView(
      padding: EdgeInsets.all(20),
      child: _PolicyContent(),
    ),
  );
}

class _PolicyContent extends StatelessWidget {
  const _PolicyContent();

  @override
  Widget build(BuildContext context) => Column(
    crossAxisAlignment: CrossAxisAlignment.start,
    children: const [
      Text('Политика конфиденциальности',
        style: TextStyle(fontSize: 20, fontWeight: FontWeight.w800, color: AppTheme.textColor)),
      SizedBox(height: 8),
      Text('Последнее обновление: январь 2025',
        style: TextStyle(fontSize: 12, color: AppTheme.textMuted)),
      SizedBox(height: 24),

      _Section('1. Сбор данных',
        'Приложение Marjon Terminal собирает только данные, необходимые для работы с вашим рестораном: адрес сервера, email и пароль для входа. Эти данные хранятся локально на устройстве и используются только для подключения к вашему серверу Marjon.'),

      _Section('2. Использование данных',
        'Мы не передаём ваши данные третьим лицам. Все данные (заказы, меню, столы) хранятся на вашем сервере. Разработчики приложения не имеют доступа к вашим бизнес-данным.'),

      _Section('3. Хранение данных',
        'Учётные данные (токен авторизации, адрес сервера) хранятся в защищённом хранилище устройства. Они не передаются за пределы устройства, кроме как на ваш собственный сервер.'),

      _Section('4. Аналитика',
        'Приложение не использует сторонние аналитические SDK. Мы не собираем статистику использования приложения.'),

      _Section('5. Разрешения',
        'Приложение запрашивает только доступ к сети (для подключения к серверу). Никаких других разрешений не требуется.'),

      _Section('6. Безопасность',
        'Рекомендуем использовать HTTPS на вашем сервере. Приложение не хранит пароли в открытом виде.'),

      _Section('7. Контакт',
        'По вопросам конфиденциальности: support@marjon.uz'),

      SizedBox(height: 32),
    ],
  );
}

class _Section extends StatelessWidget {
  final String title, body;
  const _Section(this.title, this.body);

  @override
  Widget build(BuildContext context) => Padding(
    padding: const EdgeInsets.only(bottom: 20),
    child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
      Text(title, style: const TextStyle(
        fontSize: 15, fontWeight: FontWeight.w700, color: AppTheme.textColor)),
      const SizedBox(height: 6),
      Text(body, style: const TextStyle(
        fontSize: 14, color: AppTheme.textMuted, height: 1.55)),
    ]),
  );
}
