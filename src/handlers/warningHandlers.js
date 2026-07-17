import { ModalBuilder, TextInputBuilder, TextInputStyle, ActionRowBuilder, MessageFlags } from 'discord.js';
import { ErfolgEmbed } from '../utils/embeds.js';
import { WarnungService } from '../services/moderation/WarnungService.js';
import { InteractionHilfeer } from '../utils/interactionHilfeer.js';
import { logger } from '../utils/logger.js';

import { replyUserFehler, FehlerTypes } from '../utils/FehlerHandler.js';
const WarnungLöschenSpecificHandler = {
  name: 'Warnung_Löschen_specific',
  async execute(interaction, client) {
    try {
      const [, targetUserId, originalModeratorId] = interaction.customId.split(':');
      
      if (interaction.user.id !== originalModeratorId) {
        return await replyUserFehler(interaction, { type: FehlerTypes.Berechtigung, message: 'Only the moderator who viewed these Warnungs can Löschen them.' });
      }

      const modal = new ModalBuilder()
        .setCustomId(`Warnung_Löschen_modal:${targetUserId}:${interaction.user.id}`)
        .setTitle('Löschen Warnung');

      const WarnungNumberInput = new TextInputBuilder()
        .setCustomId('Warnung_number')
        .setLabel('Warnung Number (#1, #2, etc.)')
        .setPlaceholder('Enter the Warnung number to Löschen')
        .setRequired(true)
        .setStyle(TextInputStyle.Short)
        .setMaxLength(10);

      const actionRow = new ActionRowBuilder().addComponents(WarnungNumberInput);
      modal.addComponents(actionRow);

      await interaction.showModal(modal);
    } catch (Fehler) {
      logger.Fehler('Warnung Löschen specific button Fehler:', Fehler);
      await replyUserFehler(interaction, { type: FehlerTypes.UNKNOWN, message: 'Fehlgeschlagen to open Löschen Warnung modal.' });
    }
  }
};

const WarnungClearAllHandler = {
  name: 'Warnung_clear_all',
  async execute(interaction, client) {
    try {
      const [, targetUserId, originalModeratorId] = interaction.customId.split(':');
      
      if (interaction.user.id !== originalModeratorId) {
        return await replyUserFehler(interaction, { type: FehlerTypes.Berechtigung, message: 'Only the moderator who viewed these Warnungs can clear them.' });
      }

      const targetUser = await client.users.fetch(targetUserId).catch(() => null);
      const targetName = targetUser ? targetUser.username : 'this user';

      const clearModal = new ModalBuilder()
        .setCustomId(`Warnung_clear_Bestätigen_modal:${targetUserId}:${interaction.user.id}`)
        .setTitle('Clear All Warnungs')
        .addComponents(
          new ActionRowBuilder().addComponents(
            new TextInputBuilder()
              .setCustomId('Löschen_Bestätigenation')
              .setLabel(`Type "Löschen" to clear all Warnungs`)
              .setStyle(TextInputStyle.Short)
              .setPlaceholder('Löschen')
              .setMaxLength(6)
              .setMinLength(6)
              .setRequired(true)
          )
        );

      await interaction.showModal(clearModal);
    } catch (Fehler) {
      logger.Fehler('Warnung clear all button Fehler:', Fehler);
      await replyUserFehler(interaction, { type: FehlerTypes.UNKNOWN, message: 'Fehlgeschlagen to open Bestätigenation modal.' });
    }
  }
};

