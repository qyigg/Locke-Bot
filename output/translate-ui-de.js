#!/usr/bin/env node
import fs from 'fs';
import path from 'path';

const ROOT = process.argv[2] ? path.resolve(process.argv[2]) : process.cwd();
const exts = new Set(['.js', '.mjs', '.cjs', '.ts', '.json']);
const skipDirs = new Set(['node_modules', '.git', 'dist', 'build', 'coverage', 'output']);

const replacements = [
  ['Not set', 'Nicht gesetzt'],
  ['Not configured', 'Nicht konfiguriert'],
  ['Enabled', 'Aktiviert'],
  ['Disabled', 'Deaktiviert'],
  ['System Status', 'Systemstatus'],
  ['Panel Status', 'Panel-Status'],
  ['Setup Conflicts', 'Einrichtungskonflikte'],
  ['Dashboard Timed Out', 'Dashboard-Zeitüberschreitung'],
  ['This dashboard has been closed due to inactivity. Please run the command again to continue.', 'Dieses Dashboard wurde aufgrund von Inaktivität geschlossen. Bitte führe den Befehl erneut aus, um fortzufahren.'],
  ['Dashboard closes after 10 minutes of inactivity', 'Dashboard schließt nach 10 Minuten Inaktivität'],
  ['Select a setting to configure...', 'Wähle eine Einstellung zum Konfigurieren aus...'],
  ['Select criteria...', 'Kriterien auswählen...'],
  ['Change Role', 'Rolle ändern'],
  ['Role Updated', 'Rolle aktualisiert'],
  ['No role was selected. The setting was not changed.', 'Es wurde keine Rolle ausgewählt. Die Einstellung wurde nicht geändert.'],
  ['Please choose a normal assignable role (not @everyone or a bot-managed role).', 'Bitte wähle eine normale zuweisbare Rolle aus (nicht @everyone und keine vom Bot verwaltete Rolle).'],
  ['The selected role must be below my highest role in the server role hierarchy.', 'Die ausgewählte Rolle muss in der Server-Rollenhierarchie unter meiner höchsten Rolle liegen.'],
  ['The verified role must be below my highest role in the server role hierarchy.', 'Die verifizierte Rolle muss in der Server-Rollenhierarchie unter meiner höchsten Rolle liegen.'],
  ['Change Criteria', 'Kriterien ändern'],
  ['Criteria', 'Kriterien'],
  ['Criteria Updated', 'Kriterien aktualisiert'],
  ['No criteria selected. The setting was not changed.', 'Es wurden keine Kriterien ausgewählt. Die Einstellung wurde nicht geändert.'],
  ['No Criteria', 'Keine Kriterien'],
  ['Account Age', 'Kontoalter'],
  ['Edit Account Age Days', 'Tage für Kontoalter bearbeiten'],
  ['Set Account Age Requirement', 'Anforderung für Kontoalter festlegen'],
  ['Minimum Account Age (days)', 'Minimales Kontoalter (Tage)'],
  ['Please enter a number between', 'Bitte gib eine Zahl zwischen'],
  ['Account Age Updated', 'Kontoalter aktualisiert'],
  ['Target Role', 'Zielrolle'],
  ['Auto-Verification Dashboard', 'Auto-Verifizierungs-Dashboard'],
  ['Auto-verification Dashboard', 'Auto-Verifizierungs-Dashboard'],
  ['Auto-Verification', 'Auto-Verifizierung'],
  ['Auto-verification', 'Auto-Verifizierung'],
  ['Verification system is enabled', 'Verifizierungssystem ist aktiviert'],
  ['AutoRole is configured', 'AutoRole ist konfiguriert'],
  ['Support Tickets', 'Support-Tickets'],
  ['Create Ticket', 'Ticket erstellen'],
  ['Delete System', 'System löschen'],
  ['Ticket System Dashboard', 'Ticket-System-Dashboard'],
  ['Panel Channel', 'Panel-Kanal'],
  ['Panel Message', 'Panel-Nachricht'],
  ['Button Label', 'Button-Beschriftung'],
  ['DM on Close', 'DM beim Schließen'],
  ['Open Tickets', 'Offene Tickets'],
  ['Avg Close Time', 'Durchschn. Schließzeit'],
  ['Feedback Rating', 'Feedback-Bewertung'],
  ['Ticket Logs Channel', 'Ticket-Logs-Kanal'],
  ['Transcript Channel', 'Transkript-Kanal'],
  ['Select a role...', 'Wähle eine Rolle aus...'],
  ['Select a channel...', 'Wähle einen Kanal aus...'],
  ['Select a category...', 'Wähle eine Kategorie aus...'],
  ['Select a text channel...', 'Wähle einen Textkanal aus...'],
  ['Select a user to check...', 'Wähle einen Benutzer zur Prüfung aus...'],
  ['No channel selected. No changes were made.', 'Es wurde kein Kanal ausgewählt. Es wurden keine Änderungen vorgenommen.'],
  ['No channel was selected. The setting was not changed.', 'Es wurde kein Kanal ausgewählt. Die Einstellung wurde nicht geändert.'],
  ['No category was selected. The setting was not changed.', 'Es wurde keine Kategorie ausgewählt. Die Einstellung wurde nicht geändert.'],
  ['No user was selected.', 'Es wurde kein Benutzer ausgewählt.'],
  ['Panel Reposted', 'Panel erneut gepostet'],
  ['Panel Already Active', 'Panel bereits aktiv'],
  ['Ticket System Deleted', 'Ticket-System gelöscht'],
  ['All ticket system configuration has been cleared. Run `/ticket setup` to set it up again.', 'Die gesamte Ticket-System-Konfiguration wurde entfernt. Führe `/ticket setup` aus, um es erneut einzurichten.'],
  ['Server Verification', 'Server-Verifizierung'],
  ['Verification System Dashboard', 'Verifizierungssystem-Dashboard'],
  ['Verification Channel', 'Verifizierungskanal'],
  ['Verified Role', 'Verifizierte Rolle'],
  ['Verified Users', 'Verifizierte Benutzer'],
  ['Verification Message', 'Verifizierungsnachricht'],
  ['Button Text', 'Button-Text'],
  ['Change Verification Channel', 'Verifizierungskanal ändern'],
  ['Change Verified Role', 'Verifizierte Rolle ändern'],
  ['Edit Verification Message', 'Verifizierungsnachricht bearbeiten'],
  ['Edit Button Text', 'Button-Text bearbeiten'],
  ['This form is not available.', 'Dieses Formular ist nicht verfügbar.'],
  ['This button is not available.', 'Dieser Button ist nicht verfügbar.'],
  ['This select menu is not available.', 'Dieses Auswahlmenü ist nicht verfügbar.'],
  ['This command has been disabled for this server.', 'Dieser Befehl wurde für diesen Server deaktiviert.'],
  ['Command Disabled', 'Befehl deaktiviert'],
  ['Feature Disabled', 'Funktion deaktiviert'],
  ['Maintenance Mode', 'Wartungsmodus'],
  ['Slash Command Only', 'Nur Slash-Command'],
  ['Command Cooldown', 'Befehls-Cooldown'],
  ['This command is on cooldown. Please wait ', 'Dieser Befehl hat aktuell eine Abklingzeit. Bitte warte '],
  [' before trying again.', ', bevor du es erneut versuchst.'],
  ['Message Updated', 'Nachricht aktualisiert'],
  ['Channel Updated', 'Kanal aktualisiert'],
  ['Staff Role Updated', 'Staff-Rolle aktualisiert'],
];

function walk(dir, files = []) {
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    if (skipDirs.has(entry.name)) continue;
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      walk(full, files);
    } else if (exts.has(path.extname(entry.name))) {
      files.push(full);
    }
  }
  return files;
}

const files = walk(ROOT);
let changedFiles = 0;
let totalReplacements = 0;

for (const file of files) {
  const original = fs.readFileSync(file, 'utf8');
  let content = original;
  let fileReplacements = 0;

  for (const [from, to] of replacements) {
    const count = content.split(from).length - 1;
    if (count > 0) {
      content = content.split(from).join(to);
      fileReplacements += count;
      totalReplacements += count;
    }
  }

  if (content !== original) {
    fs.writeFileSync(file, content, 'utf8');
    changedFiles++;
    console.log(`${path.relative(ROOT, file)}  ->  ${fileReplacements} Ersetzungen`);
  }
}

console.log(`\nFertig. ${changedFiles} Dateien geändert, ${totalReplacements} Ersetzungen insgesamt.`);
console.log('Tipp: Vorher Commit/Backup machen und danach mit git diff prüfen.');
