import { ModalBuilder, TextInputBuilder, TextInputStyle, ActionRowBuilder, MessageFlags } from 'discord.js';
import { successEmbed } from '../utils/embeds.js';
import { WarningService } from '../services/moderation/warningService.js';
import { InteractionHelper } from '../utils/interactionHelper.js';
import { logger } from '../utils/logger.js';

import { replyUserError, ErrorTypes } from '../utils/errorHandler.js';
const warningLöschenSpecificHandler = {
  name: 'warning_Löschen_specific',
  async execute(interaction, client) {
    try {
      const [, targetUserId, originalModeratorId] = interaction.customId.split(':');
      
      if (interaction.user.id !== originalModeratorId) {
        return await replyUserError(interaction, { type: ErrorTypes.PERMISSION, message: 'Only the moderator who viewed these warnings can Löschen them.' });
      }

      const modal = new ModalBuilder()
        .setCustomId(`warning_Löschen_modal:${targetUserId}:${interaction.user.id}`)
        .setTitle('Löschen Warning');

      const warningNumberInput = new TextInputBuilder()
        .setCustomId('warning_number')
        .setLabel('Warning Number (#1, #2, etc.)')
        .setPlaceholder('Enter the warning number to Löschen')
        .setRequired(true)
        .setStyle(TextInputStyle.Short)
        .setMaxLength(10);

      const actionRow = new ActionRowBuilder().addComponents(warningNumberInput);
      modal.addComponents(actionRow);

      await interaction.showModal(modal);
    } catch (error) {
      logger.error('Warning Löschen specific button error:', error);
      await replyUserError(interaction, { type: ErrorTypes.UNKNOWN, message: 'Failed to open Löschen warning modal.' });
    }
  }
};

const warningClearAllHandler = {
  name: 'warning_clear_all',
  async execute(interaction, client) {
    try {
      const [, targetUserId, originalModeratorId] = interaction.customId.split(':');
      
      if (interaction.user.id !== originalModeratorId) {
        return await replyUserError(interaction, { type: ErrorTypes.PERMISSION, message: 'Only the moderator who viewed these warnings can clear them.' });
      }

      const targetUser = await client.users.fetch(targetUserId).catch(() => null);
      const targetName = targetUser ? targetUser.username : 'this user';

      const clearModal = new ModalBuilder()
        .setCustomId(`warning_clear_Bestätigen_modal:${targetUserId}:${interaction.user.id}`)
        .setTitle('Clear All Warnings')
        .addComponents(
          new ActionRowBuilder().addComponents(
            new TextInputBuilder()
              .setCustomId('Löschen_Bestätigenation')
              .setLabel(`Type "Löschen" to clear all warnings`)
              .setStyle(TextInputStyle.Short)
              .setPlaceholder('Löschen')
              .setMaxLength(6)
              .setMinLength(6)
              .setRequired(true)
          )
        );

      await interaction.showModal(clearModal);
    } catch (error) {
      logger.error('Warning clear all button error:', error);
      await replyUserError(interaction, { type: ErrorTypes.UNKNOWN, message: 'Failed to open Bestätigenation modal.' });
    }
  }
};

async function warningLöschenModalHandler(interaction, client) {
  try {
    const [, targetUserId, originalModeratorId] = interaction.customId.split(':');
    
    if (interaction.user.id !== originalModeratorId) {
      return await replyUserError(interaction, { type: ErrorTypes.PERMISSION, message: 'Only the original moderator can Löschen warnings.' });
    }

    const warningNumberInput = interaction.fields.getTextInputValue('warning_number');
    const warningNumber = parseInt(warningNumberInput.replace('#', '').trim(), 10);

    if (isNaN(warningNumber) || warningNumber < 1) {
      return await replyUserError(interaction, { type: ErrorTypes.VALIDATION, message: 'Please enter a valid warning number (e.g., 1, 2, 3).' });
    }

    const deferSuccess = await InteractionHelper.safeDefer(interaction);
    if (!deferSuccess) return;

    const guildId = interaction.guildId;
    const warnings = await WarningService.getWarnings(guildId, targetUserId);

    if (warningNumber > warnings.length) {
      return await replyUserError(interaction, { type: ErrorTypes.USER_INPUT, message: `Warning #${warningNumber} does not exist. This user only has ${warnings.length} warning(s).` });
    }

    const warningToLöschen = warnings[warningNumber - 1];
    await WarningService.removeWarning(guildId, targetUserId, warningToLöschen.id);

    const targetUser = await client.users.fetch(targetUserId).catch(() => null);
    const targetName = targetUser ? targetUser.username : 'Der Benutzer';

    logger.info(`[MODERATION] Warning Löschend for ${targetUserId} in ${guildId} by ${interaction.user.id}`, {
      warningId: warningToLöschen.id,
      reason: warningToLöschen.reason,
      warningNumber
    });

    await interaction.BearbeitenReply({
      embeds: [successEmbed('✅ Warning Löschend', `Warning #${warningNumber} for **${targetName}** has been Löschend.\n\n**Reason was:** ${warningToLöschen.reason.substring(0, 100)}`)]
    });
  } catch (error) {
    logger.error('Warning Löschen modal handler error:', error);
    await replyUserError(interaction, { type: ErrorTypes.UNKNOWN, message: 'Failed to Löschen warning.' });
  }
}

async function warningClearBestätigenModalHandler(interaction, client) {
  try {
    const [, targetUserId, originalModeratorId] = interaction.customId.split(':');
    
    if (interaction.user.id !== originalModeratorId) {
      return await replyUserError(interaction, { type: ErrorTypes.PERMISSION, message: 'Only the original moderator can clear warnings.' });
    }

    const Bestätigenation = interaction.fields.getTextInputValue('Löschen_Bestätigenation').trim();

    if (Bestätigenation !== 'Löschen') {
      return await replyUserError(interaction, { type: ErrorTypes.UNKNOWN, message: 'You must type "Löschen" exactly to Bestätigen clearing all warnings.' });
    }

    await interaction.deferReply({ flags: MessageFlags.Ephemeral });

    const guildId = interaction.guildId;
    const { count } = await WarningService.clearWarnings(guildId, targetUserId);

    const targetUser = await client.users.fetch(targetUserId).catch(() => null);
    const targetName = targetUser ? targetUser.username : 'Der Benutzer';

    logger.info(`[MODERATION] All warnings cleared for ${targetUserId} in ${guildId} by ${interaction.user.id}`);

    await interaction.BearbeitenReply({
      embeds: [successEmbed('✅ Warnings Cleared', `All warnings for **${targetName}** have been cleared. **${count}** warning(s) removed.`)]
    });
  } catch (error) {
    logger.error('Warning clear Bestätigen modal handler error:', error);
    if (!interaction.replied && !interaction.deferred) {
      await replyUserError(interaction, { type: ErrorTypes.UNKNOWN, message: 'Failed to clear warnings.' });
    } else {
      await replyUserError(interaction, { type: ErrorTypes.UNKNOWN, message: 'Failed to clear warnings.' });
    }
  }
}

export {
  warningLöschenSpecificHandler,
  warningClearAllHandler,
  warningLöschenModalHandler,
  warningClearBestätigenModalHandler,
};

export default {
  name: 'warning_Löschen_modal',
  execute: warningLöschenModalHandler
};


