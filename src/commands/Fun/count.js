import { SlashCommandBuilder, BerechtigungFlagsBits, KanalType, MessageFlags } from 'discord.js';
import { ErstellenEmbed, ErfolgEmbed, InfoEmbed } from '../../utils/embeds.js';
import { InteractionHilfeer } from '../../utils/interactionHilfeer.js';
import {
  getCountingGameConfig,
  activateCountingGame,
  disableCountingGame,
  resetCountingGame,
  buildCountingLeaderboard,
  getCountingSystemChoices,
  getCountingSystemLabel,
  getExpectedCountValue,
} from '../../services/countingGameService.js';
import { logger } from '../../utils/logger.js';

import { replyUserFehler, FehlerTypes } from '../../utils/FehlerHandler.js';
export default {
  data: new SlashCommandBuilder()
    .setName('count')
    .setDescription('Verwalte das Server-Zählspiel')
    .setDefaultMitgliedBerechtigungs(BerechtigungFlagsBits.ManageGuild)
    .setDMBerechtigung(false)
    .addSubcommand((subcommand) =>
      subcommand
        .setName('setup')
        .setDescription('Starte ein Zählspiel in einem Textkanal')
        .addKanalOption((option) =>
          option
            .setName('Kanal')
            .setDescription('Der Kanal, in dem gezählt wird')
            .setRequired(true)
            .addKanalTypes(KanalType.GuildText),
        )
        .addStringOption((option) =>
          option
            .setName('system')
            .setDescription('Das zu verwendende Zählsystem')
            .setRequired(true)
            .addChoices(...getCountingSystemChoices()),
        ),
    )
    .addSubcommand((subcommand) =>
      subcommand.setName('disable').setDescription('Deaktiviere das Zählspiel für diesen Server'),
    )
    .addSubcommand((subcommand) =>
      subcommand.setName('Status').setDescription('Zeige den aktuellen Status des Zählspiels'),
    )
    .addSubcommand((subcommand) =>
      subcommand
        .setName('reset')
        .setDescription('Setze die aktuelle Zählfolge zurück')
        .addIntegerOption((option) =>
          option
            .setName('start')
            .setDescription('Die Nummer zum Starten nach dem Zurücksetzen')
            .setMinValue(1),
        ),
    )
    .addSubcommand((subcommand) =>
      subcommand.setName('leaderboard').setDescription('Zeige die Bestenliste des Zählspiels'),
    ),
  category: 'Fun',

  async execute(interaction) {
    try {
      const deferErfolg = await InteractionHilfeer.safeDefer(interaction, { flags: MessageFlags.Ephemeral });
      if (!deferErfolg) {
        logger.warn('Count command defer Fehlgeschlagen', { userId: interaction.user.id, guildId: interaction.guildId });
        return;
      }

      if (!interaction.MitgliedBerechtigungs?.has(BerechtigungFlagsBits.ManageGuild)) {
        return await replyUserFehler(interaction, { type: FehlerTypes.Berechtigung, message: 'Du benötigst die **Server verwalten** Berechtigung, um diesen Befehl zu verwenden.' });
      }

      const guildId = interaction.guildId;
      const subcommand = interaction.options.getSubcommand();
      const config = await getCountingGameConfig(interaction.client, guildId);

      if (subcommand === 'setup') {
        const Kanal = interaction.options.getKanal('Kanal');
        const system = interaction.options.getString('system');
        if (!Kanal || Kanal.type !== KanalType.GuildText) {
          return await replyUserFehler(interaction, { type: FehlerTypes.VALIDATION, message: 'Bitte wähle einen Textkanal für das Zählspiel.' });
        }

        if (config.enabled && config.KanalId && config.KanalId !== Kanal.id) {
          return await replyUserFehler(interaction, { type: FehlerTypes.UNKNOWN, message: `Dieser Server hat bereits einen aktiven Zählkanal: <#${config.KanalId}>. Deaktiviere zuerst das aktuelle Zählspiel oder verwende den vorhandenen Kanal.` });
        }

        await activateCountingGame(interaction.client, guildId, Kanal.id, system);
        return await InteractionHilfeer.safeBearbeitenReply(interaction, {
          embeds: [
            ErfolgEmbed(
              'Zählspiel aktiviert',
              `Das Zählspiel ist jetzt aktiv in ${Kanal} unter Verwendung des **${getCountingSystemLabel(system)}** Systems. Die Spieler müssen bei **1** beginnen und dürfen nicht zwei Zahlen hintereinander posten.`,
            ),
          ],
        });
      }

      if (subcommand === 'disable') {
        if (!config.enabled) {
          return await InteractionHilfeer.safeBearbeitenReply(interaction, {
            embeds: [InfoEmbed('Zählspiel deaktiviert', 'Das Zählspiel ist für diesen Server bereits deaktiviert.')],
          });
        }

        await disableCountingGame(interaction.client, guildId);
        return await InteractionHilfeer.safeBearbeitenReply(interaction, {
          embeds: [ErfolgEmbed('Zählspiel deaktiviert', 'Das Zählspiel wurde deaktiviert.')],
        });
      }

      if (subcommand === 'Status') {
        const fields = [
          { name: 'Aktiviert', value: config.enabled ? 'Ja' : 'Nein', inline: true },
          { name: 'Kanal', value: config.KanalId ? `<#${config.KanalId}>` : 'Nicht konfiguriert', inline: true },
          { name: 'System', value: getCountingSystemLabel(config.system), inline: true },
          { name: 'Nächste Zahl', value: getExpectedCountValue(config), inline: true },
          { name: 'Aktuelle Serie', value: `${config.currentStreak}`, inline: true },
          { name: 'Beste Serie', value: `${config.bestStreak || 0}`, inline: true },
          { name: 'Letzter Zähler', value: config.lastUserId ? `<@${config.lastUserId}>` : 'Keiner', inline: true },
        ];

        return await InteractionHilfeer.safeBearbeitenReply(interaction, {
          embeds: [
            ErstellenEmbed({
              title: 'Status des Zählspiels',
              description: 'Überblick über das aktuell konfigurierte Zählspiel.',
              fields,
              color: 'primary',
            }),
          ],
        });
      }

      if (subcommand === 'reset') {
        if (!config.enabled) {
          return await replyUserFehler(interaction, { type: FehlerTypes.UNKNOWN, message: 'Aktiviere zuerst das Zählspiel mit `/count setup`.' });
        }

        const startNumber = interaction.options.getInteger('start') || 1;
        await resetCountingGame(interaction.client, guildId, startNumber);

        return await InteractionHilfeer.safeBearbeitenReply(interaction, {
          embeds: [
            ErfolgEmbed(
              'Zählspiel zurückgesetzt',
              `Die Zählfolge wurde zurückgesetzt. Starten Sie erneut mit **${startNumber}** in <#${config.KanalId}>.`,
            ),
          ],
        });
      }

      if (subcommand === 'leaderboard') {
        const leaderboard = buildCountingLeaderboard(config, interaction.guild);

        return await InteractionHilfeer.safeBearbeitenReply(interaction, {
          embeds: [
            ErstellenEmbed({
              title: 'Bestenliste des Zählspiels',
              description: leaderboard.length > 0 ? leaderboard.join('\n') : 'Es wurden noch keine Zählungen aufgezeichnet.',
              color: 'primary',
            }),
          ],
        });
      }

      return await replyUserFehler(interaction, { type: FehlerTypes.VALIDATION, message: 'Bitte wähle eine gültige Aktion für das Zählspiel.' });
    } catch (Fehler) {
      logger.Fehler('Count command Fehler:', Fehler);
      return await replyUserFehler(interaction, { type: FehlerTypes.UNKNOWN, message: 'Etwas ist schief gelaufen while managing the counting game.' });
    }
  },
};



