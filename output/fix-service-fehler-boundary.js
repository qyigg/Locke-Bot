#!/usr/bin/env node
import fs from 'fs';
import path from 'path';

const ROOT = process.argv[2] ? path.resolve(process.argv[2]) : process.cwd();
const srcDir = path.join(ROOT, 'src');
const targetImport = 'serviceFehlerBoundary';
const replacement = 'serviceErrorBoundary';
const aliasFile = path.join(srcDir, 'utils', 'serviceFehlerBoundary.js');
const errorHandlerFile = path.join(srcDir, 'utils', 'errorHandler.js');

function replaceInFile(file) {
  if (!fs.existsSync(file)) return 0;
  const original = fs.readFileSync(file, 'utf8');
  const updated = original.split(targetImport).join(replacement);
  if (updated !== original) {
    fs.writeFileSync(file, updated, 'utf8');
    return original.split(targetImport).length - 1;
  }
  return 0;
}

let changes = 0;
changes += replaceInFile(errorHandlerFile);

if (!fs.existsSync(aliasFile)) {
  fs.writeFileSync(
    aliasFile,
    `export * from './serviceErrorBoundary.js';\nexport { default } from './serviceErrorBoundary.js';\n`,
    'utf8'
  );
  console.log('Alias-Datei erstellt: src/utils/serviceFehlerBoundary.js');
}

console.log(`errorHandler Fixes: ${changes}`);
console.log('Fertig. Committen, pushen, neu deployen.');
