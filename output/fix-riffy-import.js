#!/usr/bin/env node
import fs from 'fs';
import path from 'path';

const ROOT = process.argv[2] ? path.resolve(process.argv[2]) : process.cwd();
const targets = ['src/app.js', 'src/services/music'];
const fixes = [
  ['riffyEinrichtung.js', 'riffySetup.js'],
  ['RiffyEinrichtung.js', 'RiffySetup.js'],
  ['musicEinrichtung', 'musicSetup'],
  ['MusicEinrichtung', 'MusicSetup'],
  ['setupeinrichtung', 'setup'],
  ['Einrichtung.js', 'Setup.js']
];

function exists(p) {
  try { return fs.existsSync(p); } catch { return false; }
}

function walk(dir, files = []) {
  if (!exists(dir)) return files;
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) walk(full, files);
    else if (/\.(js|mjs|cjs|ts)$/.test(entry.name)) files.push(full);
  }
  return files;
}

const files = [];
for (const t of targets) {
  const full = path.join(ROOT, t);
  if (exists(full)) {
    const stat = fs.statSync(full);
    if (stat.isDirectory()) walk(full, files);
    else files.push(full);
  }
}

let changedFiles = 0;
let total = 0;
for (const file of [...new Set(files)]) {
  const original = fs.readFileSync(file, 'utf8');
  let content = original;
  let count = 0;
  for (const [from, to] of fixes) {
    const hits = content.split(from).length - 1;
    if (hits > 0) {
      content = content.split(from).join(to);
      count += hits;
      total += hits;
    }
  }
  if (content !== original) {
    fs.writeFileSync(file, content, 'utf8');
    changedFiles++;
    console.log(`${path.relative(ROOT, file)}  ->  ${count} Fixes`);
  }
}

console.log(`\nFertig. ${changedFiles} Dateien geändert, ${total} Fixes insgesamt.`);
console.log('Danach bitte committen und neu deployen.');
