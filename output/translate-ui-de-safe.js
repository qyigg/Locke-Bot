#!/usr/bin/env node
import fs from 'fs';
import path from 'path';

const ROOT = process.argv[2] ? path.resolve(process.argv[2]) : process.cwd();
const exts = new Set(['.js', '.mjs', '.cjs', '.ts', '.jsx', '.tsx', '.json', '.md']);
const skipDirs = new Set(['node_modules', '.git', 'dist', 'build', 'coverage', 'output']);
const skipFiles = new Set(['package-lock.json']);

const fileAllowList = [/\/src\/commands\//, /\/src\/events\//, /\/src\/handlers\//, /\/src\/services\//, /\/src\/utils\//, /\/src\/config\//, /\/src\/app\.js$/];
const safeExactReplacements = [
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
  ['Please wait before trying again.', 'Bitte warte, bevor du es erneut versuchst.'],
  ['Please try again later.', 'Bitte versuche es später erneut.'],
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
  ['Optional', 'Optional'],
  ['Welcome!', 'Willkommen!'],
  ['Verify', 'Verifizieren'],
  ['Verifying', 'Verifizierung läuft'],
  ['Click to verify!', 'Zum Verifizieren klicken!'],
  ['Click here to verify!', 'Hier klicken zum Verifizieren!']
];

const regexReplacements = [
  [/\bServer Verification\b/g, 'Server-Verifizierung'],
  [/\bVerification Dashboard\b/g, 'Verifizierungs-Dashboard'],
  [/\bVerification System\b/g, 'Verifizierungssystem'],
  [/\bAuto-Verification\b/g, 'Auto-Verifizierung'],
  [/\bAuto verification\b/gi, 'Auto-Verifizierung'],
  [/\bConfiguration Error\b/g, 'Konfigurationsfehler'],
  [/\bVerification Successful\b/g, 'Verifizierung erfolgreich'],
  [/\bYou have been verified and given the\b/g, 'Du wurdest verifiziert und hast die'],
  [/\bYou now have access to all server channels and features\b/g, 'Du hast jetzt Zugriff auf alle Serverkanäle und Funktionen'],
  [/\bThis command has been disabled for this server\b/g, 'Dieser Befehl wurde für diesen Server deaktiviert'],
  [/\bPlease choose a role\b/gi, 'Bitte wähle eine Rolle aus'],
  [/\bPlease select a channel\b/gi, 'Bitte wähle einen Kanal aus'],
  [/\bPlease select a category\b/gi, 'Bitte wähle eine Kategorie aus'],
  [/\bPlease select a user\b/gi, 'Bitte wähle einen Benutzer aus'],
  [/\bNo role was selected\b/gi, 'Es wurde keine Rolle ausgewählt'],
  [/\bNo channel was selected\b/gi, 'Es wurde kein Kanal ausgewählt'],
  [/\bNo category was selected\b/gi, 'Es wurde keine Kategorie ausgewählt'],
  [/\bNo user was selected\b/gi, 'Es wurde kein Benutzer ausgewählt'],
  [/\bPanel Already Active\b/g, 'Panel bereits aktiv'],
  [/\bPanel Reposted\b/g, 'Panel erneut gepostet'],
  [/\bTicket System Deleted\b/g, 'Ticket-System gelöscht'],
  [/\bSystem Status\b/g, 'Systemstatus'],
  [/\bCommand Disabled\b/g, 'Befehl deaktiviert']
];

function shouldProcess(file) {
  if (skipFiles.has(path.basename(file))) return false;
  if (!exts.has(path.extname(file))) return false;
  return fileAllowList.some(rx => rx.test(file.replace(/\\/g, '/')));
}

function walk(dir, files = []) {
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    if (skipDirs.has(entry.name)) continue;
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) walk(full, files);
    else if (shouldProcess(full)) files.push(full);
  }
  return files;
}

const files = walk(ROOT);
let changedFiles = 0;
let totalReplacements = 0;

for (const file of files) {
  const original = fs.readFileSync(file, 'utf8');
  let content = original;
  let count = 0;

  for (const [from, to] of safeExactReplacements) {
    const c = content.split(from).length - 1;
    if (c) {
      content = content.split(from).join(to);
      count += c;
      totalReplacements += c;
    }
  }

  for (const [pattern, to] of regexReplacements) {
    const matches = content.match(pattern);
    if (matches) {
      content = content.replace(pattern, to);
      count += matches.length;
      totalReplacements += matches.length;
    }
  }

  if (content !== original) {
    fs.writeFileSync(file, content, 'utf8');
    changedFiles++;
    console.log(`${path.relative(ROOT, file)}  ->  ${count} Ersetzungen`);
  }
}

console.log(`\nFertig. ${changedFiles} Dateien geändert, ${totalReplacements} Ersetzungen insgesamt.`);
console.log('Sicherheitsmodus: package-lock.json wird nicht verändert, Importpfade werden nicht pauschal übersetzt.');
