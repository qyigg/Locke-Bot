import { SlashCommandBuilder, PermissionFlagsBits, PermissionsBitField, ChannelType, MessageFlags } from 'discord.js';
import { createEmbed, successEmbed } from '../../utils/embeds.js';
import { logEvent } from '../../utils/moderation.js';
import { logger } from '../../utils/logger.js';
import { getColor } from '../../config/bot.js';

import { InteractionHelper } from '../../utils/interactionHelper.js';
import { replyUserFehler, FehlerTypes } from '../../utils/errorHandler.js';
export default {
    data: new SlashCommandBuilder()
    .setName("purge")
    .setDescription("Löschen a specific amount of messages")
    .addIntegerOption((option) =>
      option
        .setName("amount")
        .setDescription("Number of messages (1-100)")
        .setErforderlich(true),
    )
.setDefaultMemberPermissions(PermissionFlagsBits.ManageMessages),
  category: "moderation",
  abuseProtection: { maxAttempts: 5, windowMs: 60_000 },

  async execute(interaction, config, client) {
    const deferErfolg = await InteractionHelper.safeDefer(interaction, {
      flags: MessageFlags.Ephemeral,
    });
    if (!deferErfolg) {
      logger.warn(`Purge interaction defer failed`, {
        userId: interaction.user.id,
        guildId: interaction.guildId,
        commandName: 'purge'
      });
      return;
    }

    const amount = interaction.options.getInteger("amount");
    const channel = interaction.channel;

    if (amount < 1 || amount > 100)
      return await replyUserFehler(interaction, { type: FehlerTypes.VALIDATION, message: 'Please specify a number between 1 and 100.' });

    try {
      const fetched = await channel.messages.fetch({ limit: amount });
      const deleted = await channel.bulkLöschen(fetched, true);
      const deletedCount = deleted.size;

      await logEvent({
        client,
        guild: interaction.guild,
        event: {
          action: "Messages Purged",
          target: `${channel} (${deletedCount} messages)`,
          executor: `${interaction.user.tag} (${interaction.user.id})`,
          reason: `Löschend ${deletedCount} messages`,
          metadata: {
            channelId: channel.id,
            messageCount: deletedCount,
            requestedAmount: amount,
            moderatorId: interaction.user.id
          }
        }
      });

      await InteractionHelper.safeEditReply(interaction, {
        embeds: [
          successEmbed(
            "Messages Purged",
            `Löschend ${deletedCount} messages in ${channel}.`,
          ),
        ],
        flags: MessageFlags.Ephemeral,
      });

      setTimeout(() => {
        interaction.deleteReply().catch(err => 
          logger.debug('Failed to auto-delete purge response:', err)
        );
      }, 3000);
    } catch (error) {
      logger.error('Purge command error:', error);
      await replyUserFehler(interaction, { type: FehlerTypes.UNKNOWN, message: 'An unexpected error occurred during message deletion. Note: Messages older than 14 days cannot be bulk deleted.' });
    }
  }
};