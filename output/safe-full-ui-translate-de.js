#!/usr/bin/env node
import fs from 'fs';
import path from 'path';

const ROOT = process.argv[2] ? path.resolve(process.argv[2]) : process.cwd();
const SRC = path.join(ROOT, 'src');
const JS_EXTS = new Set(['.js', '.mjs', '.cjs']);

// Wir lassen Slash-Command-Namen und technische Identifiers in Ruhe.
// Wir übersetzen nur UI-Texte innerhalb von Anführungszeichen.

const uiExact = [
  ['Verification Successful!', 'Verifizierung erfolgreich!'],
  ['Verification Successful', 'Verifizierung erfolgreich'],
  ['You have been verified and given the Mitglied role!', 'Du wurdest verifiziert und hast die Mitglied-Rolle erhalten!'],
  ['You have been verified and given the Mitglied role', 'Du wurdest verifiziert und hast die Mitglied-Rolle erhalten'],
  ['You have been verified', 'Du wurdest verifiziert'],
  ['You now have access to all server channels and features. Welcome!', 'Du hast jetzt Zugriff auf alle Serverkanäle und Funktionen. Willkommen!'],
  ['You now have access to all server channels and features.', 'Du hast jetzt Zugriff auf alle Serverkanäle und Funktionen.'],
  ['You now have access to all channels and features. Welcome!', 'Du hast jetzt Zugriff auf alle Kanäle und Funktionen. Willkommen!'],
  ['You now have access to all channels and features.', 'Du hast jetzt Zugriff auf alle Kanäle und Funktionen.'],
  ['This command has been disabled for this server.', 'Dieser Befehl wurde für diesen Server deaktiviert.'],
  ['This command is disabled on this server.', 'Dieser Befehl ist auf diesem Server deaktiviert.'],
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
  ['Welcome to the server!', 'Willkommen auf dem Server!'],
  ['Welcome to the TitanBot panel!', 'Willkommen im TitanBot-Panel!'],
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
  ['Optional', 'Optional'],
  ['Loading...', 'Lade...'],
  ['Please wait...', 'Bitte warten...'],
  ['Are you sure you want to delete this?', 'Bist du sicher, dass du dies löschen möchtest?'],
  ['Are you sure?', 'Bist du sicher?'],
  ['No results found.', 'Keine Ergebnisse gefunden.'],
  ['No items found.', 'Keine Einträge gefunden.'],
  ['No tickets found.', 'Keine Tickets gefunden.'],
  ['No giveaways found.', 'Keine Giveaways gefunden.'],
  ['No warnings found.', 'Keine Verwarnungen gefunden.'],
  ['Missing permissions.', 'Fehlende Berechtigungen.'],
  ['You do not have permission to use this command.', 'Du hast keine Berechtigung, diesen Befehl zu verwenden.'],
  ['An error occurred while executing this command.', 'Beim Ausführen dieses Befehls ist ein Fehler aufgetreten.'],
  ['An unexpected error occurred.', 'Ein unerwarteter Fehler ist aufgetreten.'],
  ['Internal Error', 'Interner Fehler'],
  ['Panel Status', 'Panelstatus'],
  ['System Status', 'Systemstatus'],
  ['Online', 'Online'],
  ['Offline', 'Offline'],
  ['Unknown', 'Unbekannt'],
  ['Music System', 'Musiksystem'],
  ['Ticket System', 'Ticketsystem'],
  ['Logging System', 'Loggingsystem'],
  ['Verification System', 'Verifizierungssystem'],
  ['Birthday System', 'Geburtstagssystem'],
  ['Economy System', 'Economy-System'],
  ['Leveling System', 'Levelsystem']
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
  [/\bPanel Already Active\b/gi, 'Panel bereits aktiv'],
  [/\bPanel Reposted\b/gi, 'Panel erneut gepostet'],
  [/\bCommand Disabled\b/gi, 'Befehl deaktiviert'],
  [/\bCommand enabled successfully\b/gi, 'Befehl erfolgreich aktiviert'],
  [/\bCommand disabled successfully\b/gi, 'Befehl erfolgreich deaktiviert'],
  [/\bSystem Status\b/gi, 'Systemstatus'],
  [/\bWelcome Panel\b/gi, 'Willkommens-Panel'],
  [/\bTicket Panel\b/gi, 'Ticket-Panel'],
  [/\bLogging Panel\b/gi, 'Logging-Panel'],
  [/\bVerification Panel\b/gi, 'Verifizierungs-Panel']
];

function walk(dir, files = []) {
  if (!fs.existsSync(dir)) return files;
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      walk(full, files);
    } else if (JS_EXTS.has(path.extname(entry.name))) {
      files.push(full);
    }
  }
  return files;
}

function translateUi(content) {
  let updated = content;

  // Nur Stringliterale anfassen: einfache Heuristik über bekannte englische Texte
  for (const [from, to] of uiExact) {
    if (from.includes('"') || from.includes("'")) {
      updated = updated.split(from).join(to);
    } else {
      updated = updated.replace(new RegExp(
        `(["'\`])` + from.replace(/[.*+?^${}()|[\]\\]/g, '\\$&') + `(["'\`])`,
        'g'
      ), `$1${to}$2`);
    }
  }

  for (const [pattern, to] of uiRegex) {
    updated = updated.replace(pattern, to);
  }

  return updated;
}

const files = walk(SRC);
let changedFiles = 0;
let totalHits = 0;

for (const file of files) {
  const original = fs.readFileSync(file, 'utf8');
  const updated = translateUi(original);
  if (updated !== original) {
    fs.writeFileSync(file, updated, 'utf8');
    changedFiles++;
    console.log(path.relative(ROOT, file));
    // grobe Trefferzählung
    uiExact.forEach(([from, to]) => {
      const hits = (original.match(new RegExp(from.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'g')) || []).length;
      totalHits += hits;
    });
  }
}

console.log(`\nFertig. ${changedFiles} Dateien geändert, grob ${totalHits} Text-Treffer.`);
console.log('Slash-Command-Namen und technische Identifiers wurden nicht angefasst; nur UI-Texte in String-Literalen wurden übersetzt.');
