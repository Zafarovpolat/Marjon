import 'dart:async';

import 'package:flutter/services.dart';

import '../net/store.dart';

/// Kitchen alerts. The desktop synthesizes tones; on a phone we use the system
/// alert sound + haptics. Overdue orders repeat a soft alert until served.
class SoundService {
  SoundService._();
  static final SoundService i = SoundService._();

  final Map<String, Timer> _overdue = {};

  bool get enabled => Store.soundEnabled;
  set enabled(bool v) {
    Store.soundEnabled = v;
    if (!v) stopAll();
  }

  void play(String kind) {
    if (!enabled) return;
    switch (kind) {
      case 'newOrder':
        SystemSound.play(SystemSoundType.alert);
        HapticFeedback.mediumImpact();
      case 'orderCancelled':
        SystemSound.play(SystemSoundType.alert);
        HapticFeedback.heavyImpact();
      default:
        HapticFeedback.lightImpact();
    }
  }

  void startOverdue(String orderId) {
    if (!enabled || _overdue.containsKey(orderId)) return;
    _overdue[orderId] = Timer.periodic(const Duration(seconds: 30), (_) => SystemSound.play(SystemSoundType.click));
  }

  void stopOverdue(String orderId) => _overdue.remove(orderId)?.cancel();

  void stopAll() {
    for (final t in _overdue.values) {
      t.cancel();
    }
    _overdue.clear();
  }
}
