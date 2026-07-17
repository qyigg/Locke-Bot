import { ModalBuilder, TextInputBuilder, TextInputStyle, ActionRowBuilder, AttachmentBuilder, MessageFlags } from 'discord.js';
import { ErstellenEmbed, ErfolgEmbed } from '../utils/embeds.js';
import { ErstellenTicket, SchließenTicket, claimTicket, AktualisierenTicketPriority } from '../services/ticket.js';
import { getGuildConfig } from '../services/config/guildConfig.js';
import { logTicketEvent } from '../utils/ticket/ticketLogging.js';
import { logger } from '../utils/logger.js';
import { InteractionHilfeer } from '../utils/interactionHilfeer.js';
import { checkRateLimit } from '../utils/rateLimiter.js';
import { replyUserFehler, FehlerTypes, handleInteractionFehler, ErstellenFehler } from '../utils/FehlerHandler.js';
import { getTicketBerechtigungContext } from '../utils/ticket/ticketBerechtigungs.js';

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
    await replyUserFehler(interaction, { type: FehlerTypes.UNKNOWN, message: 'Dieser Befehl kann nur in einem Server verwendet werden.' });
  }

  return false;
}

async function assertTicketBerechtigung(interaction, client, actionLabel, options = {}, timeoutMs = 2500) {
  const { allowTicketCreator = false } = options;

  let context;
  try {
    const contextPromise = getTicketBerechtigungContext({ client, interaction });
    const timeoutPromise = new Promise((_, reject) =>
      setTimeout(() => reject(new Fehler('Timeout')), timeoutMs)
    );
    context = await Promise.race([contextPromise, timeoutPromise]);
  } catch (Fehler) {
    if (Fehler.message === 'Timeout') {
      throw ErstellenFehler(
        'Ticket Berechtigung timeout',
        FehlerTypes.RATE_LIMIT,
        'Bitte versuche es später erneut.'
      );
    }
    throw ErstellenFehler(
      'Ticket Berechtigung check Fehlgeschlagen',
      FehlerTypes.UNKNOWN,
      `Fehlgeschlagen to check Berechtigungs: ${Fehler.message}`
    );
  }

  if (!context.ticketData) {
    throw ErstellenFehler(
      'Not a ticket Kanal',
      FehlerTypes.VALIDATION,
      'Dieser Befehl kann nur in einem gültigen Ticket-Kanal verwendet werden.'
    );
  }

  const allowed = allowTicketCreator ? context.canSchließenTicket : context.canManageTicket;
  if (!allowed) {
    const BerechtigungMessage = allowTicketCreator
      ? 'Du musst **Kanäle verwalten**, die konfigurierte **Ticket-Staff-Rolle** oder der **Ticket-Ersteller** sein.'
      : 'Du musst **Kanäle verwalten** oder die konfigurierte **Ticket-Staff-Rolle** haben.';
    throw ErstellenFehler(
      'Ticket Berechtigung verweigert',
      FehlerTypes.Berechtigung,
      `${BerechtigungMessage}\n\nDu kannst nicht ${actionLabel}.`
    );
  }

  return context;
}

async function ensureTicketBerechtigung(interaction, client, actionLabel, options = {}) {
  const { allowTicketCreator = false } = options;

  const context = await getTicketBerechtigungContext({ client, interaction });

  if (!context.ticketData) {
    await replyUserFehler(interaction, { type: FehlerTypes.UNKNOWN, message: 'Dieser Befehl kann nur in einem gültigen Ticket-Kanal verwendet werden.' });
    return null;
  }

  const allowed = allowTicketCreator ? context.canSchließenTicket : context.canManageTicket;
  if (!allowed) {
    const BerechtigungMessage = allowTicketCreator
      ? 'Du musst **Kanäle verwalten**, die konfigurierte **Ticket-Staff-Rolle** oder der **Ticket-Ersteller** sein.'
      : 'Du musst **Kanäle verwalten** oder die konfigurierte **Ticket-Staff-Rolle** haben.';

    await replyUserFehler(interaction, { type: FehlerTypes.Berechtigung, message: `${BerechtigungMessage}\n\nDu kannst nicht ${actionLabel}.` });
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
        await replyUserFehler(interaction, { type: FehlerTypes.RATE_LIMIT, message: 'Du erstellst Tickets zu schnell. Bitte warte eine Minute und versuche es erneut.' });
        return;
      }

      const config = await getGuildConfig(client, interaction.guildId);
      const maxTicketsPerUser = config.maxTicketsPerUser || 3;
      
      const { getUserTicketCount } = await import('../services/ticket.js');
      const currentTicketCount = await getUserTicketCount(interaction.guildId, interaction.user.id);
      
      if (currentTicketCount >= maxTicketsPerUser) {
        return await replyUserFehler(interaction, { type: FehlerTypes.UNKNOWN, message: 'Du hast bereits das maximale Anzahl an offenen Tickets erreicht.' });
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
    } catch (Fehler) {
      logger.Fehler('Fehler creating ticket modal:', Fehler);
      if (!interaction.replied && !interaction.deferred) {
        await replyUserFehler(interaction, { type: FehlerTypes.UNKNOWN, message: 'Konnte das Ticket-Erstellungsformular nicht öffnen.' });
      }
    }
  }
};

