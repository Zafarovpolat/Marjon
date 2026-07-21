import 'package:flutter/material.dart';
import '../core/theme.dart';

class PrivacyPolicyPage extends StatelessWidget {
  const PrivacyPolicyPage({super.key});

  @override
  Widget build(BuildContext context) => Scaffold(
    backgroundColor: T.bg,
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
        style: TextStyle(fontSize: 20, fontWeight: FontWeight.w800, color: T.text)),
      SizedBox(height: 8),
      Text('Последнее обновление: январь 2025',
        style: TextStyle(fontSize: 12, color: T.muted)),
      SizedBox(height: 24),

      _Section('1. Сбор данных',
        'Приложение Marjon Owner собирает только те данные, которые необходимы для работы с вашим рестораном: адрес сервера, email и пароль для входа. Эти данные хранятся локально на вашем устройстве и используются исключительно для подключения к вашему серверу Marjon.'),

      _Section('2. Использование данных',
        'Мы не передаём ваши данные третьим лицам. Все данные (заказы, меню, финансы, отчёты) хранятся на вашем собственном сервере, к которому вы подключаетесь. Anthropic и разработчики приложения не имеют доступа к вашим бизнес-данным.'),

      _Section('3. Хранение данных',
        'Учётные данные (адрес сервера и токен авторизации) хранятся в защищённом хранилище устройства (SharedPreferences с шифрованием на уровне ОС). Они не передаются за пределы вашего устройства, кроме как на ваш собственный сервер.'),

      _Section('4. Аналитика и трекинг',
        'Приложение не использует сторонние аналитические SDK, счётчики или системы трекинга пользователей. Мы не собираем статистику использования приложения.'),

      _Section('5. Разрешения',
        'Приложение запрашивает только разрешение на доступ к сети (для подключения к вашему серверу). Никаких других разрешений (камера, геолокация, контакты и т.д.) не требуется.'),

      _Section('6. Безопасность',
        'Соединение с сервером осуществляется по протоколу HTTPS. Мы рекомендуем настраивать ваш сервер с валидным SSL-сертификатом. Приложение не хранит пароли в открытом виде.'),

      _Section('7. Контакт',
        'По вопросам конфиденциальности обращайтесь: support@marjon.uz'),

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
        fontSize: 15, fontWeight: FontWeight.w700, color: T.text)),
      const SizedBox(height: 6),
      Text(body, style: const TextStyle(
        fontSize: 14, color: T.muted, height: 1.55)),
    ]),
  );
}
