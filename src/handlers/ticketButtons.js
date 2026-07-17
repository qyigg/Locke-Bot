import { ModalBuilder, TextInputBuilder, TextInputStyle, ActionRowBuilder, AttachmentBuilder, MessageFlags } from 'discord.js';
import { ErstellenEmbed, successEmbed } from '../utils/embeds.js';
import { ErstellenTicket, SchließenTicket, claimTicket, AktualisierenTicketPriority } from '../services/ticket.js';
import { getGuildConfig } from '../services/config/guildConfig.js';
import { logTicketEvent } from '../utils/ticket/ticketLogging.js';
import { logger } from '../utils/logger.js';
import { InteractionHelper } from '../utils/interactionHelper.js';
import { checkRateLimit } from '../utils/rateLimiter.js';
import { replyUserError, ErrorTypes, handleInteractionError, ErstellenError } from '../utils/errorHandler.js';
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
    await replyUserError(interaction, { type: ErrorTypes.UNKNOWN, message: 'Dieser Befehl kann nur in einem Server verwendet werden.' });
  }

  return false;
}

async function assertTicketPermission(interaction, client, actionLabel, options = {}, timeoutMs = 2500) {
  const { allowTicketCreator = false } = options;

  let context;
  try {
    const contextPromise = getTicketPermissionContext({ client, interaction });
    const timeoutPromise = new Promise((_, reject) =>
      setTimeout(() => reject(new Error('Timeout')), timeoutMs)
    );
    context = await Promise.race([contextPromise, timeoutPromise]);
  } catch (error) {
    if (error.message === 'Timeout') {
      throw ErstellenError(
        'Ticket permission timeout',
        ErrorTypes.RATE_LIMIT,
        'Bitte versuche es später erneut.'
      );
    }
    throw ErstellenError(
      'Ticket permission check failed',
      ErrorTypes.UNKNOWN,
      `Failed to check permissions: ${error.message}`
    );
  }

  if (!context.ticketData) {
    throw ErstellenError(
      'Not a ticket channel',
      ErrorTypes.VALIDATION,
      'Dieser Befehl kann nur in einem gültigen Ticket-Kanal verwendet werden.'
    );
  }

  const allowed = allowTicketCreator ? context.canSchließenTicket : context.canManageTicket;
  if (!allowed) {
    const permissionMessage = allowTicketCreator
      ? 'Du musst **Kanäle verwalten**, die konfigurierte **Ticket-Staff-Rolle** oder der **Ticket-Ersteller** sein.'
      : 'Du musst **Kanäle verwalten** oder die konfigurierte **Ticket-Staff-Rolle** haben.';
    throw ErstellenError(
      'Ticket Berechtigung verweigert',
      ErrorTypes.PERMISSION,
      `${permissionMessage}\n\nDu kannst nicht ${actionLabel}.`
    );
  }

  return context;
}

async function ensureTicketPermission(interaction, client, actionLabel, options = {}) {
  const { allowTicketCreator = false } = options;

  const context = await getTicketPermissionContext({ client, interaction });

  if (!context.ticketData) {
    await replyUserError(interaction, { type: ErrorTypes.UNKNOWN, message: 'Dieser Befehl kann nur in einem gültigen Ticket-Kanal verwendet werden.' });
    return null;
  }

  const allowed = allowTicketCreator ? context.canSchließenTicket : context.canManageTicket;
  if (!allowed) {
    const permissionMessage = allowTicketCreator
      ? 'Du musst **Kanäle verwalten**, die konfigurierte **Ticket-Staff-Rolle** oder der **Ticket-Ersteller** sein.'
      : 'Du musst **Kanäle verwalten** oder die konfigurierte **Ticket-Staff-Rolle** haben.';

    await replyUserError(interaction, { type: ErrorTypes.PERMISSION, message: `${permissionMessage}\n\nDu kannst nicht ${actionLabel}.` });
    return null;
  }

  return context;
}

