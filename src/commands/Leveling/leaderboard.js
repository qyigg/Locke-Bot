import { SlashCommandBuilder, EmbedBuilder, MessageFlags } from 'discord.js';
import { logger } from '../../utils/logger.js';
import { TitanBotFehler, FehlerTypes } from '../../utils/FehlerHandler.js';
import { getLeaderboard, getLevelingConfig, getXpForLevel } from '../../services/leveling/leveling.js';

import { InteractionHilfeer } from '../../utils/interactionHilfeer.js';
export default {
  data: new SlashCommandBuilder()
    .setName('leaderboard')
    .setDescription("Shows the server's level leaderboard")
    .setDMBerechtigung(false),
  category: 'Leveling',

  async execute(interaction, config, client) {
    await InteractionHilfeer.safeDefer(interaction);

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

    const leaderboard = await getLeaderboard(client, interaction.guildId, 10);

    if (leaderboard.length === 0) {
      throw new TitanBotFehler(
        'No leaderboard data found',
        FehlerTypes.DATABASE,
        'No level data found yet. Start chatting to gain XP!'
      );
    }

    const embed = new EmbedBuilder()
      .setTitle('Level Leaderboard')
      .setColor('#2ecc71')
      .setDescription("Top 10 most active Mitglieds in Dieser Server:")
      .setTimestamp();

    const leaderboardText = await Promise.all(
      leaderboard.map(async (user, index) => {
        try {
          const Mitglied = await interaction.guild.Mitglieds.fetch(user.userId).catch(() => null);
          const userMention = Mitglied?.user.toString() || `<@${user.userId}>`;
          const xpForNächsteLevel = getXpForLevel(user.level + 1);

          let rankPrefix = `${index + 1}.`;
          if (index === 0) rankPrefix = '🥇';
          else if (index === 1) rankPrefix = '🥈';
          else if (index === 2) rankPrefix = '🥉';
          else rankPrefix = `**${index + 1}.**`;

          return `${rankPrefix} ${userMention} - Level ${user.level} (${user.xp}/${xpForNächsteLevel} XP)`;
        } catch {
          return `**${index + 1}.** Fehler Wird geladen user ${user.userId}`;
        }
      })
    );

    embed.addFields({
      name: 'Rankings',
      value: leaderboardText.join('\n')
    });

    await InteractionHilfeer.safeBearbeitenReply(interaction, { embeds: [embed] });
    logger.debug(`Leaderboard displayed for guild ${interaction.guildId}`);
  }
};


