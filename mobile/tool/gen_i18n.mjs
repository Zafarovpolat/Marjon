import fs from "fs";
import vm from "vm";

const src = fs.readFileSync("../desktop/src/shared/i18n.js", "utf8");
const start = src.indexOf("const DICT = {");
const end = src.indexOf("export function lang()");
const code = src.slice(start, end).replace("const DICT =", "DICT =");
const ctx = { DICT: null };
vm.runInNewContext(code, ctx);
const dict = ctx.DICT;

const q = (s) => "'" + String(s).replace(/\\/g, "\\\\").replace(/'/g, "\\'").replace(/\$/g, "\\$").replace(/\n/g, "\\n") + "'";
let out = "// GENERATED from desktop/src/shared/i18n.js — do not edit by hand.\n";
out += "// Run: cd mobile && node tool/gen_i18n.mjs\n\n";
out += "const Map<String, Map<String, String>> kStrings = {\n";
for (const lang of Object.keys(dict)) {
  out += `  '${lang}': {\n`;
  for (const [k, v] of Object.entries(dict[lang])) out += `    ${q(k)}: ${q(v)},\n`;
  out += "  },\n";
}
out += "};\n";
fs.mkdirSync("lib/src/i18n", { recursive: true });
fs.writeFileSync("lib/src/i18n/strings.g.dart", out);
console.log(Object.keys(dict).map((l) => `${l}: ${Object.keys(dict[l]).length}`).join(", "));
