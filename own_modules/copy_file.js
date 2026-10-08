#!/usr/bin/env node
/**
 * Copies a file, creating the target's folder if needed:
 *
 *     node copy_file.js <source> <target>
 *
 * Run by the `MASCOT: copy worker ...` tasks MASCOT generates (see `writeVSCTasks`). A script file rather than
 * `node -e "..."`: VS Code quotes task arguments without escaping the quotes inside them, so inline code
 * containing string literals breaks.
 */
const fs = require("fs");
const path = require("path");

const [source, target] = process.argv.slice(2);
if (!source || !target) {
  console.error("Usage: node copy_file.js <source> <target>");
  process.exit(2);
}
fs.mkdirSync(path.dirname(target), { recursive: true });
fs.copyFileSync(source, target);
console.log(`Copied ${source} -> ${target}`);