const ErstellenTicketHandler = {
  name: 'Erstellen_ticket',
  async execute(interaction, client) {
    try {
      if (!(await ensureGuildContext(interaction))) return;

      const rateLimitKey = `${interaction.user.id}:Erstellen_ticket`;
      const allowed = await checkRateLimit(rateLimitKey, 3, 60000);
      if (!allowed) {
        await replyUserError(interaction, { type: ErrorTypes.RATE_LIMIT, message: 'Du erstellst Tickets zu schnell. Bitte warte eine Minute und versuche es erneut.' });
        return;
      }

      const config = await getGuildConfig(client, interaction.guildId);
      const maxTicketsPerUser = config.maxTicketsPerUser || 3;
      
      const { getUserTicketCount } = await import('../services/ticket.js');
      const currentTicketCount = await getUserTicketCount(interaction.guildId, interaction.user.id);
      
      if (currentTicketCount >= maxTicketsPerUser) {
        return await replyUserError(interaction, { type: ErrorTypes.UNKNOWN, message: 'Du hast bereits das maximale Anzahl an offenen Tickets erreicht.' });
      }
      
      const modal = new ModalBuilder()
        .setCustomId('Erstellen_ticket_modal')
        .setTitle('Erstellen a Ticket');

      const reasonInput = new TextInputBuilder()
        .setCustomId('reason')
        .setLabel('Why are you creating this ticket?')
        .setStyle(TextInputStyle.Paragraph)
        .setPlaceholder('Describe Dein issue...')
        .setRequired(true)
        .setMaxLength(1000);

      const actionRow = new ActionRowBuilder().addComponents(reasonInput);
      modal.addComponents(actionRow);

      await interaction.showModal(modal);
    } catch (error) {
      logger.error('Error creating ticket modal:', error);
      if (!interaction.replied && !interaction.deferred) {
        await replyUserError(interaction, { type: ErrorTypes.UNKNOWN, message: 'Konnte das Ticket-Erstellungsformular nicht öffnen.' });
      }
    }
  }
};

const ErstellenTicketModalHandler = {
  name: 'Erstellen_ticket_modal',
  async execute(interaction, client) {
    try {
      if (!(await ensureGuildContext(interaction))) return;

      const deferSuccess = await InteractionHelper.safeDefer(interaction, { flags: MessageFlags.Ephemeral });
      if (!deferSuccess) return;
      
      const reason = interaction.fields.getTextInputValue('reason');
      const config = await getGuildConfig(client, interaction.guildId);
      const categoryId = config.ticketCategoryId || null;
      
      const { channel } = await ErstellenTicket(
        interaction.guild,
        interaction.member,
        categoryId,
        reason
      );
      await interaction.BearbeitenReply({
        embeds: [successEmbed(
          'Ticket Erstellend',
          `Dein ticket has been Erstellend in ${channel}!`
        )]
      });
    } catch (error) {
      await handleInteractionError(interaction, error, { type: 'button', handler: 'ticket', customId: interaction.customId });
    }
  }
};

const SchließenTicketHandler = {
  name: 'ticket_Schließen',
  async execute(interaction, client) {
    try {
      if (!(await ensureGuildContext(interaction))) return;

      const context = await getTicketPermissionContext({ client, interaction });
      if (!context.ticketData) {
        await replyUserError(interaction, {
          type: ErrorTypes.UNKNOWN,
          message: 'Dieser Befehl kann nur in einem gültigen Ticket-Kanal verwendet werden.'
        });
        return;
      }

      const modal = new ModalBuilder()
        .setCustomId('ticket_Schließen_modal')
        .setTitle('Schließen Ticket');

      const reasonInput = new TextInputBuilder()
        .setCustomId('reason')
        .setLabel('Reason for closing (optional)')
        .setStyle(TextInputStyle.Paragraph)
        .setPlaceholder('Add an optional reason for closing this ticket...')
        .setRequired(false)
        .setMaxLength(1000);

      const actionRow = new ActionRowBuilder().addComponents(reasonInput);
      modal.addComponents(actionRow);

      await interaction.showModal(modal);
    } catch (error) {
      logger.error('Error closing ticket:', error);

      if (!interaction.replied && !interaction.deferred) {
        await replyUserError(interaction, {
          type: ErrorTypes.UNKNOWN,
          message: 'Konnte das Ticket-Schließungsformular nicht öffnen.'
        });
      }
    }
  }
};

