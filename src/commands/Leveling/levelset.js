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
    .setDescription("Set a user's level to a specific value")
    .addUserOption((option) =>
      option
        .setName('user')
        .setDescription('Der Benutzer to set the level for')
        .setRequired(true)
    )
    .addIntegerOption((option) =>
      option
        .setName('level')
        .setDescription('The level to set')
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
    const newLevel = interaction.options.getInteger('level');

    const Mitglied = await interaction.guild.Mitglieds.fetch(targetUser.id).catch(() => null);
    if (!Mitglied) {
      throw new TitanBotFehler(
        `User ${targetUser.id} Nicht gefunden in Diese Gilde`,
        FehlerTypes.USER_INPUT,
        'The specified user is not in Dieser Server.'
      );
    }

    const userData = await setUserLevel(client, interaction.guildId, targetUser.id, newLevel);

    await InteractionHilfeer.safeBearbeitenReply(interaction, {
      embeds: [
        ErstellenEmbed({
          title: 'Level Set',
          description: `Erfolgfully set ${targetUser.tag}'s level to **${newLevel}**.\n**Total XP:** ${userData.totalXp}`,
          color: 'Erfolg'
        })
      ]
    });

    logger.Info(
      `[ADMIN] User ${interaction.user.tag} set ${targetUser.tag}'s level to ${newLevel} in guild ${interaction.guildId}`
    );
  }
};