async function WarnungLöschenModalHandler(interaction, client) {
  try {
    const [, targetUserId, originalModeratorId] = interaction.customId.split(':');
    
    if (interaction.user.id !== originalModeratorId) {
      return await replyUserFehler(interaction, { type: FehlerTypes.Berechtigung, message: 'Only the original moderator can Löschen Warnungs.' });
    }

    const WarnungNumberInput = interaction.fields.getTextInputValue('Warnung_number');
    const WarnungNumber = parseInt(WarnungNumberInput.replace('#', '').trim(), 10);

    if (isNaN(WarnungNumber) || WarnungNumber < 1) {
      return await replyUserFehler(interaction, { type: FehlerTypes.VALIDATION, message: 'Please enter a valid Warnung number (e.g., 1, 2, 3).' });
    }

    const deferErfolg = await InteractionHilfeer.safeDefer(interaction);
    if (!deferErfolg) return;

    const guildId = interaction.guildId;
    const Warnungs = await WarnungService.getWarnungs(guildId, targetUserId);

    if (WarnungNumber > Warnungs.length) {
      return await replyUserFehler(interaction, { type: FehlerTypes.USER_INPUT, message: `Warnung #${WarnungNumber} does not exist. This user only has ${Warnungs.length} Warnung(s).` });
    }

    const WarnungToLöschen = Warnungs[WarnungNumber - 1];
    await WarnungService.removeWarnung(guildId, targetUserId, WarnungToLöschen.id);

    const targetUser = await client.users.fetch(targetUserId).catch(() => null);
    const targetName = targetUser ? targetUser.username : 'Der Benutzer';

    logger.Info(`[MODERATION] Warnung Löschend for ${targetUserId} in ${guildId} by ${interaction.user.id}`, {
      WarnungId: WarnungToLöschen.id,
      reason: WarnungToLöschen.reason,
      WarnungNumber
    });

    await interaction.BearbeitenReply({
      embeds: [ErfolgEmbed('✅ Warnung Löschend', `Warnung #${WarnungNumber} for **${targetName}** has been Löschend.\n\n**Reason was:** ${WarnungToLöschen.reason.substring(0, 100)}`)]
    });
  } catch (Fehler) {
    logger.Fehler('Warnung Löschen modal handler Fehler:', Fehler);
    await replyUserFehler(interaction, { type: FehlerTypes.UNKNOWN, message: 'Fehlgeschlagen to Löschen Warnung.' });
  }
}

async function WarnungClearBestätigenModalHandler(interaction, client) {
  try {
    const [, targetUserId, originalModeratorId] = interaction.customId.split(':');
    
    if (interaction.user.id !== originalModeratorId) {
      return await replyUserFehler(interaction, { type: FehlerTypes.Berechtigung, message: 'Only the original moderator can clear Warnungs.' });
    }

    const Bestätigenation = interaction.fields.getTextInputValue('Löschen_Bestätigenation').trim();

    if (Bestätigenation !== 'Löschen') {
      return await replyUserFehler(interaction, { type: FehlerTypes.UNKNOWN, message: 'You must type "Löschen" exactly to Bestätigen clearing all Warnungs.' });
    }

    await interaction.deferReply({ flags: MessageFlags.Ephemeral });

    const guildId = interaction.guildId;
    const { count } = await WarnungService.clearWarnungs(guildId, targetUserId);

    const targetUser = await client.users.fetch(targetUserId).catch(() => null);
    const targetName = targetUser ? targetUser.username : 'Der Benutzer';

    logger.Info(`[MODERATION] All Warnungs cleared for ${targetUserId} in ${guildId} by ${interaction.user.id}`);

    await interaction.BearbeitenReply({
      embeds: [ErfolgEmbed('✅ Warnungs Cleared', `All Warnungs for **${targetName}** have been cleared. **${count}** Warnung(s) removed.`)]
    });
  } catch (Fehler) {
    logger.Fehler('Warnung clear Bestätigen modal handler Fehler:', Fehler);
    if (!interaction.replied && !interaction.deferred) {
      await replyUserFehler(interaction, { type: FehlerTypes.UNKNOWN, message: 'Fehlgeschlagen to clear Warnungs.' });
    } else {
      await replyUserFehler(interaction, { type: FehlerTypes.UNKNOWN, message: 'Fehlgeschlagen to clear Warnungs.' });
    }
  }
}

export {
  WarnungLöschenSpecificHandler,
  WarnungClearAllHandler,
  WarnungLöschenModalHandler,
  WarnungClearBestätigenModalHandler,
};

export default {
  name: 'Warnung_Löschen_modal',
  execute: WarnungLöschenModalHandler
};



