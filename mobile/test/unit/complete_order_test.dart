import 'package:flutter_test/flutter_test.dart';
import 'package:marjon_mobile/src/net/api.dart';

import '../helpers.dart';

// The backend state machine: new -> (accepted|cooking) -> ready -> completed (cancelled is final).

void main() {
  Future<List<String>> run(String status) async {
    final sent = <String>[];
    final a = await setUpApi({
      'GET /pos/orders/o1': (o) => {'id': 'o1', 'status': status},
      'PATCH /pos/orders/o1/status': (o) {
        sent.add((o.data as Map)['status'] as String);
        return {};
      },
    });
    await Api.i.completeOrder('o1');
    expect(a.calls('PATCH /pos/orders/o1/status').length, sent.length);
    return sent;
  }

  test('a new order is walked through cooking and ready before completing', () async => expect(await run('new'), ['cooking', 'ready', 'completed']));
  test('an accepted order goes cooking -> ready -> completed', () async => expect(await run('accepted'), ['cooking', 'ready', 'completed']));
  test('a cooking order goes ready -> completed', () async => expect(await run('cooking'), ['ready', 'completed']));
  test('a ready order is simply completed', () async => expect(await run('ready'), ['completed']));
  test('an already completed order sends nothing', () async => expect(await run('completed'), isEmpty));

  test('a cancelled order cannot be completed', () async {
    await setUpApi({'GET /pos/orders/o1': (o) => {'id': 'o1', 'status': 'cancelled'}});
    await expectLater(Api.i.completeOrder('o1'), throwsA(isA<ApiError>()));
  });

  test('a rejected step stops the chain and reports the reason', () async {
    final sent = <String>[];
    await setUpApi({
      'GET /pos/orders/o1': (o) => {'id': 'o1', 'status': 'new'},
      'PATCH /pos/orders/o1/status': (o) {
        sent.add((o.data as Map)['status'] as String);
        return Reply({'detail': 'Невозможно перевести'}, status: 422);
      },
    });
    await expectLater(Api.i.completeOrder('o1'), throwsA(predicate((e) => e is ApiError && e.message.contains('Невозможно'))));
    expect(sent, ['cooking']);
  });

  test('offline: the whole chain is queued in order', () async {
    await setUpApi({'GET /pos/orders/o1': (o) => throw NetDown(), 'PATCH /pos/orders/o1/status': (o) => throw NetDown()});
    await Api.i.completeOrder('o1');
    expect(Api.i.queued, 3);
  });
}
