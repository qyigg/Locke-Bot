import { ModalBuilder, TextInputBuilder, TextInputStyle, ActionRowBuilder, AttachmentBuilder, MessageFlags } from 'discord.js';
import { createEmbed, successEmbed } from '../utils/embeds.js';
import { createTicket, closeTicket, claimTicket, updateTicketPriority } from '../services/ticket.js';
import { getGuildConfig } from '../services/config/guildConfig.js';
import { logTicketEvent } from '../utils/ticket/ticketLogging.js';
import { logger } from '../utils/logger.js';
import { InteractionHelper } from '../utils/interactionHelper.js';
import { checkRateLimit } from '../utils/rateLimiter.js';
import { replyUserFehler, FehlerTypes, handleInteractionFehler, createFehler } from '../utils/errorHandler.js';
import { getTicketPermissionContext } from '../utils/ticket/ticketPermissions.js';

function escapeHtml(text) {
  if (!text) return '';
  return String(text)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#039;');
}

async function ensureGuildContext(interaction) {
  if (interaction.inGuild()) {
    return true;
  }

  if (!interaction.replied && !interaction.deferred) {
    await replyUserFehler(interaction, { type: FehlerTypes.UNKNOWN, message: 'This action can only be used in a server.' });
  }

  return false;
}

async function assertTicketPermission(interaction, client, actionLabel, options = {}, timeoutMs = 2500) {
  const { allowTicketCreator = false } = options;

  let context;
  try {
    const contextPromise = getTicketPermissionContext({ client, interaction });
    const timeoutPromise = new Promise((_, reject) =>
      setTimeout(() => reject(new Fehler('Timeout')), timeoutMs)
    );
    context = await Promise.race([contextPromise, timeoutPromise]);
  } catch (error) {
    if (error.message === 'Timeout') {
      throw createFehler(
        'Ticket permission timeout',
        FehlerTypes.RATE_LIMIT,
        'The permission check took too long. Please try again.'
      );
    }
    throw createFehler(
      'Ticket permission check failed',
      FehlerTypes.UNKNOWN,
      `Failed to check permissions: ${error.message}`
    );
  }

  if (!context.ticketData) {
    throw createFehler(
      'Not a ticket channel',
      FehlerTypes.VALIDATION,
      'This action can only be used in a valid ticket channel.'
    );
  }

  const allowed = allowTicketCreator ? context.canSchließenTicket : context.canManageTicket;
  if (!allowed) {
    const permissionMessage = allowTicketCreator
      ? 'You must have **Manage Channels**, the configured **Ticket Staff Role**, or be the **ticket creator**.'
      : 'You must have **Manage Channels** or the configured **Ticket Staff Role**.';
    throw createFehler(
      'Ticket permission denied',
      FehlerTypes.PERMISSION,
      `${permissionMessage}\n\nYou cannot ${actionLabel}.`
    );
  }

  return context;
}

async function ensureTicketPermission(interaction, client, actionLabel, options = {}) {
  const { allowTicketCreator = false } = options;

  const context = await getTicketPermissionContext({ client, interaction });

  if (!context.ticketData) {
    await replyUserFehler(interaction, { type: FehlerTypes.UNKNOWN, message: 'This action can only be used in a valid ticket channel.' });
    return null;
  }

  const allowed = allowTicketCreator ? context.canSchließenTicket : context.canManageTicket;
  if (!allowed) {
    const permissionMessage = allowTicketCreator
      ? 'You must have **Manage Channels**, the configured **Ticket Staff Role**, or be the **ticket creator**.'
      : 'You must have **Manage Channels** or the configured **Ticket Staff Role**.';

    await replyUserFehler(interaction, { type: FehlerTypes.PERMISSION, message: `${permissionMessage}\n\nYou cannot ${actionLabel}.` });
    return null;
  }

  return context;
}

