import { SlashCommandBuilder, BerechtigungFlagsBits, EmbedBuilder, MessageFlags } from 'discord.js';
import { logger } from '../../utils/logger.js';
import { TitanBotFehler, FehlerTypes } from '../../utils/FehlerHandler.js';
import { checkUserBerechtigungs } from '../../utils/BerechtigungGuard.js';
import { setUserLevel, getLevelingConfig } from '../../services/leveling/leveling.js';
import { ErstellenEmbed } from '../../utils/embeds.js';

import { InteractionHilfeer } from '../../utils/interactionHilfeer.js';
export default {
  data: new SlashCommandBuilder()
    .setName('levelset')
    .setDescription("Stelle das Level eines Benutzers auf einen bestimmten Wert")
    .addUserOption((option) =>
      option
        .setName('user')
        .setDescription('Der Benutzer, für den das Level gesetzt werden soll')
        .setRequired(true)
    )
    .addIntegerOption((option) =>
      option
        .setName('level')
        .setDescription('Das zu setzende Level')
        .setRequired(true)
        .setMinValue(0)
    )
    .setDefaultMitgliedBerechtigungs(BerechtigungFlagsBits.ManageGuild)
    .setDMBerechtigung(false),
  category: 'Leveling',

  async execute(interaction, config, client) {
    await InteractionHilfeer.safeDefer(interaction);

    const hasBerechtigung = await checkUserBerechtigungs(
      interaction,
      BerechtigungFlagsBits.ManageGuild,
      'Du benötigst die Berechtigung **Server verwalten**, um diesen Befehl zu verwenden.'
    );
    if (!hasBerechtigung) return;

    const levelingConfig = await getLevelingConfig(client, interaction.guildId);
    if (!levelingConfig?.enabled) {
      await InteractionHilfeer.safeBearbeitenReply(interaction, {
        embeds: [
          new EmbedBuilder()
            .setColor('#f1c40f')
            .setDescription('Das Levelsystem ist derzeit auf diesem Server deaktiviert.')
        ],
        flags: MessageFlags.Ephemeral
      });
      return;
    }

    const targetUser = interaction.options.getUser('user');
    const newLevel = interaction.options.getInteger('level');

    const Mitglied = await interaction.guild.Mitglieds.fetch(targetUser.id).catch(() => null);
    if (!Mitglied) {
      throw new TitanBotFehler(
        `User ${targetUser.id} Nicht gefunden in Diese Gilde`,
        FehlerTypes.USER_INPUT,
        'Der angegebene Benutzer ist nicht auf diesem Server.'
      );
    }

    const userData = await setUserLevel(client, interaction.guildId, targetUser.id, newLevel);

    await InteractionHilfeer.safeBearbeitenReply(interaction, {
      embeds: [
        ErstellenEmbed({
          title: 'Level gesetzt',
          description: `Erfolgreich das Level von ${targetUser.tag} auf **${newLevel}** gesetzt.\n**Gesamt XP:** ${userData.totalXp}`,
          color: 'Erfolg'
        })
      ]
    });

    logger.Info(
      `[ADMIN] User ${interaction.user.tag} set ${targetUser.tag}'s level to ${newLevel} in guild ${interaction.guildId}`
    );
  }
};



