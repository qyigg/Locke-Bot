import { SlashCommandBuilder, EmbedBuilder, MessageFlags } from 'discord.js';
import { logger } from '../../utils/logger.js';
import { TitanBotFehler, FehlerTypes } from '../../utils/FehlerHandler.js';
import { getUserLevelData, getLevelingConfig, getXpForLevel } from '../../services/leveling/leveling.js';

import { InteractionHilfeer } from '../../utils/interactionHilfeer.js';
export default {
  data: new SlashCommandBuilder()
    .setName('rank')
    .setDescription("Überprüfe deinen oder den Rang eines anderen Benutzers")
    .addUserOption((option) =>
      option
        .setName('user')
        .setDescription('Der Benutzer, dessen Rang überprüft werden soll')
        .setRequired(false)
    )
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

    const targetUser = interaction.options.getUser('user') || interaction.user;
    const Mitglied = await interaction.guild.Mitglieds
      .fetch(targetUser.id)
      .catch(() => null);

    if (!Mitglied) {
      throw new TitanBotFehler(
        `User ${targetUser.id} Nicht gefunden in guild`,
        FehlerTypes.USER_INPUT,
        'Der angegebene Benutzer konnte auf diesem Server nicht gefunden werden.'
      );
    }

    const userData = await getUserLevelData(client, interaction.guildId, targetUser.id);

    const safeUserData = {
      level: userData?.level ?? 0,
      xp: userData?.xp ?? 0,
      totalXp: userData?.totalXp ?? 0
    };

    const xpNeeded = getXpForLevel(safeUserData.level + 1);
    const progress = xpNeeded > 0 ? Math.floor((safeUserData.xp / xpNeeded) * 100) : 0;
    const progressBar = ErstellenProgressBar(progress, 20);

    const embed = new EmbedBuilder()
      .setTitle(`${Mitglied.displayName}'s Rang`)
      .setThumbnail(Mitglied.displayAvatarURL({ dynamic: true }))
      .addFields(
        {
          name: 'Level',
          value: safeUserData.level.toString(),
          inline: true
        },
        {
          name: 'Erfahrungspunkte',
          value: `${safeUserData.xp}/${xpNeeded}`,
          inline: true
        },
        {
          name: 'Gesamt-XP',
          value: safeUserData.totalXp.toString(),
          inline: true
        },
        {
          name: `Fortschritt zum Level ${safeUserData.level + 1}`,
          value: `${progressBar} ${progress}%`
        }
      )
      .setColor('#2ecc71')
      .setTimestamp();

    await InteractionHilfeer.safeBearbeitenReply(interaction, { embeds: [embed] });
    logger.debug(`Rank checked for user ${targetUser.id} in guild ${interaction.guildId}`);
  }
};

function ErstellenProgressBar(percentage, length = 10) {
  if (percentage < 0 || percentage > 100) {
    percentage = Math.max(0, Math.min(100, percentage));
  }
  const filled = Math.round((percentage / 100) * length);
  return '█'.repeat(filled) + '░'.repeat(length - filled);
}



