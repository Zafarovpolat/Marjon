import 'package:flutter/material.dart';

import '../../theme/tokens.dart';

/// Privacy policy shown from settings (required by the store listings).
class PrivacyPage extends StatelessWidget {
  const PrivacyPage({super.key});

  static const _sections = [
    ('1. Какие данные используются', 'Marjon Staff работает с данными вашего ресторана: заказы, меню, столы, смены и список сотрудников. Для входа используются логин филиала, пароль и PIN-код сотрудника. Приложение не собирает личные данные для рекламы и не запрашивает доступ к контактам, геолокации или камере.'),
    ('2. Где хранятся данные', 'Все данные хранятся на сервере Marjon вашей организации. Токены доступа сохраняются на устройстве и передаются только на сервер Marjon по защищённому соединению.'),
    ('3. Передача третьим лицам', 'Мы не продаём и не передаём данные третьим лицам. Приложение не содержит сторонних рекламных или аналитических SDK.'),
    ('4. Разрешения', 'Приложению нужен только доступ к сети.'),
    ('5. Удаление данных', 'Выход из приложения удаляет токены с устройства. Удаление учётной записи и данных организации выполняется по запросу владельца на support@marjon.tech.'),
    ('6. Контакты', 'По вопросам конфиденциальности: support@marjon.tech, https://marjon.tech'),
  ];

  @override
  Widget build(BuildContext context) => Scaffold(
        appBar: AppBar(title: const Text('Политика конфиденциальности')),
        body: ListView(padding: const EdgeInsets.all(20), children: [
          Text('Последнее обновление: сентябрь 2026', style: MT.small),
          const SizedBox(height: 20),
          for (final s in _sections)
            Padding(
              padding: const EdgeInsets.only(bottom: 18),
              child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
                Text(s.$1, style: MT.h2.copyWith(fontSize: 16)),
                const SizedBox(height: 6),
                Text(s.$2, style: MT.bodyMuted.copyWith(height: 1.5)),
              ]),
            ),
        ]),
      );
}
