import { SlashCommandBuilder, PermissionFlagsBits, PermissionsBitField, ChannelType } from 'discord.js';
import { createEmbed, successEmbed, infoEmbed, warningEmbed } from '../../utils/embeds.js';
import { logEvent } from '../../utils/moderation.js';
import { logger } from '../../utils/logger.js';
import { getColor } from '../../config/bot.js';

import { InteractionHelper } from '../../utils/interactionHelper.js';
import { replyUserError, ErrorTypes } from '../../utils/errorHandler.js';
export default {
    data: new SlashCommandBuilder()
    .setName("lock")
    .setDescription(
      "Sperrt den aktuellen Kanal (verhindert Nachrichten von @everyone).",
    )
.setDefaultMemberPermissions(PermissionFlagsBits.ManageChannels),
  category: "moderation",

  async execute(interaction, config, client) {
    const deferSuccess = await InteractionHelper.safeDefer(interaction);
    if (!deferSuccess) {
      logger.warn(`Lock interaction defer failed`, {
        userId: interaction.user.id,
        guildId: interaction.guildId,
        commandName: 'lock'
      });
      return;
    }

    const channel = interaction.channel;
    const everyoneRole = interaction.guild.roles.everyone;

    try {
      const currentPermissions = channel.permissionsFor(everyoneRole);
      if (currentPermissions.has(PermissionFlagsBits.SendMessages) === false) {
        return await replyUserError(interaction, { type: ErrorTypes.UNKNOWN, message: `${channel} ist bereits gesperrt.` });
      }

      await channel.permissionOverwrites.edit(
        everyoneRole,
        { SendMessages: false },
{ type: 0, reason: `Kanal gesperrt von ${interaction.user.tag}` },
      );

      await logEvent({
        client,
        guild: interaction.guild,
        event: {
          action: "Kanal gesperrt",
          target: channel.toString(),
          executor: `${interaction.user.tag} (${interaction.user.id})`,
          metadata: {
            channelId: channel.id,
            category: channel.parent?.name || 'Keine',
            moderatorId: interaction.user.id
          }
        }
      });

      await InteractionHelper.safeEditReply(interaction, {
        embeds: [
          successEmbed(
            `🔒 **Kanal gesperrt**`,
            `${channel} ist jetzt gesperrt. Hier kann aktuell niemand schreiben.`,
          ),
        ],
      });
    } catch (error) {
      logger.error('Lock command error:', error);
      await replyUserError(interaction, { type: ErrorTypes.PERMISSION, message: 'Beim Sperren des Kanals ist ein unerwarteter Fehler aufgetreten. Prüfe meine Berechtigungen (ich brauche „Kanäle verwalten“).' });
    }
  }
};