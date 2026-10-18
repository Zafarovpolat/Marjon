import 'package:flutter/material.dart';
import 'package:flutter/services.dart';
import 'package:intl/date_symbol_data_local.dart';
import 'package:provider/provider.dart';

import 'src/app.dart';
import 'src/net/store.dart';
import 'src/session/session.dart';

Future<void> main() async {
  WidgetsFlutterBinding.ensureInitialized();
  await Store.init();
  await initializeDateFormatting('ru');
  await initializeDateFormatting('uz');
  SystemChrome.setSystemUIOverlayStyle(const SystemUiOverlayStyle(statusBarColor: Colors.transparent, statusBarIconBrightness: Brightness.dark));
  runApp(ChangeNotifierProvider(create: (_) => Session(), child: const MarjonApp()));
}
