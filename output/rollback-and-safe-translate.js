#!/usr/bin/env node
import fs from 'fs';
import path from 'path';
import { execSync } from 'child_process';

const ROOT = process.argv[2] ? path.resolve(process.argv[2]) : process.cwd();
const SAFE_BASE = process.argv[3] || '0d0b9c6';
const SRC = path.join(ROOT, 'src');
const exts = new Set(['.js', '.mjs', '.cjs']);

const uiMap = [
  ['Verification Successful!', 'Verifizierung erfolgreich!'],
  ['Verification Successful', 'Verifizierung erfolgreich'],
  ['You have been verified and given the', 'Du wurdest verifiziert und hast die'],
  ['You now have access to all server channels and features. Welcome!', 'Du hast jetzt Zugriff auf alle Serverkanäle und Funktionen. Willkommen!'],
  ['You now have access to all server channels and features.', 'Du hast jetzt Zugriff auf alle Serverkanäle und Funktionen.'],
  ['Welcome!', 'Willkommen!'],
  ['Click to verify!', 'Zum Verifizieren klicken!'],
  ['Click here to verify!', 'Hier klicken zum Verifizieren!'],
  ['Verify Now', 'Jetzt verifizieren'],
  ['Verify', 'Verifizieren'],
  ['Verification System', 'Verifizierungssystem'],
  ['Verification Message', 'Verifizierungsnachricht'],
  ['Verification Channel', 'Verifizierungskanal'],
  ['Verified Role', 'Verifizierte Rolle'],
  ['Verification Dashboard', 'Verifizierungs-Dashboard'],
  ['Auto-Verification', 'Auto-Verifizierung'],
  ['Configuration Error', 'Konfigurationsfehler'],
  ['Success', 'Erfolg'],
  ['Error', 'Fehler'],
  ['Warning', 'Warnung'],
  ['Settings', 'Einstellungen'],
  ['Save', 'Speichern'],
  ['Cancel', 'Abbrechen'],
  ['Delete', 'Löschen'],
  ['Close', 'Schließen'],
  ['Back', 'Zurück'],
  ['Next', 'Weiter'],
  ['Submit', 'Absenden'],
  ['Confirm', 'Bestätigen'],
  ['Enabled', 'Aktiviert'],
  ['Disabled', 'Deaktiviert']
];

function run(cmd) {
  return execSync(cmd, { cwd: ROOT, stdio: ['ignore', 'pipe', 'pipe'] }).toString();
}

function walk(dir, out = []) {
  if (!fs.existsSync(dir)) return out;
  for (const ent of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, ent.name);
    if (ent.isDirectory()) walk(full, out);
    else if (exts.has(path.extname(ent.name))) out.push(full);
  }
  return out;
}

function translateUiOnly(content) {
  let updated = content;
  for (const [from, to] of uiMap) updated = updated.split(from).join(to);
  return updated;
}

try {
  run(`git rev-parse --verify ${SAFE_BASE}`);
} catch {
  console.error(`Commit ${SAFE_BASE} wurde nicht gefunden.`);
  process.exit(1);
}

const changed = run(`git diff --name-only ${SAFE_BASE} -- src`).trim().split('\n').filter(Boolean);
console.log(`Setze ${changed.length} Dateien aus ${SAFE_BASE} zurück...`);

for (const rel of changed) {
  const blob = run(`git show ${SAFE_BASE}:${rel}`);
  const abs = path.join(ROOT, rel);
  fs.mkdirSync(path.dirname(abs), { recursive: true });
  fs.writeFileSync(abs, blob, 'utf8');
  console.log(`restore ${rel}`);
}

const files = walk(SRC);
let translated = 0;
for (const file of files) {
  const original = fs.readFileSync(file, 'utf8');
  const updated = translateUiOnly(original);
  if (updated !== original) {
    fs.writeFileSync(file, updated, 'utf8');
    translated++;
  }
}

console.log(`\nRollback abgeschlossen auf ${SAFE_BASE}.`);
console.log(`${translated} Dateien mit sicheren UI-Übersetzungen angepasst.`);
console.log('Technische Namen, Imports und Dateinamen werden NICHT übersetzt.');
console.log('Prüfe danach git diff, dann commit + push + redeploy.');