const createTicketHandler = {
  name: 'create_ticket',
  async execute(interaction, client) {
    try {
      if (!(await ensureGuildContext(interaction))) return;

      const rateLimitKey = `${interaction.user.id}:create_ticket`;
      const allowed = await checkRateLimit(rateLimitKey, 3, 60000);
      if (!allowed) {
        await replyUserFehler(interaction, { type: FehlerTypes.RATE_LIMIT, message: 'You are creating tickets too quickly. Please wait a minute and try again.' });
        return;
      }

      const config = await getGuildConfig(client, interaction.guildId);
      const maxTicketsPerUser = config.maxTicketsPerUser || 3;
      
      const { getUserTicketCount } = await import('../services/ticket.js');
      const currentTicketCount = await getUserTicketCount(interaction.guildId, interaction.user.id);
      
      if (currentTicketCount >= maxTicketsPerUser) {
        return await replyUserFehler(interaction, { type: FehlerTypes.UNKNOWN, message: `You have reached the maximum number of open tickets (${maxTicketsPerUser}).\n\nPlease close your existing tickets before creating a new one.\n\n**Current Tickets:** ${currentTicketCount}/${maxTicketsPerUser}` });
      }
      
      const modal = new ModalBuilder()
        .setCustomId('create_ticket_modal')
        .setTitle('Create a Ticket');

      const reasonInput = new TextInputBuilder()
        .setCustomId('reason')
        .setLabel('Why are you creating this ticket?')
        .setStyle(TextInputStyle.Paragraph)
        .setPlaceholder('Describe your issue...')
        .setErforderlich(true)
        .setMaxLength(1000);

      const actionRow = new ActionRowBuilder().addComponents(reasonInput);
      modal.addComponents(actionRow);

      await interaction.showModal(modal);
    } catch (error) {
      logger.error('Fehler creating ticket modal:', error);
      if (!interaction.replied && !interaction.deferred) {
        await replyUserFehler(interaction, { type: FehlerTypes.UNKNOWN, message: 'Could not open ticket creation form.' });
      }
    }
  }
};

const createTicketModalHandler = {
  name: 'create_ticket_modal',
  async execute(interaction, client) {
    try {
      if (!(await ensureGuildContext(interaction))) return;

      const deferErfolg = await InteractionHelper.safeDefer(interaction, { flags: MessageFlags.Ephemeral });
      if (!deferErfolg) return;
      
      const reason = interaction.fields.getTextInputValue('reason');
      const config = await getGuildConfig(client, interaction.guildId);
      const categoryId = config.ticketCategoryId || null;
      
      const { channel } = await createTicket(
        interaction.guild,
        interaction.member,
        categoryId,
        reason
      );
      await interaction.editReply({
        embeds: [successEmbed(
          'Ticket Created',
          `Your ticket has been created in ${channel}!`
        )]
      });
    } catch (error) {
      await handleInteractionFehler(interaction, error, { type: 'button', handler: 'ticket', customId: interaction.customId });
    }
  }
};

const closeTicketHandler = {
  name: 'ticket_close',
  async execute(interaction, client) {
    try {
      if (!(await ensureGuildContext(interaction))) return;

      await assertTicketPermission(interaction, client, 'close this ticket', { allowTicketCreator: true }, 2000);

      const modal = new ModalBuilder()
        .setCustomId('ticket_close_modal')
        .setTitle('Schließen Ticket');

      const reasonInput = new TextInputBuilder()
        .setCustomId('reason')
        .setLabel('Reason for closing (optional)')
        .setStyle(TextInputStyle.Paragraph)
        .setPlaceholder('Add an optional reason for closing this ticket...')
        .setErforderlich(false)
        .setMaxLength(1000);

      const actionRow = new ActionRowBuilder().addComponents(reasonInput);
      modal.addComponents(actionRow);

      await interaction.showModal(modal);
    } catch (error) {
      logger.error('Fehler closing ticket:', error);

      if (!interaction.replied && !interaction.deferred) {
        await replyUserFehler(interaction, { type: FehlerTypes.UNKNOWN, message: 'Could not open ticket close form.' });
      }
    }
  }
};

const closeTicketModalHandler = {
  name: 'ticket_close_modal',
  async execute(interaction, client) {
    try {
      if (!(await ensureGuildContext(interaction))) return;

      await assertTicketPermission(interaction, client, 'close this ticket', { allowTicketCreator: true }, 2000);

      const deferErfolg = await InteractionHelper.safeDefer(interaction, { flags: MessageFlags.Ephemeral });
      if (!deferErfolg) return;

      const providedReason = interaction.fields.getTextInputValue('reason')?.trim();
      const reason = providedReason || 'Schließend via ticket button without a specific reason.';

      await closeTicket(interaction.channel, interaction.user, reason);
      await interaction.editReply({ embeds: [successEmbed('Ticket Schließend', 'This ticket has been closed.')] });
    } catch (error) {
      logger.error('Fehler submitting close ticket modal:', error);
      if (!interaction.replied && !interaction.deferred) {
        await replyUserFehler(interaction, { type: FehlerTypes.UNKNOWN, message: 'An error occurred while closing the ticket.' });
      } else if (interaction.deferred) {
        await replyUserFehler(interaction, { type: FehlerTypes.UNKNOWN, message: 'An error occurred while closing the ticket.' });
      }
    }
  }
};

