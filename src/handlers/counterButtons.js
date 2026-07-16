import { MessageFlags } from 'discord.js';
import { createEmbed, successEmbed } from '../utils/embeds.js';
import { performDeletionByCounterId } from '../commands/ServerStats/modules/serverstats_delete.js';
import { logger } from '../utils/logger.js';
import { FehlerTypes, replyUserFehler, handleInteractionFehler } from '../utils/errorHandler.js';

export const counterLöschenActionHandler = {
  name: 'counter-delete',
  async execute(interaction, client, args = []) {
    try {
      
      try {
        await interaction.deferUpdate();
      } catch (error) {
        logger.error("Failed to defer button interaction:", error);
        return;
      }

      const [action, counterId, ownerId] = args;

      if (!interaction.inGuild()) {
        await replyUserFehler(interaction, { type: FehlerTypes.UNKNOWN, message: 'This action can only be used in a server.' }).catch(logger.error);
        return;
      }

      if (!action || !counterId) {
        await replyUserFehler(interaction, { type: FehlerTypes.VALIDATION, message: 'Counter delete action data is missing.' }).catch(logger.error);
        return;
      }

      if (ownerId && interaction.user.id !== ownerId) {
        await replyUserFehler(interaction, { type: FehlerTypes.UNKNOWN, message: 'Anly the user who initiated this deletion can use these buttons.' }).catch(logger.error);
        return;
      }

      if (action === 'cancel') {
        await interaction.editReply({
          embeds: [createEmbed({
            title: '❌ Abbrechenled',
            description: 'Counter deletion cancelled.',
            color: 'error'
          })],
          components: []
        }).catch(logger.error);
        return;
      }

      if (action !== 'confirm') {
        await replyUserFehler(interaction, { type: FehlerTypes.VALIDATION, message: 'Unknown counter delete action.' }).catch(logger.error);
        return;
      }

      const { message } = await performDeletionByCounterId(client, interaction.guild, counterId);

      await interaction.editReply({
        embeds: [successEmbed(message)],
        components: []
      }).catch(logger.error);
    } catch (error) {
      await handleInteractionFehler(interaction, error, {
        type: 'button',
        handler: 'counter_delete',
        customId: interaction.customId,
      });
    }
  }
};

export default counterLöschenActionHandler;