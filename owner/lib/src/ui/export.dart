import 'dart:convert';
import 'dart:typed_data';

import 'package:flutter/material.dart';
import 'package:share_plus/share_plus.dart';

import 'kit.dart' show toast;

/// CSV export for report/finance tables — the mobile equivalent of the web
/// admin's "Excel" export buttons (frontend's `exportToExcel` utility).
/// Deliberately CSV, not a real .xlsx: no extra package/binary-format
/// dependency, and every spreadsheet app (Excel included) opens CSV
/// natively. Shared via the OS share sheet rather than written to a fixed
/// path — the user picks where it goes (save to Files, send to Telegram,
/// open directly in a spreadsheet app, etc.), matching how a mobile "export"
/// action is normally expected to behave.
String _csvCell(Object? value) {
  final s = value == null ? '' : '$value';
  if (s.contains(',') || s.contains('"') || s.contains('\n')) {
    return '"${s.replaceAll('"', '""')}"';
  }
  return s;
}

Future<void> exportRowsAsCsv(
  BuildContext context, {
  required String filename,
  required List<Map<String, dynamic>> rows,
  Map<String, String>? columnLabels,
}) async {
  if (rows.isEmpty) {
    toast(context, 'Нет данных для экспорта', error: true);
    return;
  }
  final keys = rows.first.keys.toList();
  final buffer = StringBuffer();
  buffer.writeln(keys.map((k) => _csvCell(columnLabels?[k] ?? k)).join(','));
  for (final row in rows) {
    buffer.writeln(keys.map((k) => _csvCell(row[k])).join(','));
  }
  // UTF-8 BOM so Excel (not just LibreOffice/Sheets) auto-detects Cyrillic
  // instead of mangling it into cp1252 garbage.
  final bytes = Uint8List.fromList([0xEF, 0xBB, 0xBF, ...utf8.encode(buffer.toString())]);
  final name = filename.endsWith('.csv') ? filename : '$filename.csv';
  await SharePlus.instance.share(ShareParams(
    files: [XFile.fromData(bytes, name: name, mimeType: 'text/csv')],
    fileNameOverrides: [name],
  ));
}
