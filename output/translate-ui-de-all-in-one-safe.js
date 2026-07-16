#!/usr/bin/env node
import fs from 'fs';
import path from 'path';

const ROOT = process.argv[2] ? path.resolve(process.argv[2]) : process.cwd();
const JS_EXTS = new Set(['.js', '.mjs', '.cjs', '.ts']);
const SKIP_DIRS = new Set(['node_modules', '.git', 'dist', 'build', 'coverage', 'output']);
const SKIP_FILES = new Set(['package-lock.json']);

const technicalUndo = [
  ['riffyEinrichtung', 'riffySetup'],
  ['serviceFehlerBoundary', 'serviceErrorBoundary'],
  ['fehlerHandler', 'errorHandler'],
  ['FehlerHandler', 'ErrorHandler'],
  ['datenbank', 'database'],
  ['Datenbank', 'Database'],
  ['nachrichtenAdapter', 'messageAdapter'],
  ['NachrichtenAdapter', 'MessageAdapter'],
  ['ereignisHandler', 'eventHandler'],
  ['EreignisHandler', 'EventHandler'],
  ['befehlHandler', 'commandHandler'],
  ['BefehlHandler', 'CommandHandler'],
  ['einrichtung', 'setup'],
  ['Einrichtung', 'Setup'],
  ['verifizierungTaste', 'verificationButton'],
  ['verifizierungsTaste', 'verificationButton']
];

const uiExact = [
  ['Verification Successful!', 'Verifizierung erfolgreich!'],
  ['Verification Successful', 'Verifizierung erfolgreich'],
  ['You have been verified and given the', 'Du wurdest verifiziert und hast die'],
  ['You have been verified and given', 'Du wurdest verifiziert und hast'],
  ['You have been verified', 'Du wurdest verifiziert'],
  ['You now have access to all server channels and features. Welcome!', 'Du hast jetzt Zugriff auf alle Serverkanäle und Funktionen. Willkommen!'],
  ['You now have access to all server channels and features.', 'Du hast jetzt Zugriff auf alle Serverkanäle und Funktionen.'],
  ['You now have access to all channels and features. Welcome!', 'Du hast jetzt Zugriff auf alle Kanäle und Funktionen. Willkommen!'],
  ['You now have access to all channels and features.', 'Du hast jetzt Zugriff auf alle Kanäle und Funktionen.'],
  ['This command has been disabled for this server.', 'Dieser Befehl wurde für diesen Server deaktiviert.'],
  ['Configuration Error', 'Konfigurationsfehler'],
  ['Server Verification', 'Server-Verifizierung'],
  ['Verification System', 'Verifizierungssystem'],
  ['Verification Message', 'Verifizierungsnachricht'],
  ['Verification Channel', 'Verifizierungskanal'],
  ['Verified Role', 'Verifizierte Rolle'],
  ['Verification Dashboard', 'Verifizierungs-Dashboard'],
  ['Auto-Verification', 'Auto-Verifizierung'],
  ['Auto verification', 'Auto-Verifizierung'],
  ['Welcome!', 'Willkommen!'],
  ['Click to verify!', 'Zum Verifizieren klicken!'],
  ['Click here to verify!', 'Hier klicken zum Verifizieren!'],
  ['Verify Now', 'Jetzt verifizieren'],
  ['Verify', 'Verifizieren'],
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
  ['Disabled', 'Deaktiviert'],
  ['Required', 'Erforderlich'],
  ['Optional', 'Optional']
];

const uiRegex = [
  [/\bPlease select a role\b/gi, 'Bitte wähle eine Rolle aus'],
  [/\bPlease select a channel\b/gi, 'Bitte wähle einen Kanal aus'],
  [/\bPlease select a category\b/gi, 'Bitte wähle eine Kategorie aus'],
  [/\bPlease select a user\b/gi, 'Bitte wähle einen Benutzer aus'],
  [/\bNo role was selected\b/gi, 'Es wurde keine Rolle ausgewählt'],
  [/\bNo channel was selected\b/gi, 'Es wurde kein Kanal ausgewählt'],
  [/\bNo category was selected\b/gi, 'Es wurde keine Kategorie ausgewählt'],
  [/\bNo user was selected\b/gi, 'Es wurde kein Benutzer ausgewählt'],
  [/\bPanel Already Active\b/g, 'Panel bereits aktiv'],
  [/\bPanel Reposted\b/g, 'Panel erneut gepostet'],
  [/\bCommand Disabled\b/g, 'Befehl deaktiviert'],
  [/\bSystem Status\b/g, 'Systemstatus']
];

function walk(dir, files = []) {
  if (!fs.existsSync(dir)) return files;
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    if (SKIP_DIRS.has(entry.name)) continue;
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) walk(full, files);
    else if (JS_EXTS.has(path.extname(entry.name)) && !SKIP_FILES.has(entry.name)) files.push(full);
  }
  return files;
}

function applySafeUi(content) {
  for (const [from, to] of uiExact) {
    content = content.split(from).join(to);
  }
  for (const [pattern, to] of uiRegex) {
    content = content.replace(pattern, to);
  }
  return content;
}

function applyTechnicalUndo(content) {
  for (const [from, to] of technicalUndo) {
    content = content.split(from).join(to);
  }
  return content;
}

const files = walk(path.join(ROOT, 'src'));
let changedFiles = 0;
let repaired = 0;

for (const file of files) {
  const original = fs.readFileSync(file, 'utf8');
  let content = original;

  content = applyTechnicalUndo(content);
  content = applySafeUi(content);

  if (content !== original) {
    repaired += 1;
    changedFiles++;
    fs.writeFileSync(file, content, 'utf8');
    console.log(`${path.relative(ROOT, file)}  ->  geändert`);
  }
}

console.log(`\nFertig. ${changedFiles} Dateien geändert.`);
console.log('Sicher: package-lock.json bleibt unangetastet, technische Modulnamen werden zuerst repariert, danach nur definierte UI-Texte übersetzt.');
console.log('Danach: git diff prüfen, committen, pushen, neu deployen.');
