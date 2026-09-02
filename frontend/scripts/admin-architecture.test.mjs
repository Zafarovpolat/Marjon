import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const frontendRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const adminRoot = path.join(frontendRoot, "src", "admin");
const legacyStylesPath = path.join(adminRoot, "styles.css");
const sharedDataStylesPath = path.join(adminRoot, "shared", "styles", "data-table.css");
const organizationsStylesPath = path.join(adminRoot, "features", "organizations", "organizations.css");
const LEGACY_STYLES_MAX_LINES = 24_980;

const failures = [];

function listFiles(directory) {
  return fs.readdirSync(directory, { withFileTypes: true }).flatMap((entry) => {
    const entryPath = path.join(directory, entry.name);
    return entry.isDirectory() ? listFiles(entryPath) : [entryPath];
  });
}

function relative(filePath) {
  return path.relative(frontendRoot, filePath).replaceAll("\\\\", "/");
}

function fail(message) {
  failures.push(message);
}

const legacyStyles = fs.readFileSync(legacyStylesPath, "utf8");
const sharedDataStyles = fs.readFileSync(sharedDataStylesPath, "utf8");
const organizationsStyles = fs.readFileSync(organizationsStylesPath, "utf8");
const legacyStyleLines = legacyStyles.split(/\r?\n/).length - (legacyStyles.endsWith("\n") ? 1 : 0);

const adminCssFiles = listFiles(adminRoot).filter((filePath) => filePath.endsWith(".css"));
for (const filePath of adminCssFiles) {
  const cssWithoutComments = fs.readFileSync(filePath, "utf8").replace(/\/\*[\s\S]*?\*\//g, "");
  if (/!important\b/.test(cssWithoutComments)) {
    fail(`${relative(filePath)} contains a production !important declaration`);
  }
}

if (legacyStyleLines > LEGACY_STYLES_MAX_LINES) {
  fail(
    `src/admin/styles.css grew to ${legacyStyleLines} lines; `
      + `the locked maximum is ${LEGACY_STYLES_MAX_LINES}. Put new styles in the owning feature.`,
  );
}

const legacyStylesWithoutComments = legacyStyles.replace(/\/\*[\s\S]*?\*\//g, "");
if (/\.(?:org-directory|org-status)-/.test(legacyStylesWithoutComments)) {
  fail("src/admin/styles.css still owns Organizations feature selectors");
}

if (!/\.admin-data-table\b/.test(sharedDataStyles) || !/\.admin-data-footer\b/.test(sharedDataStyles)) {
  fail("src/admin/shared/styles/data-table.css is missing the shared table or pagination primitives");
}

if (/\.(?:org-directory|org-status|admin-transactions)\b/.test(sharedDataStyles)) {
  fail("Shared data-table CSS contains feature-owned selectors");
}

if (/\.admin-transactions\b/.test(organizationsStyles)) {
  fail("Organizations CSS contains Dashboard transaction selectors");
}

const productionFiles = listFiles(adminRoot).filter((filePath) => (
  /\.(?:js|jsx)$/.test(filePath)
  && !/\.(?:test|spec)\.(?:js|jsx)$/.test(filePath)
));

const forbiddenDemoMarkers = [
  "187 450 000",
  "43 750 000",
  "958 892 000",
  "Демо-база клиентов",
  "demo-marjon-",
];

for (const filePath of productionFiles) {
  const source = fs.readFileSync(filePath, "utf8");
  const fileName = path.basename(filePath);
  const isApiBoundary = fileName === "hqService.js" || /Api\.js$/.test(fileName);

  if (!isApiBoundary && /import\s*\{[^}]*\badminApi\b[^}]*\}\s*from\s*["'][^"']+api["']/.test(source)) {
    fail(`${relative(filePath)} imports adminApi outside an API boundary`);
  }

  for (const marker of forbiddenDemoMarkers) {
    if (source.includes(marker)) {
      fail(`${relative(filePath)} contains forbidden demo marker: ${marker}`);
    }
  }

  if (/\b(?:LOCAL_)?ADMIN_(?:PHONE|PASSWORD)\b\s*=/.test(source)) {
    fail(`${relative(filePath)} contains a hardcoded admin credential`);
  }
}

const organizationsFeatureRoot = path.join(adminRoot, "features", "organizations");
for (const filePath of listFiles(organizationsFeatureRoot).filter((entry) => /\.(?:js|jsx)$/.test(entry))) {
  if (/\bhqService\b/.test(fs.readFileSync(filePath, "utf8"))) {
    fail(`${relative(filePath)} depends on the transitional hqService facade`);
  }
}

if (failures.length) {
  console.error("HQ architecture guardrails failed:\n");
  failures.forEach((message) => console.error(`- ${message}`));
  process.exit(1);
}

console.log(
  `HQ architecture guardrails passed (${productionFiles.length} production modules, `
    + `${adminCssFiles.length} CSS files, `
    + `${legacyStyleLines}/${LEGACY_STYLES_MAX_LINES} legacy CSS lines).`,
);
