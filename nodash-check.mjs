/**
 * House style: no em dashes in anything a person reads on screen.
 *
 * Walks the TypeScript AST, so it only looks at string literals, template text
 * and JSX text. Comments are free to use them. index.html is checked as plain
 * text, since its title and description show up in tabs and search results.
 *
 * Run: node nodash-check.mjs
 */
import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join, relative } from 'node:path';
import ts from 'typescript';

const root = new URL('./', import.meta.url).pathname.replace(/^\/([A-Za-z]:)/, '$1');
const DASH = '—';
const hits = [];

const files = [];
(function walk(dir) {
  for (const name of readdirSync(dir)) {
    const p = join(dir, name);
    if (statSync(p).isDirectory()) walk(p);
    else if (/\.(tsx?|jsx?)$/.test(name)) files.push(p);
  }
})(join(root, 'src'));

const K = ts.SyntaxKind;
const TEXT = new Set([K.StringLiteral, K.NoSubstitutionTemplateLiteral, K.TemplateHead, K.TemplateMiddle, K.TemplateTail, K.JsxText]);

for (const file of files) {
  const text = readFileSync(file, 'utf8');
  if (!text.includes(DASH)) continue;
  const kind = /x$/.test(file) ? ts.ScriptKind.TSX : ts.ScriptKind.TS;
  const sf = ts.createSourceFile(file, text, ts.ScriptTarget.Latest, true, kind);
  (function visit(node) {
    if (TEXT.has(node.kind) && node.getText(sf).includes(DASH)) {
      const { line } = sf.getLineAndCharacterOfPosition(node.getStart(sf));
      hits.push(`${relative(root, file)}:${line + 1}  ${node.getText(sf).replace(/\s+/g, ' ').trim().slice(0, 90)}`);
    }
    ts.forEachChild(node, visit);
  })(sf);
}

readFileSync(join(root, 'index.html'), 'utf8').split('\n').forEach((l, i) => {
  if (l.includes(DASH)) hits.push(`index.html:${i + 1}  ${l.trim().slice(0, 90)}`);
});

if (hits.length) {
  console.log(`  FAIL ${hits.length} em dash(es) in on-screen text:\n`);
  for (const h of hits) console.log('       ' + h);
  process.exitCode = 1;
} else {
  console.log(`  ok   no em dashes in on-screen text (${files.length} source files + index.html)`);
}
