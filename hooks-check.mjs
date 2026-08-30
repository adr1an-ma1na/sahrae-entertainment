/**
 * Finds hooks that do not run on every render.
 *
 * React identifies hooks by CALL ORDER, not by name. A hook that sometimes runs
 * and sometimes does not shifts every hook after it, and React throws minified
 * error #310 ("Rendered more hooks than during the previous render") or #300
 * ("Rendered fewer hooks than expected") — at the top of the tree, with no
 * component name attached. In a production build that is a blank error screen
 * and a code number. Hence a source scan.
 *
 * THE SHAPE THIS CATCHES, which is not hypothetical
 * PlayerModal had `if (!isOpen || !details) return null;` partway down, with a
 * useMemo and a useEffect below it. Closed, it ran N hooks; open with details
 * loaded, N+2. Opening any film took the entire app to the error screen. The
 * early return reads like an obvious optimisation, and that is the trap: it is
 * invisible unless you are specifically looking for hooks below it.
 *
 * WHY INDENTATION AND NOT BRACE DEPTH
 * The first version of this counted braces, validated fine against a small
 * synthetic file, and then missed the real bug completely — template literals,
 * JSX and regex literals in a 1700-line component desynced the counter. A check
 * that passes on toy input and fails on real input is worse than no check,
 * because it is trusted. This keys off the 2-space body indent the codebase
 * uses consistently, which those constructs cannot disturb.
 *
 * Run: node hooks-check.mjs
 */
import fs from 'node:fs';
import path from 'node:path';

const ROOT = 'src';
const BODY = /^ {2}\S/;                        // a statement in a component body
const HOOK = /^ {2}(?:const|let|var)?\s*.*\b(use[A-Z][A-Za-z0-9_]*)\s*\(/;
const EARLY_RETURN = /^ {2}(?:if\s*\(.*\)\s*)?return\b/;
/**
 * Both component shapes. Missing the arrow form is not a cosmetic gap: an
 * unrecognised component does not start a new scope, so the PREVIOUS component
 * stays current and every hook in the arrow component gets blamed on it, below
 * a return that belongs to someone else. That produced three confident false
 * positives against SportsView on the first run.
 */
const COMPONENT = /^(?:export\s+(?:default\s+)?)?function\s+([A-Z][A-Za-z0-9_]*|use[A-Z][A-Za-z0-9_]*)\s*\(/;
const ARROW_COMPONENT = /^(?:export\s+(?:default\s+)?)?const\s+([A-Z][A-Za-z0-9_]*|use[A-Z][A-Za-z0-9_]*)\s*[:=][^=]*=>/;
/** A brace back at column 0 closes a top-level function — scope over. */
const SCOPE_END = /^\}/;

function files(dir) {
  const out = [];
  for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
    const p = path.join(dir, e.name);
    if (e.isDirectory()) out.push(...files(p));
    else if (/\.tsx?$/.test(e.name)) out.push(p);
  }
  return out;
}

const targets = process.argv.length > 2 ? process.argv.slice(2) : files(ROOT);
const findings = [];

for (const file of targets) {
  const lines = fs.readFileSync(file, 'utf8').split('\n');
  let component = '';
  let returnedAt = 0;

  lines.forEach((line, i) => {
    const decl = line.match(COMPONENT) || line.match(ARROW_COMPONENT);
    if (decl) { component = decl[1]; returnedAt = 0; return; }
    // Leaving a top-level function ends the scope. Without this, the next
    // component's hooks are judged against the previous one's early return.
    if (SCOPE_END.test(line)) { component = ''; returnedAt = 0; return; }
    if (!component || !BODY.test(line)) return;

    // Ignore comment bodies and the closing of a nested block.
    const code = line.replace(/\/\/.*$/, '');
    if (/^\s*[*/]/.test(code)) return;

    if (!returnedAt && EARLY_RETURN.test(code)) {
      // The final `return (` that renders JSX is the normal end of a component;
      // nothing follows it, so it cannot strand a hook. Only a return that has
      // code after it matters, which the hook check below establishes anyway.
      returnedAt = i + 1;
      return;
    }

    const m = code.match(HOOK);
    if (m && returnedAt) {
      // A hook DEFINITION is not a hook call.
      if (/^\s*(export\s+)?function\s+use[A-Z]/.test(code)) return;
      findings.push({ file, line: i + 1, component, hook: m[1], after: returnedAt });
    }
  });
}

if (!findings.length) {
  console.log('\n  \x1b[32mok\x1b[0m  every hook runs on every render\n');
} else {
  console.log(`\n  \x1b[31m${findings.length} hook(s) that do not run on every render:\x1b[0m\n`);
  for (const f of findings) {
    console.log(`  ${f.file}:${f.line}`);
    console.log(`     \x1b[31m${f.hook}()\x1b[0m in <${f.component}>, below the return on line ${f.after}`);
    console.log('     React counts hooks by order — this shifts every hook after it.\n');
  }
}
process.exit(findings.length ? 1 : 0);
