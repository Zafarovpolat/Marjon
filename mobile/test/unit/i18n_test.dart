import 'package:flutter_test/flutter_test.dart';
import 'package:marjon_mobile/src/i18n/strings.dart';
import 'package:marjon_mobile/src/i18n/strings.g.dart';
import 'package:marjon_mobile/src/i18n/strings_mobile.dart';
import 'package:marjon_mobile/src/net/store.dart';

import '../helpers.dart';

void main() {
  test('every Russian key has an Uzbek translation', () {
    final missing = kStrings['ru']!.keys.where((k) => !kStrings['uz']!.containsKey(k)).toList();
    expect(missing, isEmpty, reason: 'missing uz keys: $missing');
  });

  test('mobile-only strings exist in both languages', () {
    expect(kMobileStrings['ru']!.keys.toSet(), kMobileStrings['uz']!.keys.toSet());
  });

  test('no empty translations', () {
    for (final l in ['ru', 'uz']) {
      final empty = kStrings[l]!.entries.where((e) => e.value.trim().isEmpty).map((e) => e.key).toList();
      expect(empty, isEmpty, reason: '$l has empty values: $empty');
    }
  });

  test('t() falls back to the key and follows the language', () async {
    await setUpApi({});
    expect(t('definitely_not_a_key'), 'definitely_not_a_key');
    expect(t('currency'), 'сум');
    Store.lang = 'uz';
    expect(currentLang(), 'uz');
    expect(t('currency'), isNot('сум'));
    Store.lang = 'ru';
  });

  test('tRole falls back to the default role label', () async {
    await setUpApi({});
    expect(tRole('cashier'), t('role_cashier'));
    expect(tRole('galactic-emperor'), t('role_default'));
  });

  test('tType maps qr and dine_in', () async {
    await setUpApi({});
    expect(tType('qr'), t('type_qr'));
    expect(tType(null), t('dine_in'));
  });
}
