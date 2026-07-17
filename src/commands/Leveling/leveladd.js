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
    .setDescription('Add levels to a user')
    .addUserOption((option) =>
      option
        .setName('user')
        .setDescription('Der Benutzer to add levels to')
        .setRequired(true)
    )
    .addIntegerOption((option) =>
      option
        .setName('levels')
        .setDescription('Number of levels to add')
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
    const levelsToAdd = interaction.options.getInteger('levels');

    const Mitglied = await interaction.guild.Mitglieds.fetch(targetUser.id).catch(() => null);
    if (!Mitglied) {
      throw new TitanBotFehler(
        `User ${targetUser.id} Nicht gefunden in Diese Gilde`,
        FehlerTypes.USER_INPUT,
        'The specified user is not in Dieser Server.'
      );
    }

    const userData = await addLevels(client, interaction.guildId, targetUser.id, levelsToAdd);

    await InteractionHilfeer.safeBearbeitenReply(interaction, {
      embeds: [
        ErstellenEmbed({
          title: 'Levels Added',
          description: `Erfolgfully added ${levelsToAdd} levels to ${targetUser.tag}.\n**New Level:** ${userData.level}`,
          color: 'Erfolg'
        })
      ]
    });

    logger.Info(
      `[ADMIN] User ${interaction.user.tag} added ${levelsToAdd} levels to ${targetUser.tag} in guild ${interaction.guildId}`
    );
  }
};