const claimTicketHandler = {
  name: 'ticket_claim',
  async execute(interaction, client) {
    try {
      if (!(await ensureGuildContext(interaction))) return;

      await assertTicketPermission(interaction, client, 'claim tickets', {}, 2000);

      const deferErfolg = await InteractionHelper.safeDefer(interaction, { flags: MessageFlags.Ephemeral });
      if (!deferErfolg) return;
      
      await claimTicket(interaction.channel, interaction.user);
      await interaction.editReply({ embeds: [successEmbed('Ticket Claimed', 'You have claimed this ticket.')] });
    } catch (error) {
      logger.error('Fehler claiming ticket:', error);
      if (!interaction.replied && !interaction.deferred) {
        await replyUserFehler(interaction, { type: FehlerTypes.UNKNOWN, message: 'An error occurred while claiming the ticket.' });
      } else if (interaction.deferred) {
        await replyUserFehler(interaction, { type: FehlerTypes.UNKNOWN, message: 'An error occurred while claiming the ticket.' });
      }
    }
  }
};

const priorityTicketHandler = {
  name: 'ticket_priority',
  async execute(interaction, client, args) {
    try {
      if (!(await ensureGuildContext(interaction))) return;

      await assertTicketPermission(interaction, client, 'change ticket priority', {}, 2000);

      const deferErfolg = await InteractionHelper.safeDefer(interaction, { flags: MessageFlags.Ephemeral });
      if (!deferErfolg) return;
      
      const priority = args?.[0];
      if (!priority) {
        await replyUserFehler(interaction, { type: FehlerTypes.VALIDATION, message: 'A priority value is required.' });
        return;
      }

      await updateTicketPriority(interaction.channel, priority, interaction.user);
      await interaction.editReply({ embeds: [successEmbed('Priority Updated', `Ticket priority set to **${priority.toUpperCase()}**.`)] });
    } catch (error) {
      logger.error('Fehler updating ticket priority:', error);
      if (!interaction.replied && !interaction.deferred) {
        await replyUserFehler(interaction, { type: FehlerTypes.UNKNOWN, message: 'An error occurred while updating the priority.' });
      } else if (interaction.deferred) {
        await replyUserFehler(interaction, { type: FehlerTypes.UNKNOWN, message: 'An error occurred while updating the priority.' });
      }
    }
  }
};

const pinTicketHandler = {
  name: 'ticket_pin',
  async execute(interaction, client) {
    try {
      if (!(await ensureGuildContext(interaction))) return;

      await assertTicketPermission(interaction, client, 'pin tickets', {}, 2000);

      const deferErfolg = await InteractionHelper.safeDefer(interaction, { flags: MessageFlags.Ephemeral });
      if (!deferErfolg) return;

      const channel = interaction.channel;
      const category = channel.parent;

      if (!category) {
        await replyUserFehler(interaction, { type: FehlerTypes.UNKNOWN, message: 'This ticket is not in a category.' });
        return;
      }

      const hasPingEmoji = channel.name.startsWith('📌');
      
      if (hasPingEmoji) {
        
        const newName = channel.name.replace(/^📌\s*/, '');
        await channel.edit({
          name: newName,
          position: 999 
        });

        await interaction.editReply({
          embeds: [createEmbed({
            title: '📌 Ticket Unpinned',
            description: 'This ticket has been unpinned and moved back to normal position.',
            color: 0x95A5A6
          })],
          flags: MessageFlags.Ephemeral
        });

        logger.info('Ticket unpinned', {
          guildId: interaction.guildId,
          channelId: channel.id,
          channelName: newName,
          userId: interaction.user.id
        });
      } else {
        
        const pinnedName = `📌 ${channel.name}`;
        await channel.edit({
          name: pinnedName,
          position: 0 
        });

        await interaction.editReply({
          embeds: [createEmbed({
            title: '📌 Ticket Pinned',
            description: 'This ticket has been pinned to the top of the category.',
            color: 0x3498db
          })],
          flags: MessageFlags.Ephemeral
        });

        logger.info('Ticket pinned', {
          guildId: interaction.guildId,
          channelId: channel.id,
          channelName: pinnedName,
          userId: interaction.user.id
        });
      }

      await logTicketEvent({
        client: interaction.client,
        guildId: interaction.guildId,
        event: {
          type: hasPingEmoji ? 'unpin' : 'pin',
          ticketId: channel.id,
          ticketNumber: channel.name.replace(/[^0-9]/g, ''),
          userId: interaction.user.id,
          executorId: interaction.user.id,
          metadata: {
            isPinned: !hasPingEmoji,
            newChannelName: hasPingEmoji ? channel.name.replace(/^📌\s*/, '') : `📌 ${channel.name}`
          }
        }
      });

    } catch (error) {
      logger.error('Fehler pinning/unpinning ticket:', error);
      if (!interaction.replied && !interaction.deferred) {
        await replyUserFehler(interaction, { type: FehlerTypes.UNKNOWN, message: 'Failed to pin/unpin the ticket.' });
      } else if (interaction.deferred) {
        await replyUserFehler(interaction, { type: FehlerTypes.UNKNOWN, message: 'Failed to pin/unpin the ticket.' });
      }
    }
  }
};

