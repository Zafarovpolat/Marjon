/**
 * Удаляет неиспользуемые локали Chromium из собранного приложения.
 *
 * Electron кладёт в locales/ около сорока .pak-файлов — переводы интерфейса
 * самого Chromium (контекстное меню, диалоги печати и т.п.) на все языки.
 * Приложению нужны русский и английский; остальные тридцать с лишним просто
 * занимают место в установщике.
 *
 * Делается в afterPack, а не через "files": locales лежат в дистрибутиве
 * Electron, а не в файлах приложения, и обычными исключениями не убираются.
 */
const fs = require("node:fs");
const path = require("node:path");

const KEEP = new Set(["en-US.pak", "ru.pak", "uz.pak"]);

exports.default = async function afterPack(context) {
  const dir = path.join(context.appOutDir, "locales");
  if (!fs.existsSync(dir)) {
    console.log("after-pack: каталога locales нет — пропускаю");
    return;
  }
  let removed = 0;
  let freed = 0;
  for (const name of fs.readdirSync(dir)) {
    if (!name.endsWith(".pak") || KEEP.has(name)) continue;
    const full = path.join(dir, name);
    freed += fs.statSync(full).size;
    fs.unlinkSync(full);
    removed++;
  }
  const kept = fs.readdirSync(dir).filter((f) => f.endsWith(".pak"));
  console.log(
    `after-pack: удалено локалей ${removed} (${(freed / 1024 / 1024).toFixed(1)} МБ), ` +
    `оставлено ${kept.length}: ${kept.join(", ")}`
  );
};
