import 'dart:async';
import 'dart:convert';

import 'package:web_socket_channel/web_socket_channel.dart';

import '../net/api.dart';

/// Real-time kitchen channel — port of desktop/src/services/kitchenWS.js.
/// Events: new_order | order_updated | order_cancelled | item_status_changed,
/// plus a synthetic `connection` event ({status: online|offline|error}).
class KitchenWs {
  KitchenWs._();
  static final KitchenWs i = KitchenWs._();

  static const _reconnect = Duration(seconds: 3);
  static const _pingEvery = Duration(seconds: 15);

  WebSocketChannel? _ch;
  StreamSubscription? _sub;
  Timer? _reconnectTimer;
  Timer? _pingTimer;
  ({String token, String branchId})? _params;
  bool connected = false;
  final Map<String, Set<void Function(dynamic)>> _listeners = {};

  void connect(String token, String branchId) {
    _params = (token: token, branchId: branchId);
    _open();
  }

  void _open() {
    final p = _params;
    if (p == null) return;
    _close(clear: false);
    final base = Api.i.baseUrl.replaceFirst(RegExp(r'^http'), 'ws').replaceFirst(RegExp(r'/api/v1/?$'), '');
    final uri = Uri.parse('$base/ws/kitchen?token=${p.token}&branch_id=${p.branchId}');
    try {
      _ch = WebSocketChannel.connect(uri);
    } catch (_) {
      _scheduleReconnect();
      return;
    }
    _ch!.ready.then((_) {
      connected = true;
      _emit('connection', {'status': 'online'});
      _pingTimer?.cancel();
      _pingTimer = Timer.periodic(_pingEvery, (_) {
        try {
          _ch?.sink.add('ping');
        } catch (_) {}
      });
    }).catchError((_) {
      connected = false;
      _emit('connection', {'status': 'error'});
      _scheduleReconnect();
    });
    _sub = _ch!.stream.listen((event) {
      if (event == 'pong') return;
      try {
        final msg = jsonDecode(event as String);
        if (msg is Map) _emit('${msg['type']}', msg['data']);
      } catch (_) {}
    }, onDone: () {
      connected = false;
      _pingTimer?.cancel();
      _emit('connection', {'status': 'offline'});
      _scheduleReconnect();
    }, onError: (_) {
      connected = false;
      _emit('connection', {'status': 'error'});
    });
  }

  void _scheduleReconnect() {
    _reconnectTimer?.cancel();
    if (_params == null) return;
    _reconnectTimer = Timer(_reconnect, _open);
  }

  void _close({required bool clear}) {
    _reconnectTimer?.cancel();
    _pingTimer?.cancel();
    _sub?.cancel();
    _sub = null;
    try {
      _ch?.sink.close();
    } catch (_) {}
    _ch = null;
    connected = false;
    if (clear) _params = null;
  }

  void disconnect() => _close(clear: true);

  /// Returns an unsubscribe function.
  void Function() on(String event, void Function(dynamic) cb) {
    _listeners.putIfAbsent(event, () => {}).add(cb);
    return () => _listeners[event]?.remove(cb);
  }

  void _emit(String event, dynamic data) {
    for (final cb in List.of(_listeners[event] ?? const {})) {
      try {
        cb(data);
      } catch (_) {}
    }
  }
}