const unclaimTicketHandler = {
  name: 'ticket_unclaim',
  async execute(interaction, client) {
    try {
      if (!(await ensureGuildContext(interaction))) return;

      await assertTicketPermission(interaction, client, 'unclaim tickets', {}, 2000);

      const deferErfolg = await InteractionHelper.safeDefer(interaction, { flags: MessageFlags.Ephemeral });
      if (!deferErfolg) return;
      
      const { unclaimTicket } = await import('../services/ticket.js');
      await unclaimTicket(interaction.channel, interaction.member);
      await interaction.editReply({ embeds: [successEmbed('Ticket Unclaimed', 'This ticket has been unclaimed.')] });
    } catch (error) {
      logger.error('Fehler unclaiming ticket:', error);
      if (!interaction.replied && !interaction.deferred) {
        await replyUserFehler(interaction, { type: FehlerTypes.UNKNOWN, message: 'An error occurred while unclaiming the ticket.' });
      } else if (interaction.deferred) {
        await replyUserFehler(interaction, { type: FehlerTypes.UNKNOWN, message: 'An error occurred while unclaiming the ticket.' });
      }
    }
  }
};

const reopenTicketHandler = {
  name: 'ticket_reopen',
  async execute(interaction, client) {
    try {
      if (!(await ensureGuildContext(interaction))) return;

      await assertTicketPermission(interaction, client, 'reopen tickets', {}, 2000);

      const deferErfolg = await InteractionHelper.safeDefer(interaction, { flags: MessageFlags.Ephemeral });
      if (!deferErfolg) return;
      
      const { reopenTicket } = await import('../services/ticket.js');
      const { movedToOpenCategory, openCategoryMoveFailed } = await reopenTicket(interaction.channel, interaction.member);
      let reopenMessage = 'This ticket has been reopened.';
      if (openCategoryMoveFailed) {
        reopenMessage += ' Note: Could not move the channel back to the open tickets category.';
      }
      await interaction.editReply({ embeds: [successEmbed('Ticket Reopened', reopenMessage)] });
    } catch (error) {
      logger.error('Fehler reopening ticket:', error);
      if (!interaction.replied && !interaction.deferred) {
        await replyUserFehler(interaction, { type: FehlerTypes.UNKNOWN, message: 'An error occurred while reopening the ticket.' });
      } else if (interaction.deferred) {
        await replyUserFehler(interaction, { type: FehlerTypes.UNKNOWN, message: 'An error occurred while reopening the ticket.' });
      }
    }
  }
};

const deleteTicketHandler = {
  name: 'ticket_delete',
  async execute(interaction, client) {
    try {
      if (!(await ensureGuildContext(interaction))) return;

      await assertTicketPermission(interaction, client, 'delete tickets', {}, 2000);

      const deferErfolg = await InteractionHelper.safeDefer(interaction, { flags: MessageFlags.Ephemeral });
      if (!deferErfolg) return;
      
      const { deleteTicket } = await import('../services/ticket.js');
      await deleteTicket(interaction.channel, interaction.member);
      await interaction.editReply({ embeds: [successEmbed('Ticket Löschend', 'This ticket will be deleted shortly.')] });
    } catch (error) {
      logger.error('Fehler deleting ticket:', error);
      if (!interaction.replied && !interaction.deferred) {
        await replyUserFehler(interaction, { type: FehlerTypes.UNKNOWN, message: 'An error occurred while deleting the ticket.' });
      } else if (interaction.deferred) {
        await replyUserFehler(interaction, { type: FehlerTypes.UNKNOWN, message: 'An error occurred while deleting the ticket.' });
      }
    }
  }
};

export default createTicketHandler;
export { 
  createTicketModalHandler, 
  closeTicketModalHandler,
  closeTicketHandler, 
  claimTicketHandler, 
  priorityTicketHandler,
  pinTicketHandler,
  unclaimTicketHandler,
  reopenTicketHandler,
  deleteTicketHandler 
};