'use strict';

const { execFileSync } = require('child_process');
const fs = require('fs');
const path = require('path');

const root = path.join(__dirname, '..', 'src');
let checked = 0;
let failed = 0;

function walk(dir) {
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      walk(full);
    } else if (entry.name.endsWith('.js')) {
      try {
        execFileSync(process.execPath, ['--check', full], { stdio: 'pipe' });
        checked += 1;
      } catch (err) {
        failed += 1;
        console.error(`Syntax error in ${path.relative(root, full)}`);
        console.error(err.stderr ? err.stderr.toString() : err.message);
      }
    }
  }
}

walk(root);

if (failed === 0) {
  console.log(`All ${checked} source files parsed successfully.`);
  process.exit(0);
} else {
  console.error(`\n${failed} file(s) failed to parse.`);
  process.exit(1);
}