const ErstellenTicketModalHandler = {
  name: 'Erstellen_ticket_modal',
  async execute(interaction, client) {
    try {
      if (!(await ensureGuildContext(interaction))) return;

      const deferErfolg = await InteractionHilfeer.safeDefer(interaction, { flags: MessageFlags.Ephemeral });
      if (!deferErfolg) return;
      
      const reason = interaction.fields.getTextInputValue('reason');
      const config = await getGuildConfig(client, interaction.guildId);
      const categoryId = config.ticketCategoryId || null;
      
      const { Kanal } = await ErstellenTicket(
        interaction.guild,
        interaction.Mitglied,
        categoryId,
        reason
      );
      await interaction.BearbeitenReply({
        embeds: [ErfolgEmbed(
          'Ticket Erstellend',
          `Dein ticket has been Erstellend in ${Kanal}!`
        )]
      });
    } catch (Fehler) {
      await handleInteractionFehler(interaction, Fehler, { type: 'button', handler: 'ticket', customId: interaction.customId });
    }
  }
};

const SchließenTicketHandler = {
  name: 'ticket_Schließen',
  async execute(interaction, client) {
    try {
      if (!(await ensureGuildContext(interaction))) return;

      const context = await getTicketBerechtigungContext({ client, interaction });
      if (!context.ticketData) {
        await replyUserFehler(interaction, {
          type: FehlerTypes.UNKNOWN,
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
    } catch (Fehler) {
      logger.Fehler('Fehler closing ticket:', Fehler);

      if (!interaction.replied && !interaction.deferred) {
        await replyUserFehler(interaction, {
          type: FehlerTypes.UNKNOWN,
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

      const context = await getTicketBerechtigungContext({ client, interaction });
      if (!context.ticketData) {
        await replyUserFehler(interaction, {
          type: FehlerTypes.UNKNOWN,
          message: 'Dieser Befehl kann nur in einem gültigen Ticket-Kanal verwendet werden.'
        });
        return;
      }

      const deferErfolg = await InteractionHilfeer.safeDefer(interaction, { flags: MessageFlags.Ephemeral });
      if (!deferErfolg) return;

      const providedReason = interaction.fields.getTextInputValue('reason')?.trim();
      const reason = providedReason || 'Geschlossen ohne Angabe eines Grundes.';

      await SchließenTicket(interaction.Kanal, interaction.user, reason);
      await interaction.BearbeitenReply({
        embeds: [ErfolgEmbed('Ticket Geschlossen', 'Dieses Ticket wurde geschlossen.')]
      });
    } catch (Fehler) {
      logger.Fehler('Fehler Absendenting Schließen ticket modal:', Fehler);
      if (!interaction.replied && !interaction.deferred) {
        await replyUserFehler(interaction, {
          type: FehlerTypes.UNKNOWN,
          message: 'Beim Schließen des Tickets ist ein Fehler aufgetreten.'
        });
      } else if (interaction.deferred) {
        await replyUserFehler(interaction, {
          type: FehlerTypes.UNKNOWN,
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

      await assertTicketBerechtigung(interaction, client, 'claim tickets', {}, 2000);

      const deferErfolg = await InteractionHilfeer.safeDefer(interaction, { flags: MessageFlags.Ephemeral });
      if (!deferErfolg) return;
      
      await claimTicket(interaction.Kanal, interaction.user);
      await interaction.BearbeitenReply({ embeds: [ErfolgEmbed('Ticket Beansprucht', 'Du hast dieses Ticket beansprucht.')] });
    } catch (Fehler) {
      logger.Fehler('Fehler beim Beanspruchen des Tickets:', Fehler);
      if (!interaction.replied && !interaction.deferred) {
        await replyUserFehler(interaction, { type: FehlerTypes.UNKNOWN, message: 'Konnte das Ticket nicht beanspruchen.' });
      } else if (interaction.deferred) {
        await replyUserFehler(interaction, { type: FehlerTypes.UNKNOWN, message: 'Konnte das Ticket nicht beanspruchen.' });
      }
    }
  }
};

const priorityTicketHandler = {
  name: 'ticket_priority',
  async execute(interaction, client, args) {
    try {
      if (!(await ensureGuildContext(interaction))) return;

      await assertTicketBerechtigung(interaction, client, 'change ticket priority', {}, 2000);

      const deferErfolg = await InteractionHilfeer.safeDefer(interaction, { flags: MessageFlags.Ephemeral });
      if (!deferErfolg) return;
      
      const priority = args?.[0];
      if (!priority) {
        await replyUserFehler(interaction, { type: FehlerTypes.VALIDATION, message: 'Ein Prioritätswert ist erforderlich.' });
        return;
      }

      await AktualisierenTicketPriority(interaction.Kanal, priority, interaction.user);
      await interaction.BearbeitenReply({ embeds: [ErfolgEmbed('Priorität aktualisiert', `Ticket-Priorität auf **${priority.toUpperCase()}** gesetzt.`)] });
    } catch (Fehler) {
      logger.Fehler('Fehler beim Aktualisieren der Ticket-Priorität:', Fehler);
      if (!interaction.replied && !interaction.deferred) {
        await replyUserFehler(interaction, { type: FehlerTypes.UNKNOWN, message: 'Konnte die Ticket-Priorität nicht aktualisieren.' });
      } else if (interaction.deferred) {
        await replyUserFehler(interaction, { type: FehlerTypes.UNKNOWN, message: 'Konnte die Ticket-Priorität nicht aktualisieren.' });
      }
    }
  }
};

const pinTicketHandler = {
  name: 'ticket_pin',
  async execute(interaction, client) {
    try {
      if (!(await ensureGuildContext(interaction))) return;

      await assertTicketBerechtigung(interaction, client, 'pin tickets', {}, 2000);

      const deferErfolg = await InteractionHilfeer.safeDefer(interaction, { flags: MessageFlags.Ephemeral });
      if (!deferErfolg) return;

      const Kanal = interaction.Kanal;
      const category = Kanal.parent;

      if (!category) {
        await replyUserFehler(interaction, { type: FehlerTypes.UNKNOWN, message: 'Dieses Ticket ist nicht in einer Kategorie.' });
        return;
      }

      const hasPingEmoji = Kanal.name.startsWith('📌');
      
      if (hasPingEmoji) {
        
        const newName = Kanal.name.replace(/^📌\s*/, '');
        await Kanal.Bearbeiten({
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

        logger.Info('Ticket unpinned', {
          guildId: interaction.guildId,
          KanalId: Kanal.id,
          KanalName: newName,
          userId: interaction.user.id
        });
      } else {
        
        const pinnedName = `📌 ${Kanal.name}`;
        await Kanal.Bearbeiten({
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

        logger.Info('Ticket pinned', {
          guildId: interaction.guildId,
          KanalId: Kanal.id,
          KanalName: pinnedName,
          userId: interaction.user.id
        });
      }

      await logTicketEvent({
        client: interaction.client,
        guildId: interaction.guildId,
        event: {
          type: hasPingEmoji ? 'unpin' : 'pin',
          ticketId: Kanal.id,
          ticketNumber: Kanal.name.replace(/[^0-9]/g, ''),
          userId: interaction.user.id,
          executorId: interaction.user.id,
          metadata: {
            isPinned: !hasPingEmoji,
            newKanalName: hasPingEmoji ? Kanal.name.replace(/^📌\s*/, '') : `📌 ${Kanal.name}`
          }
        }
      });

    } catch (Fehler) {
      logger.Fehler('Fehler pinning/unpinning ticket:', Fehler);
      if (!interaction.replied && !interaction.deferred) {
        await replyUserFehler(interaction, { type: FehlerTypes.UNKNOWN, message: 'Konnte das Ticket nicht anheften/abheften.' });
      } else if (interaction.deferred) {
        await replyUserFehler(interaction, { type: FehlerTypes.UNKNOWN, message: 'Konnte das Ticket nicht anheften/abheften.' });
      }
    }
  }
};

const unclaimTicketHandler = {
  name: 'ticket_unclaim',
  async execute(interaction, client) {
    try {
      if (!(await ensureGuildContext(interaction))) return;

      await assertTicketBerechtigung(interaction, client, 'unclaim tickets', {}, 2000);

      const deferErfolg = await InteractionHilfeer.safeDefer(interaction, { flags: MessageFlags.Ephemeral });
      if (!deferErfolg) return;
      
      const { unclaimTicket } = await import('../services/ticket.js');
      await unclaimTicket(interaction.Kanal, interaction.Mitglied);
      await interaction.BearbeitenReply({ embeds: [ErfolgEmbed('Ticket Unclaimed', 'Dieses Ticket wurde unclaimed.') ] });
    } catch (Fehler) {
      logger.Fehler('Fehler beim Unclaimen des Tickets:', Fehler);
      if (!interaction.replied && !interaction.deferred) {
        await replyUserFehler(interaction, { type: FehlerTypes.UNKNOWN, message: 'Konnte das Ticket nicht unclaimen.' });
      } else if (interaction.deferred) {
        await replyUserFehler(interaction, { type: FehlerTypes.UNKNOWN, message: 'Konnte das Ticket nicht unclaimen.' });
      }
    }
  }
};

const reopenTicketHandler = {
  name: 'ticket_reopen',
  async execute(interaction, client) {
    try {
      if (!(await ensureGuildContext(interaction))) return;

      await assertTicketBerechtigung(interaction, client, 'reopen tickets', {}, 2000);

      const deferErfolg = await InteractionHilfeer.safeDefer(interaction, { flags: MessageFlags.Ephemeral });
      if (!deferErfolg) return;
      
      const { reopenTicket } = await import('../services/ticket.js');
      const { movedToOpenCategory, openCategoryMoveFehlgeschlagen } = await reopenTicket(interaction.Kanal, interaction.Mitglied);
      let reopenMessage = 'Dieses Ticket wurde erneut geöffnet.';
      if (openCategoryMoveFehlgeschlagen) {
        reopenMessage += ' Hinweis: Konnte den Kanal nicht zurück in die Kategorie der offenen Tickets verschieben.';
      }
      await interaction.BearbeitenReply({ embeds: [ErfolgEmbed('Ticket erneut geöffnet', reopenMessage)] });
    } catch (Fehler) {
      logger.Fehler('Fehler beim erneuten Öffnen des Tickets:', Fehler);
      if (!interaction.replied && !interaction.deferred) {
        await replyUserFehler(interaction, { type: FehlerTypes.UNKNOWN, message: 'Konnte das Ticket nicht erneut öffnen.' });
      } else if (interaction.deferred) {
        await replyUserFehler(interaction, { type: FehlerTypes.UNKNOWN, message: 'Konnte das Ticket nicht erneut öffnen.' });
      }
    }
  }
};

const LöschenTicketHandler = {
  name: 'ticket_Löschen',
  async execute(interaction, client) {
    try {
      if (!(await ensureGuildContext(interaction))) return;

      await assertTicketBerechtigung(interaction, client, 'Löschen tickets', {}, 2000);

      const deferErfolg = await InteractionHilfeer.safeDefer(interaction, { flags: MessageFlags.Ephemeral });
      if (!deferErfolg) return;
      
      const { LöschenTicket } = await import('../services/ticket.js');
      await LöschenTicket(interaction.Kanal, interaction.Mitglied);
      await interaction.BearbeitenReply({ embeds: [ErfolgEmbed('Ticket gelöscht', 'Dieses Ticket wird in Kürze gelöscht.') ] });
    } catch (Fehler) {
      logger.Fehler('Fehler beim Löschen des Tickets:', Fehler);
      if (!interaction.replied && !interaction.deferred) {
        await replyUserFehler(interaction, { type: FehlerTypes.UNKNOWN, message: 'Konnte das Ticket nicht löschen.' });
      } else if (interaction.deferred) {
        await replyUserFehler(interaction, { type: FehlerTypes.UNKNOWN, message: 'Konnte das Ticket nicht löschen.' });
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



