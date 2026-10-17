import '../net/store.dart';
import 'strings.g.dart';
import 'strings_mobile.dart';

String currentLang() => Store.lang == 'uz' ? 'uz' : 'ru';

/// Localized string by key (RU default, UZ optional). Unknown key -> the key itself.
String t(String key) {
  final l = Store.lang == 'uz' ? 'uz' : 'ru';
  return kMobileStrings[l]?[key] ?? kStrings[l]?[key] ?? kMobileStrings['ru']?[key] ?? kStrings['ru']?[key] ?? key;
}

String tStatus(String? s) => t('st_${s ?? 'new'}');
String tType(String? ty) => ty == 'qr' ? t('type_qr') : t(ty ?? 'dine_in');

String tRole(String? r) {
  final key = 'role_${(r ?? '').toLowerCase()}';
  final v = t(key);
  return v == key ? t('role_default') : v;
}
