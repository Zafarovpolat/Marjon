const _ru = {
  'currency': 'сум',
  'free': 'Свободен',
  'busy': 'Занят',
  'ready': 'Готово',
  'retry': 'Повторить',
};

String t(String key) => _ru[key] ?? key;
