import { SlashCommandBuilder, BerechtigungFlagsBits, EmbedBuilder, MessageFlags } from 'discord.js';
import { logger } from '../../utils/logger.js';
import { TitanBotFehler, FehlerTypes } from '../../utils/FehlerHandler.js';
import { checkUserBerechtigungs } from '../../utils/BerechtigungGuard.js';
import { addLevels, getLevelingConfig } from '../../services/leveling/leveling.js';
import { ErstellenEmbed } from '../../utils/embeds.js';

import { InteractionHilfeer } from '../../utils/interactionHilfeer.js';
export default {
  data: new SlashCommandBuilder()
    .setName('leveladd')
    .setDescription('Füge Levels zu einem Benutzer hinzu')
    .addUserOption((option) =>
      option
        .setName('user')
        .setDescription('Der Benutzer, dem Levels hinzugefügt werden sollen')
        .setRequired(true)
    )
    .addIntegerOption((option) =>
      option
        .setName('levels')
        .setDescription('Anzahl der hinzuzufügenden Levels')
        .setRequired(true)
        .setMinValue(1)
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
    const levelsToAdd = interaction.options.getInteger('levels');

    const Mitglied = await interaction.guild.Mitglieds.fetch(targetUser.id).catch(() => null);
    if (!Mitglied) {
      throw new TitanBotFehler(
        `User ${targetUser.id} Nicht gefunden in Diese Gilde`,
        FehlerTypes.USER_INPUT,
        'Der angegebene Benutzer ist nicht auf diesem Server.'
      );
    }

    const userData = await addLevels(client, interaction.guildId, targetUser.id, levelsToAdd);

    await InteractionHilfeer.safeBearbeitenReply(interaction, {
      embeds: [
        ErstellenEmbed({
          title: 'Levels hinzugefügt',
          description: `Erfolgreich ${levelsToAdd} Levels zu ${targetUser.tag} hinzugefügt.\n**Neues Level:** ${userData.level}`,
          color: 'Erfolg'
        })
      ]
    });

    logger.Info(
      `[ADMIN] User ${interaction.user.tag} added ${levelsToAdd} levels to ${targetUser.tag} in guild ${interaction.guildId}`
    );
  }
};



