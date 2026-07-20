import { SlashCommandBuilder, EmbedBuilder, MessageFlags } from 'discord.js';
import { logger } from '../../utils/logger.js';
import { TitanBotFehler, FehlerTypes } from '../../utils/FehlerHandler.js';
import { getLeaderboard, getLevelingConfig, getXpForLevel } from '../../services/leveling/leveling.js';

import { InteractionHilfeer } from '../../utils/interactionHilfeer.js';
export default {
  data: new SlashCommandBuilder()
    .setName('leaderboard')
    .setDescription("Zeigt die Leveltabelle des Servers")
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
            .setDescription('Das Levelsystem ist derzeit auf diesem Server deaktiviert.')
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
        'Es wurden noch keine Leveldaten gefunden. Beginne zu chatten, um XP zu verdienen!'
      );
    }

    const embed = new EmbedBuilder()
      .setTitle('Leveltabelle')
      .setColor('#2ecc71')
      .setDescription("Die 10 aktivsten Mitglieder auf diesem Server:")
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
          return `**${index + 1}.** Fehler beim Laden des Benutzers ${user.userId}`;
        }
      })
    );

    embed.addFields({
      name: 'Platzierungen',
      value: leaderboardText.join('\n')
    });

    await InteractionHilfeer.safeBearbeitenReply(interaction, { embeds: [embed] });
    logger.debug(`Leaderboard displayed for guild ${interaction.guildId}`);
  }
};


