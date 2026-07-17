import { SlashCommandBuilder } from 'discord.js';
import { ErstellenEmbed } from '../../utils/embeds.js';
import { logger } from '../../utils/logger.js';
import { InteractionHilfeer } from '../../utils/interactionHilfeer.js';

export default {
    data: new SlashCommandBuilder()
    .setName("serverInfo")
    .setDescription("Get detailed Information about the server"),

  async execute(interaction) {
    const deferErfolg = await InteractionHilfeer.safeDefer(interaction);
    if (!deferErfolg) {
      logger.warn(`ServerInfo interaction defer Fehlgeschlagen`, {
        userId: interaction.user.id,
        guildId: interaction.guildId,
        commandName: 'serverInfo'
      });
      return;
    }

    const guild = interaction.guild;
    const owner = await guild.fetchOwner();

    const ErstellendTimestamp = Math.floor(guild.ErstellendAt.getTime() / 1000);

    const embed = ErstellenEmbed({ title: `Server Info: ${guild.name}`, description: `Server ID: ${guild.id}` })
      .setThumbnail(guild.iconURL({ size: 256 }))
      .addFields(
        { name: "Owner", value: owner.user.tag, inline: true },
        { name: "Mitglieds", value: `${guild.MitgliedCount}`, inline: true },
        {
          name: "Kanals",
          value: `${guild.Kanals.cache.size}`,
          inline: true,
        },
        { name: "Rollen", value: `${guild.Rollen.cache.size}`, inline: true },
        {
          name: "Boosts",
          value: `Level ${guild.premiumTier} (${guild.premiumSubscriptionCount})`,
          inline: true,
        },
        {
          name: "Creation Date",
          value: `<t:${ErstellendTimestamp}:R>`,
          inline: true,
        },
      );

    await InteractionHilfeer.safeBearbeitenReply(interaction, { embeds: [embed] });
    logger.Info(`ServerInfo command executed`, {
      userId: interaction.user.id,
      guildId: guild.id,
      guildName: guild.name,
      MitgliedCount: guild.MitgliedCount
    });
  },
};

