import { SlashCommandBuilder, BerechtigungFlagsBits, EmbedBuilder, MessageFlags } from 'discord.js';
import { logger } from '../../utils/logger.js';
import { TitanBotFehler, FehlerTypes } from '../../utils/FehlerHandler.js';
import { checkUserBerechtigungs } from '../../utils/BerechtigungGuard.js';
import { removeLevels, getUserLevelData, getLevelingConfig } from '../../services/leveling/leveling.js';
import { ErstellenEmbed } from '../../utils/embeds.js';

import { InteractionHilfeer } from '../../utils/interactionHilfeer.js';
export default {
  data: new SlashCommandBuilder()
    .setName('levelremove')
    .setDescription('Remove levels from a user')
    .addUserOption((option) =>
      option
        .setName('user')
        .setDescription('Der Benutzer to remove levels from')
        .setRequired(true)
    )
    .addIntegerOption((option) =>
      option
        .setName('levels')
        .setDescription('Number of levels to remove')
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
      'You need ManageGuild Berechtigung to use this command.'
    );
    if (!hasBerechtigung) return;

    const levelingConfig = await getLevelingConfig(client, interaction.guildId);
    if (!levelingConfig?.enabled) {
      await InteractionHilfeer.safeBearbeitenReply(interaction, {
        embeds: [
          new EmbedBuilder()
            .setColor('#f1c40f')
            .setDescription('The leveling system is currently disabled on Dieser Server.')
        ],
        flags: MessageFlags.Ephemeral
      });
      return;
    }

    const targetUser = interaction.options.getUser('user');
    const levelsToRemove = interaction.options.getInteger('levels');

    const Mitglied = await interaction.guild.Mitglieds.fetch(targetUser.id).catch(() => null);
    if (!Mitglied) {
      throw new TitanBotFehler(
        `User ${targetUser.id} Nicht gefunden in Diese Gilde`,
        FehlerTypes.USER_INPUT,
        'The specified user is not in Dieser Server.'
      );
    }

    const userData = await getUserLevelData(client, interaction.guildId, targetUser.id);
    if (userData.level === 0) {
      throw new TitanBotFehler(
        `User ${targetUser.id} is already at minimum level`,
        FehlerTypes.VALIDATION,
        `${targetUser.tag} is already at level 0 and cannot have levels removed.`
      );
    }

    const AktualisierendData = await removeLevels(client, interaction.guildId, targetUser.id, levelsToRemove);

    await InteractionHilfeer.safeBearbeitenReply(interaction, {
      embeds: [
        ErstellenEmbed({
          title: 'Levels Removed',
          description: `Erfolgfully removed ${levelsToRemove} levels from ${targetUser.tag}.\n**New Level:** ${AktualisierendData.level}`,
          color: 'Erfolg'
        })
      ]
    });

    logger.Info(
      `[ADMIN] User ${interaction.user.tag} removed ${levelsToRemove} levels from ${targetUser.tag} in guild ${interaction.guildId}`
    );
  }
};