const SchließenTicketModalHandler = {
  name: 'ticket_Schließen_modal',
  async execute(interaction, client) {
    try {
      if (!(await ensureGuildContext(interaction))) return;

      const context = await getTicketPermissionContext({ client, interaction });
      if (!context.ticketData) {
        await replyUserError(interaction, {
          type: ErrorTypes.UNKNOWN,
          message: 'Dieser Befehl kann nur in einem gültigen Ticket-Kanal verwendet werden.'
        });
        return;
      }

      const deferSuccess = await InteractionHelper.safeDefer(interaction, { flags: MessageFlags.Ephemeral });
      if (!deferSuccess) return;

      const providedReason = interaction.fields.getTextInputValue('reason')?.trim();
      const reason = providedReason || 'Geschlossen ohne Angabe eines Grundes.';

      await SchließenTicket(interaction.channel, interaction.user, reason);
      await interaction.BearbeitenReply({
        embeds: [successEmbed('Ticket Geschlossen', 'Dieses Ticket wurde geschlossen.')]
      });
    } catch (error) {
      logger.error('Error Absendenting Schließen ticket modal:', error);
      if (!interaction.replied && !interaction.deferred) {
        await replyUserError(interaction, {
          type: ErrorTypes.UNKNOWN,
          message: 'Beim Schließen des Tickets ist ein Fehler aufgetreten.'
        });
      } else if (interaction.deferred) {
        await replyUserError(interaction, {
          type: ErrorTypes.UNKNOWN,
          message: 'Beim Schließen des Tickets ist ein Fehler aufgetreten.'
        });
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

      const deferSuccess = await InteractionHelper.safeDefer(interaction, { flags: MessageFlags.Ephemeral });
      if (!deferSuccess) return;
      
      await claimTicket(interaction.channel, interaction.user);
      await interaction.BearbeitenReply({ embeds: [successEmbed('Ticket Beansprucht', 'Du hast dieses Ticket beansprucht.')] });
    } catch (error) {
      logger.error('Fehler beim Beanspruchen des Tickets:', error);
      if (!interaction.replied && !interaction.deferred) {
        await replyUserError(interaction, { type: ErrorTypes.UNKNOWN, message: 'Konnte das Ticket nicht beanspruchen.' });
      } else if (interaction.deferred) {
        await replyUserError(interaction, { type: ErrorTypes.UNKNOWN, message: 'Konnte das Ticket nicht beanspruchen.' });
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

      const deferSuccess = await InteractionHelper.safeDefer(interaction, { flags: MessageFlags.Ephemeral });
      if (!deferSuccess) return;
      
      const priority = args?.[0];
      if (!priority) {
        await replyUserError(interaction, { type: ErrorTypes.VALIDATION, message: 'Ein Prioritätswert ist erforderlich.' });
        return;
      }

      await AktualisierenTicketPriority(interaction.channel, priority, interaction.user);
      await interaction.BearbeitenReply({ embeds: [successEmbed('Priorität aktualisiert', `Ticket-Priorität auf **${priority.toUpperCase()}** gesetzt.`)] });
    } catch (error) {
      logger.error('Fehler beim Aktualisieren der Ticket-Priorität:', error);
      if (!interaction.replied && !interaction.deferred) {
        await replyUserError(interaction, { type: ErrorTypes.UNKNOWN, message: 'Konnte die Ticket-Priorität nicht aktualisieren.' });
      } else if (interaction.deferred) {
        await replyUserError(interaction, { type: ErrorTypes.UNKNOWN, message: 'Konnte die Ticket-Priorität nicht aktualisieren.' });
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

      const deferSuccess = await InteractionHelper.safeDefer(interaction, { flags: MessageFlags.Ephemeral });
      if (!deferSuccess) return;

      const channel = interaction.channel;
      const category = channel.parent;

      if (!category) {
        await replyUserError(interaction, { type: ErrorTypes.UNKNOWN, message: 'Dieses Ticket ist nicht in einer Kategorie.' });
        return;
      }

      const hasPingEmoji = channel.name.startsWith('📌');
      
      if (hasPingEmoji) {
        
        const newName = channel.name.replace(/^📌\s*/, '');
        await channel.Bearbeiten({
          name: newName,
          position: 999 
        });

        await interaction.BearbeitenReply({
          embeds: [ErstellenEmbed({
            title: '📌 Ticket Unpinned',
            description: 'Dieses Ticket wurde abgeheftet und zum normalen Standort verschoben.',
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
        await channel.Bearbeiten({
          name: pinnedName,
          position: 0 
        });

        await interaction.BearbeitenReply({
          embeds: [ErstellenEmbed({
            title: '📌 Ticket Pinned',
            description: 'Dieses Ticket wurde an die Spitze der Kategorie gehängt.',
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
      logger.error('Error pinning/unpinning ticket:', error);
      if (!interaction.replied && !interaction.deferred) {
        await replyUserError(interaction, { type: ErrorTypes.UNKNOWN, message: 'Konnte das Ticket nicht anheften/abheften.' });
      } else if (interaction.deferred) {
        await replyUserError(interaction, { type: ErrorTypes.UNKNOWN, message: 'Konnte das Ticket nicht anheften/abheften.' });
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

      const deferSuccess = await InteractionHelper.safeDefer(interaction, { flags: MessageFlags.Ephemeral });
      if (!deferSuccess) return;
      
      const { unclaimTicket } = await import('../services/ticket.js');
      await unclaimTicket(interaction.channel, interaction.member);
      await interaction.BearbeitenReply({ embeds: [successEmbed('Ticket Unclaimed', 'Dieses Ticket wurde unclaimed.') ] });
    } catch (error) {
      logger.error('Fehler beim Unclaimen des Tickets:', error);
      if (!interaction.replied && !interaction.deferred) {
        await replyUserError(interaction, { type: ErrorTypes.UNKNOWN, message: 'Konnte das Ticket nicht unclaimen.' });
      } else if (interaction.deferred) {
        await replyUserError(interaction, { type: ErrorTypes.UNKNOWN, message: 'Konnte das Ticket nicht unclaimen.' });
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

      const deferSuccess = await InteractionHelper.safeDefer(interaction, { flags: MessageFlags.Ephemeral });
      if (!deferSuccess) return;
      
      const { reopenTicket } = await import('../services/ticket.js');
      const { movedToOpenCategory, openCategoryMoveFailed } = await reopenTicket(interaction.channel, interaction.member);
      let reopenMessage = 'Dieses Ticket wurde erneut geöffnet.';
      if (openCategoryMoveFailed) {
        reopenMessage += ' Hinweis: Konnte den Kanal nicht zurück in die Kategorie der offenen Tickets verschieben.';
      }
      await interaction.BearbeitenReply({ embeds: [successEmbed('Ticket erneut geöffnet', reopenMessage)] });
    } catch (error) {
      logger.error('Fehler beim erneuten Öffnen des Tickets:', error);
      if (!interaction.replied && !interaction.deferred) {
        await replyUserError(interaction, { type: ErrorTypes.UNKNOWN, message: 'Konnte das Ticket nicht erneut öffnen.' });
      } else if (interaction.deferred) {
        await replyUserError(interaction, { type: ErrorTypes.UNKNOWN, message: 'Konnte das Ticket nicht erneut öffnen.' });
      }
    }
  }
};

const LöschenTicketHandler = {
  name: 'ticket_Löschen',
  async execute(interaction, client) {
    try {
      if (!(await ensureGuildContext(interaction))) return;

      await assertTicketPermission(interaction, client, 'Löschen tickets', {}, 2000);

      const deferSuccess = await InteractionHelper.safeDefer(interaction, { flags: MessageFlags.Ephemeral });
      if (!deferSuccess) return;
      
      const { LöschenTicket } = await import('../services/ticket.js');
      await LöschenTicket(interaction.channel, interaction.member);
      await interaction.BearbeitenReply({ embeds: [successEmbed('Ticket gelöscht', 'Dieses Ticket wird in Kürze gelöscht.') ] });
    } catch (error) {
      logger.error('Fehler beim Löschen des Tickets:', error);
      if (!interaction.replied && !interaction.deferred) {
        await replyUserError(interaction, { type: ErrorTypes.UNKNOWN, message: 'Konnte das Ticket nicht löschen.' });
      } else if (interaction.deferred) {
        await replyUserError(interaction, { type: ErrorTypes.UNKNOWN, message: 'Konnte das Ticket nicht löschen.' });
      }
    }
  }
};

export default ErstellenTicketHandler;
export { 
  ErstellenTicketModalHandler, 
  SchließenTicketModalHandler,
  SchließenTicketHandler, 
  claimTicketHandler, 
  priorityTicketHandler,
  pinTicketHandler,
  unclaimTicketHandler,
  reopenTicketHandler,
  LöschenTicketHandler 
};


