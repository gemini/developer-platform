import assert from "node:assert/strict";
import { readFileSync, writeFileSync } from "node:fs";
import { relative, resolve } from "node:path";
import ts from "typescript";

const dist = resolve("dist");
const snapshotPath = resolve("scripts/api-surface.snapshot.json");
const packageJson = JSON.parse(readFileSync(resolve("package.json"), "utf8"));

function publicDeclarationFiles() {
  return ["browser/index.d.ts", "server/index.d.ts", "observability/opentelemetry.d.ts"].map((path) => resolve(dist, path));
}

const declarationFiles = publicDeclarationFiles();
const program = ts.createProgram(declarationFiles, {
  allowJs: false,
  module: ts.ModuleKind.NodeNext,
  moduleResolution: ts.ModuleResolutionKind.NodeNext,
  skipLibCheck: true,
  target: ts.ScriptTarget.Latest,
});
const checker = program.getTypeChecker();

function declarationAst(path) {
  const source = program.getSourceFile(path);
  const moduleSymbol = source && checker.getSymbolAtLocation(source);
  if (!moduleSymbol) throw new Error(`unable to resolve public module ${path}`);
  return checker.getExportsOfModule(moduleSymbol)
    .sort((left, right) => left.getName().localeCompare(right.getName()))
    .map((symbol) => {
      const resolved = symbol.flags & ts.SymbolFlags.Alias ? checker.getAliasedSymbol(symbol) : symbol;
      const declarations = resolved.declarations ?? symbol.declarations ?? [];
      return {
        kind: declarations[0] ? ts.SyntaxKind[declarations[0].kind] : "unknown",
        name: symbol.getName(),
        declaration: declarations.map((declaration) =>
          declaration.getText().replace(/\s+/gu, " ").trim()).join(" | "),
      };
    });
}

const current = {
  exports: Object.keys(packageJson.exports).sort(),
  declarations: Object.fromEntries(
    declarationFiles
      .map((path) => [relative(dist, path), declarationAst(path)]),
  ),
};

if (process.argv.includes("--update")) {
  writeFileSync(snapshotPath, `${JSON.stringify(current, null, 2)}\n`);
  console.log(`updated ${relative(process.cwd(), snapshotPath)}`);
  process.exit(0);
}

const expected = JSON.parse(readFileSync(snapshotPath, "utf8"));
assert.deepEqual(current.exports, expected.exports, "package export keys changed");

const expectedDeclarations = expected.declarations;
const currentDeclarations = current.declarations;
const added = Object.keys(currentDeclarations).filter((path) => !(path in expectedDeclarations));
const removed = Object.keys(expectedDeclarations).filter((path) => !(path in currentDeclarations));
const changed = Object.keys(currentDeclarations).filter(
  (path) => path in expectedDeclarations &&
    JSON.stringify(currentDeclarations[path]) !== JSON.stringify(expectedDeclarations[path]),
);

if (added.length || removed.length || changed.length) {
  console.error("public declaration surface changed:");
  for (const path of added) console.error(`  added: ${path}`);
  for (const path of removed) console.error(`  removed: ${path}`);
  for (const path of changed) console.error(`  changed: ${path}`);
  console.error("Review the declaration diff, then update scripts/api-surface.snapshot.json intentionally.");
  process.exit(1);
}

console.log(`API surface unchanged: ${Object.keys(currentDeclarations).length} declaration files`);
