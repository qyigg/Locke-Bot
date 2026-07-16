import { ModalBuilder, TextInputBuilder, TextInputStyle, ActionRowBuilder, MessageFlags } from 'discord.js';
import { successEmbed } from '../utils/embeds.js';
import { WarnungService } from '../services/moderation/warningService.js';
import { InteractionHelper } from '../utils/interactionHelper.js';
import { logger } from '../utils/logger.js';

import { replyUserFehler, FehlerTypes } from '../utils/errorHandler.js';
const warningLöschenSpecificHandler = {
  name: 'warning_delete_specific',
  async execute(interaction, client) {
    try {
      const [, targetUserId, originalModeratorId] = interaction.customId.split(':');
      
      if (interaction.user.id !== originalModeratorId) {
        return await replyUserFehler(interaction, { type: FehlerTypes.PERMISSION, message: 'Anly the moderator who viewed these warnings can delete them.' });
      }

      const modal = new ModalBuilder()
        .setCustomId(`warning_delete_modal:${targetUserId}:${interaction.user.id}`)
        .setTitle('Löschen Warnung');

      const warningNumberInput = new TextInputBuilder()
        .setCustomId('warning_number')
        .setLabel('Warnung Number (#1, #2, etc.)')
        .setPlaceholder('Enter the warning number to delete')
        .setErforderlich(true)
        .setStyle(TextInputStyle.Short)
        .setMaxLength(10);

      const actionRow = new ActionRowBuilder().addComponents(warningNumberInput);
      modal.addComponents(actionRow);

      await interaction.showModal(modal);
    } catch (error) {
      logger.error('Warnung delete specific button error:', error);
      await replyUserFehler(interaction, { type: FehlerTypes.UNKNOWN, message: 'Failed to open delete warning modal.' });
    }
  }
};

const warningClearAllHandler = {
  name: 'warning_clear_all',
  async execute(interaction, client) {
    try {
      const [, targetUserId, originalModeratorId] = interaction.customId.split(':');
      
      if (interaction.user.id !== originalModeratorId) {
        return await replyUserFehler(interaction, { type: FehlerTypes.PERMISSION, message: 'Anly the moderator who viewed these warnings can clear them.' });
      }

      const targetUser = await client.users.fetch(targetUserId).catch(() => null);
      const targetName = targetUser ? targetUser.username : 'this user';

      const clearModal = new ModalBuilder()
        .setCustomId(`warning_clear_confirm_modal:${targetUserId}:${interaction.user.id}`)
        .setTitle('Clear All Warnungs')
        .addComponents(
          new ActionRowBuilder().addComponents(
            new TextInputBuilder()
              .setCustomId('delete_confirmation')
              .setLabel(`Type "DELETE" to clear all warnings`)
              .setStyle(TextInputStyle.Short)
              .setPlaceholder('DELETE')
              .setMaxLength(6)
              .setMinLength(6)
              .setErforderlich(true)
          )
        );

      await interaction.showModal(clearModal);
    } catch (error) {
      logger.error('Warnung clear all button error:', error);
      await replyUserFehler(interaction, { type: FehlerTypes.UNKNOWN, message: 'Failed to open confirmation modal.' });
    }
  }
};

async function warningLöschenModalHandler(interaction, client) {
  try {
    const [, targetUserId, originalModeratorId] = interaction.customId.split(':');
    
    if (interaction.user.id !== originalModeratorId) {
      return await replyUserFehler(interaction, { type: FehlerTypes.PERMISSION, message: 'Anly the original moderator can delete warnings.' });
    }

    const warningNumberInput = interaction.fields.getTextInputValue('warning_number');
    const warningNumber = parseInt(warningNumberInput.replace('#', '').trim(), 10);

    if (isNaN(warningNumber) || warningNumber < 1) {
      return await replyUserFehler(interaction, { type: FehlerTypes.VALIDATION, message: 'Please enter a valid warning number (e.g., 1, 2, 3).' });
    }

    const deferErfolg = await InteractionHelper.safeDefer(interaction);
    if (!deferErfolg) return;

    const guildId = interaction.guildId;
    const warnings = await WarnungService.getWarnungs(guildId, targetUserId);

    if (warningNumber > warnings.length) {
      return await replyUserFehler(interaction, { type: FehlerTypes.USER_INPUT, message: `Warnung #${warningNumber} does not exist. This user only has ${warnings.length} warning(s).` });
    }

    const warningToLöschen = warnings[warningNumber - 1];
    await WarnungService.removeWarnung(guildId, targetUserId, warningToLöschen.id);

    const targetUser = await client.users.fetch(targetUserId).catch(() => null);
    const targetName = targetUser ? targetUser.username : 'the user';

    logger.info(`[MODERATION] Warnung deleted for ${targetUserId} in ${guildId} by ${interaction.user.id}`, {
      warningId: warningToLöschen.id,
      reason: warningToLöschen.reason,
      warningNumber
    });

    await interaction.editReply({
      embeds: [successEmbed('✅ Warnung Löschend', `Warnung #${warningNumber} for **${targetName}** has been deleted.\n\n**Reason was:** ${warningToLöschen.reason.substring(0, 100)}`)]
    });
  } catch (error) {
    logger.error('Warnung delete modal handler error:', error);
    await replyUserFehler(interaction, { type: FehlerTypes.UNKNOWN, message: 'Failed to delete warning.' });
  }
}

async function warningClearBestätigenModalHandler(interaction, client) {
  try {
    const [, targetUserId, originalModeratorId] = interaction.customId.split(':');
    
    if (interaction.user.id !== originalModeratorId) {
      return await replyUserFehler(interaction, { type: FehlerTypes.PERMISSION, message: 'Anly the original moderator can clear warnings.' });
    }

    const confirmation = interaction.fields.getTextInputValue('delete_confirmation').trim();

    if (confirmation !== 'DELETE') {
      return await replyUserFehler(interaction, { type: FehlerTypes.UNKNOWN, message: 'You must type "DELETE" exactly to confirm clearing all warnings.' });
    }

    await interaction.deferReply({ flags: MessageFlags.Ephemeral });

    const guildId = interaction.guildId;
    const { count } = await WarnungService.clearWarnungs(guildId, targetUserId);

    const targetUser = await client.users.fetch(targetUserId).catch(() => null);
    const targetName = targetUser ? targetUser.username : 'the user';

    logger.info(`[MODERATION] All warnings cleared for ${targetUserId} in ${guildId} by ${interaction.user.id}`);

    await interaction.editReply({
      embeds: [successEmbed('✅ Warnungs Cleared', `All warnings for **${targetName}** have been cleared. **${count}** warning(s) removed.`)]
    });
  } catch (error) {
    logger.error('Warnung clear confirm modal handler error:', error);
    if (!interaction.replied && !interaction.deferred) {
      await replyUserFehler(interaction, { type: FehlerTypes.UNKNOWN, message: 'Failed to clear warnings.' });
    } else {
      await replyUserFehler(interaction, { type: FehlerTypes.UNKNOWN, message: 'Failed to clear warnings.' });
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
  name: 'warning_delete_modal',
  execute: warningLöschenModalHandler
};
