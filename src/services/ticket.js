// ticket.js

import {
  ChannelType,
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
  PermissionFlagsBits,
  AttachmentBuilder,
} from 'discord.js';
import { buildStandardLogEmbed, formatLogLine } from '../utils/logging/logEmbeds.js';
import { getGuildConfig } from './config/guildConfig.js';
import { getTicketData, saveTicketData, deleteTicketData, getOpenTicketCountForUser, incrementTicketCounter } from '../utils/database.js';
import { logger } from '../utils/logger.js';
import { createEmbed, errorEmbed } from '../utils/embeds.js';
import { logTicketEvent } from '../utils/ticket/ticketLogging.js';
import { createError, ErrorTypes } from '../utils/errorHandler.js';
import { ensureTypedServiceError, wrapServiceBoundary } from '../utils/serviceErrorBoundary.js';
import { PRIORITY_MAP } from '../utils/helpers.js';
const TICKET_DELETE_DELAY_MS = 3000;
const TICKET_DELETE_DELAY_SECONDS = Math.floor(TICKET_DELETE_DELAY_MS / 1000);
const TICKET_SERVICE = 'ticketService';

function ticketUserError(message, userMessage, type = ErrorTypes.VALIDATION, context = {}) {
  throw createError(message, type, userMessage, { service: TICKET_SERVICE, ...context });
}

function requireTicket(ticketData, channel) {
  if (!ticketData) {
    ticketUserError(
      'Not a ticket channel',
      'Dies ist kein Ticket-Kanal.',
      ErrorTypes.VALIDATION,
      { channelId: channel?.id, guildId: channel?.guild?.id }
    );
  }
  return ticketData;
}

function rethrowTicketError(error, operation, userMessage, context = {}) {
  throw ensureTypedServiceError(error, {
    service: TICKET_SERVICE,
    operation,
    message: `Ticket operation failed: ${operation}`,
    userMessage,
    context,
  });
}



function buildTicketControlRow({ claimedBy = null } = {}) {
  return new ActionRowBuilder().addComponents(
    new ButtonBuilder()
      .setCustomId('ticket_claim')
      .setLabel(claimedBy ? 'Übernommen' : 'Übernehmen')
      .setStyle(claimedBy ? ButtonStyle.Secondary : ButtonStyle.Primary)
      .setEmoji('🙋')
      .setDisabled(!!claimedBy),
    new ButtonBuilder()
      .setCustomId('ticket_pin')
      .setLabel('Anheften')
      .setStyle(ButtonStyle.Secondary)
      .setEmoji('📌'),
    new ButtonBuilder()
      .setCustomId('ticket_close')
      .setLabel('Schließen')
      .setStyle(ButtonStyle.Danger)
      .setEmoji('🔒'),
  );
}

export const getUserTicketCount = wrapServiceBoundary(async function getUserTicketCount(guildId, userId) {
  return await getOpenTicketCountForUser(guildId, userId);
}, {
  service: TICKET_SERVICE,
  operation: 'getUserTicketCount',
  userMessage: 'Offene Tickets konnten nicht gezählt werden.',
  context: {},
});

export async function createTicket(guild, member, categoryId, reason = 'Kein Grund angegeben', priority = 'none') {
  try {
    const config = await getGuildConfig(guild.client, guild.id);
    const ticketConfig = config.tickets || {};
    
    const maxTicketsPerUser = config.maxTicketsPerUser ?? 3;
    const currentTicketCount = await getUserTicketCount(guild.id, member.id);
    
    if (currentTicketCount >= maxTicketsPerUser) {
      ticketUserError(
        `Max open tickets reached for ${member.id}`,
        `Du hast die maximale Anzahl offener Tickets (${maxTicketsPerUser}) erreicht. Bitte schließe erst bestehende Tickets, bevor du ein neues erstellst.`,
        ErrorTypes.VALIDATION,
        { guildId: guild.id, userId: member.id, operation: 'createTicket' }
      );
    }
    
    let category = categoryId ? 
      guild.channels.cache.get(categoryId) :
      guild.channels.cache.find(c => 
        c.type === ChannelType.GuildCategory && 
        c.name.toLowerCase().includes('tickets')
      );
    
    if (!category && !categoryId) {
      category = await guild.channels.create({
        name: 'Tickets',
        type: ChannelType.GuildCategory,
        permissionOverwrites: [
          {
            id: guild.id,
            deny: [PermissionFlagsBits.ViewChannel],
          },
        ],
      });
    }
    
    const ticketNumber = await getNextTicketNumber(guild.id);
    
    let channelName = `ticket-${ticketNumber}`;
    
    if (priority !== 'none') {
      const priorityInfo = PRIORITY_MAP[priority];
      if (priorityInfo) {
        channelName = `${priorityInfo.emoji} ${channelName}`;
      }
    }
    
    const channel = await guild.channels.create({
      name: channelName,
      type: ChannelType.GuildText,
      parent: category?.id,
      permissionOverwrites: [
        {
          id: guild.id,
          deny: [PermissionFlagsBits.ViewChannel],
        },
        {
          id: member.id,
          allow: [
            PermissionFlagsBits.ViewChannel,
            PermissionFlagsBits.SendMessages,
            PermissionFlagsBits.AttachFiles,
            PermissionFlagsBits.ReadMessageHistory,
          ],
        },
        ...(config.ticketStaffRoleId ? [{
          id: config.ticketStaffRoleId,
          allow: [
            PermissionFlagsBits.ViewChannel,
            PermissionFlagsBits.SendMessages,
            PermissionFlagsBits.AttachFiles,
            PermissionFlagsBits.ReadMessageHistory,
          ],
        }] : []),
      ],
    });
    
    const ticketData = {
      id: channel.id,
      userId: member.id,
      guildId: guild.id,
      createdAt: new Date().toISOString(),
      status: 'open',
      claimedBy: null,
      priority: priority || 'none',
      reason,
    };
    
    await saveTicketData(guild.id, channel.id, ticketData);
    
    const priorityInfo = PRIORITY_MAP[priority] || PRIORITY_MAP.none;
    
    const embed = createEmbed({
      title: `Ticket #${ticketNumber}`,
      description: `${member.toString()}, danke fürs Erstellen eines Tickets!\n\n**Grund:** ${reason}\n**Priorität:** ${priorityInfo.emoji} ${priorityInfo.label}`,
      color: priorityInfo.color,
      fields: [
        { name: 'Status', value: '🟢 Offen', inline: true },
        { name: 'Zugewiesen an', value: 'Nicht zugewiesen', inline: true },
        { name: 'Erstellt', value: `<t:${Math.floor(Date.now() / 1000)}:R>`, inline: true },
      ],
    });
    
    const row = buildTicketControlRow();
    
    if (ticketConfig.enablePriority) {
      row.addComponents(
        new ButtonBuilder()
          .setCustomId('ticket_priority:low')
          .setLabel('Niedrig')
          .setStyle(ButtonStyle.Secondary)
          .setEmoji('🔵'),
        new ButtonBuilder()
          .setCustomId('ticket_priority:high')
          .setLabel('Hoch')
          .setStyle(ButtonStyle.Danger)
          .setEmoji('🔴')
      );
    }
    
    const staffMention = config.ticketStaffRoleId ? ` <@&${config.ticketStaffRoleId}>` : '';
    const messageContent = `${member.toString()}${staffMention}`;
    
    const ticketMessage = await channel.send({ 
      content: messageContent,
      embeds: [embed],
      components: [row] 
    });

    await ticketMessage.pin().catch(() => {});
    
    await logTicketEvent({
      client: guild.client,
      guildId: guild.id,
      event: {
        type: 'open',
        ticketId: channel.id,
        ticketNumber: ticketNumber,
        userId: member.id,
        executorId: member.id,
        reason: reason,
        priority: priority || 'none',
        metadata: {
          channelId: channel.id,
          categoryName: category?.name || 'Default'
        }
      }
    });
    
    return { channel, ticketData };
    
  } catch (error) {
    rethrowTicketError(error, 'createTicket', 'Ticket konnte nicht erstellt werden. Bitte versuche es gleich erneut.', { guildId: guild?.id, userId: member?.id });
  }
}

export async function closeTicket(channel, closer, reason = 'Kein Grund angegeben') {
  try {
    const ticketData = requireTicket(await getTicketData(channel.guild.id, channel.id), channel);
    
    const config = await getGuildConfig(channel.client, channel.guild.id);
    const dmOnClose = config.dmOnClose !== false;
    const closedCategoryId = config.ticketClosedCategoryId || null;
    let movedToClosedCategory = false;
    
    ticketData.status = 'closed';
    ticketData.closedBy = closer.id;
    ticketData.closedAt = new Date().toISOString();
    ticketData.closeReason = reason;
    
    await saveTicketData(channel.guild.id, channel.id, ticketData);

    if (closedCategoryId && channel.parentId !== closedCategoryId) {
      const closedCategory = channel.guild.channels.cache.get(closedCategoryId)
        || await channel.guild.channels.fetch(closedCategoryId).catch(() => null);

      if (closedCategory?.type === ChannelType.GuildCategory) {
        try {
          await channel.setParent(closedCategoryId, { lockPermissions: false });
          movedToClosedCategory = true;
        } catch (moveError) {
            logger.warn(`Could not move ticket ${channel.id} to closed category ${closedCategoryId}: ${moveError.message}`);
        }
      } else {
        logger.warn(`Configured closed category is invalid for guild ${channel.guild.id}: ${closedCategoryId}`);
      }
    }
    
    if (dmOnClose) {
      try {
        const ticketCreator = await channel.client.users.fetch(ticketData.userId).catch(() => null);
        if (ticketCreator) {
          const dmEmbed = createEmbed({
            title: '🎫 Dein Ticket wurde geschlossen',
            description: `Dein Ticket **${channel.name}** wurde geschlossen.\n\n**Grund:** ${reason}\n**Geschlossen von:** ${closer.tag}\n**Geschlossen am:** <t:${Math.floor(Date.now() / 1000)}:F>\n\nDanke, dass du unser Support-System nutzt! Wenn du weitere Fragen hast, kannst du jederzeit ein neues Ticket erstellen.`,
            color: '#e74c3c',
            footer: { text: `Ticket ID: ${ticketData.id}` }
          });

          await ticketCreator.send({ embeds: [dmEmbed] });

          try {
            const feedbackEmbed = createEmbed({
              title: '⭐ Wie war deine Support-Erfahrung?',
              description: `Wir möchten gerne wissen, wie der Support bei **${channel.name}** war.\nWähle unten eine Bewertung aus — dauert nur eine Sekunde!`,
              color: '#F1C40F',
              footer: { text: 'Dein Feedback hilft uns, besser zu werden.' },
            });

            const base = `ticket_feedback:${channel.guild.id}:${channel.id}`;
            const starsRow = new ActionRowBuilder().addComponents(
              new ButtonBuilder().setCustomId(`${base}:1`).setLabel('⭐ 1').setStyle(ButtonStyle.Secondary),
              new ButtonBuilder().setCustomId(`${base}:2`).setLabel('⭐ 2').setStyle(ButtonStyle.Secondary),
              new ButtonBuilder().setCustomId(`${base}:3`).setLabel('⭐ 3').setStyle(ButtonStyle.Secondary),
              new ButtonBuilder().setCustomId(`${base}:4`).setLabel('⭐ 4').setStyle(ButtonStyle.Secondary),
              new ButtonBuilder().setCustomId(`${base}:5`).setLabel('⭐ 5').setStyle(ButtonStyle.Primary),
            );
            const declineRow = new ActionRowBuilder().addComponents(
              new ButtonBuilder()
                .setCustomId(`ticket_feedback_comment:${channel.guild.id}:${channel.id}`)
                .setLabel('✍️ Kommentar hinzufügen')
                .setStyle(ButtonStyle.Secondary),
              new ButtonBuilder()
                .setCustomId(`ticket_feedback_decline:${channel.guild.id}:${channel.id}`)
                .setLabel('❌ Nein danke')
                .setStyle(ButtonStyle.Secondary),
            );

            await ticketCreator.send({
              embeds: [feedbackEmbed],
              components: [starsRow, declineRow],
            });
          } catch (feedbackError) {
            logger.warn(`Could not send feedback survey to ticket creator ${ticketData.userId}: ${feedbackError.message}`);
          }
        }
      } catch (dmError) {
          logger.warn(`Could not send DM to ticket creator ${ticketData.userId}: ${dmError.message}`);
      }
    }
    
    try {
      const user = await channel.guild.members.fetch(ticketData.userId).catch(() => null);
      const targetUser = user?.user || await channel.client.users.fetch(ticketData.userId).catch(() => null);
      
      if (targetUser) {
        const overwrite = channel.permissionOverwrites.cache.get(ticketData.userId);
        if (overwrite) {
          await overwrite.edit({
            ViewChannel: false,
            SendMessages: false,
          });
        } else {
          await channel.permissionOverwrites.create(targetUser, {
            ViewChannel: false,
            SendMessages: false,
          });
        }
      }
    } catch (permError) {
        logger.warn(`Could not update user permissions for closed ticket: ${permError.message}`);
    }
    
    const messages = await channel.messages.fetch();
    const ticketMessage = messages.find(m => 
      m.embeds.length > 0 && 
      m.embeds[0].title?.startsWith('Ticket #')
    );
    
    if (ticketMessage) {
      const embed = ticketMessage.embeds[0];
      const statusField = embed.fields?.find(f => f.name === 'Status');
      
      if (statusField) {
        statusField.value = '🔴 Geschlossen';
      }
      
      const updatedEmbed = createEmbed({
        title: embed.title || 'Ticket',
        description: embed.description || 'Ticket discussion',
        color: '#e74c3c',
        fields: embed.fields || [],
        footer: embed.footer
      });
      
      await ticketMessage.edit({ 
        embeds: [updatedEmbed],
components: []
      });
    }
    
    const closeEmbed = createEmbed({
      title: 'Ticket geschlossen',
      description: `Dieses Ticket wurde von ${closer} geschlossen.\n**Grund:** ${reason}${dmOnClose ? '\n\n📩 Eine DM wurde an den Ticket-Ersteller gesendet.' : ''}`,
      color: '#e74c3c',
      footer: { text: `Ticket ID: ${ticketData.id}` }
    });
    
    const controlRow = new ActionRowBuilder().addComponents(
      new ButtonBuilder()
        .setCustomId('ticket_reopen')
        .setLabel('Ticket wieder öffnen')
        .setStyle(ButtonStyle.Success)
        .setEmoji('🔓'),
      new ButtonBuilder()
        .setCustomId('ticket_delete')
        .setLabel('Ticket löschen')
        .setStyle(ButtonStyle.Danger)
        .setEmoji('🗑️')
    );
    
    await channel.send({ embeds: [closeEmbed], components: [controlRow] });
    
    await logTicketEvent({
      client: channel.client,
      guildId: channel.guild.id,
      event: {
        type: 'close',
        ticketId: channel.id,
        ticketNumber: ticketData.id,
        userId: ticketData.userId,
        executorId: closer.id,
        reason: reason,
        metadata: {
          dmSent: dmOnClose,
          closedAt: ticketData.closedAt,
          movedToClosedCategory
        }
      }
    });
    
    return ticketData;
    
  } catch (error) {
    rethrowTicketError(error, 'closeTicket', 'Ticket konnte nicht geschlossen werden. Bitte versuche es gleich erneut.', { guildId: channel?.guild?.id, channelId: channel?.id, closerId: closer?.id });
  }
}

export async function claimTicket(channel, claimer) {
  try {
    const ticketData = requireTicket(await getTicketData(channel.guild.id, channel.id), channel);
    
    if (ticketData.claimedBy) {
      ticketUserError(
        'Ticket already claimed',
        `Dieses Ticket wurde bereits von <@${ticketData.claimedBy}> übernommen.`,
        ErrorTypes.VALIDATION,
        { channelId: channel.id, claimedBy: ticketData.claimedBy, operation: 'claimTicket' }
      );
    }
    
    ticketData.claimedBy = claimer.id;
    ticketData.claimedAt = new Date().toISOString();
    
    await saveTicketData(channel.guild.id, channel.id, ticketData);
    
    const messages = await channel.messages.fetch();
    const ticketMessage = messages.find(m => 
      m.embeds.length > 0 && 
      m.embeds[0].title?.startsWith('Ticket #')
    );
    
    if (ticketMessage) {
      const embed = ticketMessage.embeds[0];
      const claimedField = embed.fields?.find(f => f.name === 'Zugewiesen an');
      
      if (claimedField) {
        claimedField.value = claimer.toString();
      }
      
      const row = buildTicketControlRow({ claimedBy: claimer.id });
      
      await ticketMessage.edit({ 
        embeds: [embed],
        components: [row] 
      });
    }
    
    const claimEmbed = createEmbed({
      title: 'Ticket übernommen',
      description: `🎉 ${claimer} hat dieses Ticket übernommen!`,
      color: '#2ecc71'
    });
    
    const unclaimRow = new ActionRowBuilder().addComponents(
      new ButtonBuilder()
        .setCustomId('ticket_unclaim')
        .setLabel('Freigeben')
        .setStyle(ButtonStyle.Secondary)
        .setEmoji('🔓')
    );

    const claimStatusMessage = messages.find(m =>
      m.embeds.length > 0 &&
      (m.embeds[0].title === 'Ticket übernommen' || m.embeds[0].title === 'Ticket freigegeben')
    );

    if (claimStatusMessage) {
      await claimStatusMessage.edit({ embeds: [claimEmbed], components: [unclaimRow] });
    } else {
      await channel.send({ embeds: [claimEmbed], components: [unclaimRow] });
    }
    
    await logTicketEvent({
      client: channel.client,
      guildId: channel.guild.id,
      event: {
        type: 'claim',
        ticketId: channel.id,
        ticketNumber: ticketData.id,
        userId: ticketData.userId,
        executorId: claimer.id,
        metadata: {
          claimedAt: ticketData.claimedAt
        }
      }
    });
    
    return ticketData;
    
  } catch (error) {
    rethrowTicketError(error, 'claimTicket', 'Ticket konnte nicht übernommen werden. Bitte versuche es gleich erneut.', { guildId: channel?.guild?.id, channelId: channel?.id, claimerId: claimer?.id });
  }
}

export async function reopenTicket(channel, reopener) {
  try {
    const ticketData = requireTicket(await getTicketData(channel.guild.id, channel.id), channel);
    
    if (ticketData.status !== 'closed') {
      ticketUserError(
        'Ticket not closed',
        'Dieses Ticket ist aktuell nicht geschlossen.',
        ErrorTypes.VALIDATION,
        { channelId: channel.id, operation: 'reopenTicket' }
      );
    }

    const config = await getGuildConfig(channel.client, channel.guild.id);
    const openCategoryId = config.ticketCategoryId || null;
    let movedToOpenCategory = false;
    let openCategoryMoveFailed = false;
    
    ticketData.status = 'open';
    ticketData.closedBy = null;
    ticketData.closedAt = null;
    ticketData.closeReason = null;
    
    await saveTicketData(channel.guild.id, channel.id, ticketData);

    if (openCategoryId && channel.parentId !== openCategoryId) {
      const openCategory = channel.guild.channels.cache.get(openCategoryId)
        || await channel.guild.channels.fetch(openCategoryId).catch(() => null);

      if (openCategory?.type === ChannelType.GuildCategory) {
        try {
          await channel.setParent(openCategoryId, { lockPermissions: false });
          movedToOpenCategory = true;
        } catch (moveError) {
          openCategoryMoveFailed = true;
          logger.warn(`Could not move reopened ticket ${channel.id} to open category ${openCategoryId}: ${moveError.message}`);
        }
      } else {
        openCategoryMoveFailed = true;
        logger.warn(`Configured open ticket category is invalid for guild ${channel.guild.id}: ${openCategoryId}`);
      }
    }
    
    try {
      const user = await channel.guild.members.fetch(ticketData.userId).catch(() => null);
      if (user) {
        await channel.permissionOverwrites.create(user, {
          ViewChannel: true,
          SendMessages: true,
          ReadMessageHistory: true,
          AttachFiles: true
        });
      }
    } catch (error) {
      logger.warn(`Could not restore access for user ${ticketData.userId}:`, error.message);
    }
    
    const messages = await channel.messages.fetch();
    const ticketMessage = messages.find(m => 
      m.embeds.length > 0 && 
      m.embeds[0].title?.startsWith('Ticket #')
    );
    
    if (ticketMessage) {
      const embed = ticketMessage.embeds[0];
      const statusField = embed.fields?.find(f => f.name === 'Status');
      
      if (statusField) {
        statusField.value = '🟢 Offen';
      }
      
      const row = buildTicketControlRow({ claimedBy: ticketData.claimedBy });
      
      await ticketMessage.edit({ 
        embeds: [embed],
        components: [row] 
      });
    }
    
    const reopenEmbed = createEmbed({
      title: 'Ticket erneut geöffnet',
      description: `🔓 ${reopener} hat dieses Ticket erneut geöffnet!`,
      color: '#2ecc71'
    });

    const closeStatusMessage = messages.find(m =>
      m.embeds.length > 0 &&
      m.embeds[0].title === 'Ticket geschlossen' &&
      m.components.length > 0 &&
      m.components[0].components.some(c => c.customId === 'ticket_reopen')
    );

    if (closeStatusMessage) {
      await closeStatusMessage.edit({ embeds: [reopenEmbed], components: [] });
    } else {
      await channel.send({ embeds: [reopenEmbed] });
    }
    
    return { ticketData, movedToOpenCategory, openCategoryMoveFailed };
    
  } catch (error) {
    rethrowTicketError(error, 'reopenTicket', 'Ticket konnte nicht erneut geöffnet werden. Bitte versuche es gleich erneut.', { guildId: channel?.guild?.id, channelId: channel?.id, reopenerId: reopener?.id });
  }
}

function escapeHtml(text) {
  if (!text) return '';
  return String(text)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#039;');
}

async function generateTranscript(channel) {
  try {
    logger.debug('Generating transcript for channel', {
      channelId: channel.id,
      channelName: channel.name
    });

    const messages = [];
    let before = undefined;
    let batch;
    do {
      batch = await channel.messages.fetch({ limit: 100, ...(before ? { before } : {}) });
      if (batch.size === 0) break;
      messages.push(...batch.values());
      before = batch.last()?.id;
    } while (batch.size === 100);

    messages.sort((a, b) => a.createdTimestamp - b.createdTimestamp);

    const escape = (str) =>
      String(str ?? '')
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;');

    const rows = messages.map((msg) => {
      const ts = new Date(msg.createdTimestamp).toISOString().replace('T', ' ').slice(0, 19);
      const author = escape(msg.author?.tag ?? msg.author?.username ?? 'Unbekannt');
      const content = escape(msg.content || (msg.embeds.length ? '[embed]' : '[attachment]'));
      return `<tr><td class="ts">${ts}</td><td class="author">${author}</td><td class="msg">${content}</td></tr>`;
    }).join('\n');

    const html = `<!DOCTYPE html>
<html lang="de">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<title>Transkript – #${escape(channel.name)}</title>
<style>
body{font-family:sans-serif;background:#36393f;color:#dcddde;margin:0;padding:16px}
h1{color:#fff;font-size:1.2rem;margin-bottom:8px}
table{width:100%;border-collapse:collapse;font-size:0.85rem}
th{background:#2f3136;color:#8e9297;padding:6px 8px;text-align:left;border-bottom:2px solid #202225}
td{padding:4px 8px;border-bottom:1px solid #40444b;vertical-align:top}
.ts{color:#72767d;white-space:nowrap;width:160px}
.author{color:#7289da;white-space:nowrap;width:160px}
.msg{word-break:break-word}
</style>
</head>
<body>
<h1>📜 Transkript – #${escape(channel.name)}</h1>
<p style="color:#72767d">${messages.length} Nachricht${messages.length === 1 ? '' : 'en'} exportiert am ${new Date().toUTCString()}</p>
<table>
<thead><tr><th>Zeitstempel (UTC)</th><th>Autor</th><th>Nachricht</th></tr></thead>
<tbody>
${rows}
</tbody>
</table>
</body>
</html>`;

    const buffer = Buffer.from(html, 'utf8');
    const attachment = new AttachmentBuilder(buffer, { name: `ticket-${channel.id}.html` });

    logger.info('✅ Successfully generated transcript', {
      channelId: channel.id,
      channelName: channel.name,
      messageCount: messages.length,
      size: buffer.length
    });

    return attachment;
  } catch (error) {
    logger.error('❌ Failed to generate transcript:', {
      channelId: channel.id,
      channelName: channel.name,
      errorMessage: error.message,
      errorName: error.name,
      errorStack: error.stack
    });
    return null;
  }
}

export async function deleteTicket(channel, deleter) {
  try {
    const ticketData = requireTicket(await getTicketData(channel.guild.id, channel.id), channel);
    
    const deleteEmbed = createEmbed({
      title: 'Ticket gelöscht',
      description: `🗑️ Dieses Ticket wird in ${TICKET_DELETE_DELAY_SECONDS} Sekunden dauerhaft gelöscht.`,
      color: '#e74c3c',
      footer: { text: `Ticket ID: ${ticketData.id}` }
    });
    
    await channel.send({ embeds: [deleteEmbed] });
    
    await logTicketEvent({
      client: channel.client,
      guildId: channel.guild.id,
      event: {
        type: 'delete',
        ticketId: channel.id,
        ticketNumber: ticketData.id,
        userId: ticketData.userId,
        executorId: deleter.id,
        metadata: {
          deletedAt: new Date().toISOString()
        }
      }
    });

    setTimeout(async () => {
      try {
        logger.debug('Starting ticket deletion process', {
          channelId: channel.id,
          ticketId: ticketData.id
        });

        let attachment = null;
        try {
          attachment = await generateTranscript(channel);
          if (attachment) {
            logger.info('Transcript generated successfully, attempting to send', {
              channelId: channel.id,
              ticketNumber: ticketData.id
            });
          } else {
            logger.warn('Transcript generation returned null', {
              channelId: channel.id,
              ticketNumber: ticketData.id
            });
          }
        } catch (transcriptError) {
          logger.error('Error during transcript generation', {
            channelId: channel.id,
            ticketNumber: ticketData.id,
            error: transcriptError.message
          });
        }

        if (attachment) {
          try {
            const guildConfig = await getGuildConfig(channel.client, channel.guild.id);
            if (!guildConfig.ticketTranscriptChannelId) {
              logger.warn('No transcript channel configured, skipping transcript send', {
                channelId: channel.id,
                ticketNumber: ticketData.id
              });
            } else {
              const transcriptChannel = await channel.client.channels.fetch(guildConfig.ticketTranscriptChannelId).catch(() => null);
              
              if (!transcriptChannel) {
                logger.error('Could not fetch transcript channel', {
                  channelId: channel.id,
                  transcriptChannelId: guildConfig.ticketTranscriptChannelId
                });
              } else if (!transcriptChannel.isSendable()) {
                logger.error('Transcript channel exists but is not sendable', {
                  channelId: channel.id,
                  transcriptChannelId: transcriptChannel.id
                });
              } else {
                
                const transcriptEmbed = buildStandardLogEmbed({
                  color: 0x3498db,
                  title: 'Ticket-Transkript',
                  description: [
                    formatLogLine('Ticket', `#${ticketData.id}`),
                    formatLogLine('Kanal', `#${channel.name}`),
                    formatLogLine('Erstellt', `<t:${Math.floor(Date.now() / 1000)}:F>`),
                  ].join('\n'),
                  footer: deleter?.username
                   ? { text: `Gelöscht von ${deleter.username}`, iconURL: deleter.displayAvatarURL?.() }
                    : undefined,
                  timestamp: true,
                });

                await transcriptChannel.send({
                  embeds: [transcriptEmbed],
                  files: [attachment]
                });

                logger.info('✅ Transcript sent successfully', {
                  channelId: channel.id,
                  ticketNumber: ticketData.id,
                  transcriptChannelId: transcriptChannel.id
                });
              }
            }
          } catch (sendError) {
            logger.error('Failed to send transcript to channel:', {
              channelId: channel.id,
              ticketNumber: ticketData.id,
              error: sendError.message
            });
          }
        }

        try {
          await channel.delete('Ticket deleted permanently');
          logger.info('✅ Channel deleted', {
            channelId: channel.id,
            channelName: channel.name,
            ticketNumber: ticketData.id
          });
        } catch (deleteError) {
          logger.error('❌ Failed to delete ticket channel:', {
            channelId: channel.id,
            channelName: channel.name,
            ticketNumber: ticketData.id,
            errorMessage: deleteError.message,
            errorCode: deleteError.code,
            errorName: deleteError.name
          });
        }
      } catch (error) {
        logger.error('❌ Unexpected error during ticket deletion:', {
          channelId: channel.id,
          channelName: channel?.name,
          ticketNumber: ticketData?.id,
          errorMessage: error.message,
          errorName: error.name,
          errorStack: error.stack
        });
      }
    }, TICKET_DELETE_DELAY_MS);
    
    return ticketData;
    
  } catch (error) {
    rethrowTicketError(error, 'deleteTicket', 'Ticket konnte nicht gelöscht werden. Bitte versuche es gleich erneut.', { guildId: channel?.guild?.id, channelId: channel?.id, deleterId: deleter?.id });
  }
}

export async function unclaimTicket(channel, unclaimer) {
  try {
    const ticketData = requireTicket(await getTicketData(channel.guild.id, channel.id), channel);
    
    if (!ticketData.claimedBy) {
      ticketUserError(
        'Ticket not claimed',
        'Dieses Ticket ist aktuell nicht übernommen.',
        ErrorTypes.VALIDATION,
        { channelId: channel.id, operation: 'unclaimTicket' }
      );
    }
    
    if (ticketData.claimedBy !== unclaimer.id && !unclaimer.permissions.has(PermissionFlagsBits.ManageChannels)) {
      ticketUserError(
        'Cannot unclaim ticket',
        'Du kannst nur deine eigenen Tickets freigeben oder benötigst die Berechtigung „Kanäle verwalten“.',
        ErrorTypes.PERMISSION,
        { channelId: channel.id, operation: 'unclaimTicket' }
      );
    }
    
    const previousClaimer = ticketData.claimedBy;
    ticketData.claimedBy = null;
    ticketData.claimedAt = null;
    
    await saveTicketData(channel.guild.id, channel.id, ticketData);
    
    const messages = await channel.messages.fetch();
    const ticketMessage = messages.find(m => 
      m.embeds.length > 0 && 
      m.embeds[0].title?.startsWith('Ticket #')
    );
    
    if (ticketMessage) {
      const embed = ticketMessage.embeds[0];
      const claimedField = embed.fields?.find(f => f.name === 'Zugewiesen an');
      
      if (claimedField) {
        claimedField.value = 'Nicht zugewiesen';
      }
      
      const row = buildTicketControlRow();
      
      await ticketMessage.edit({ 
        embeds: [embed],
        components: [row] 
      });
    }
    
    const claimMessage = messages.find(m => 
      m.embeds.length > 0 && 
      (m.embeds[0].title === 'Ticket übernommen' || m.embeds[0].title === 'Ticket freigegeben')
    );
    
    if (claimMessage) {
      const unclaimEmbed = createEmbed({
        title: 'Ticket freigegeben',
        description: `🔓 ${unclaimer} hat dieses Ticket freigegeben!`,
        color: '#f39c12'
      });
      
      await claimMessage.edit({ 
        embeds: [unclaimEmbed],
        components: []
      });
    } else {
      const unclaimEmbed = createEmbed({
        title: 'Ticket freigegeben',
        description: `🔓 ${unclaimer} hat dieses Ticket freigegeben!`,
        color: '#f39c12'
      });
      
      await channel.send({ embeds: [unclaimEmbed] });
    }
    
    await logTicketEvent({
      client: channel.client,
      guildId: channel.guild.id,
      event: {
        type: 'unclaim',
        ticketId: channel.id,
        ticketNumber: ticketData.id,
        userId: ticketData.userId,
        executorId: unclaimer.id,
        metadata: {
          previousClaimer: previousClaimer
        }
      }
    });
    
    return ticketData;
    
  } catch (error) {
    rethrowTicketError(error, 'unclaimTicket', 'Ticket konnte nicht freigegeben werden. Bitte versuche es gleich erneut.', { guildId: channel?.guild?.id, channelId: channel?.id, unclaimerId: unclaimer?.id });
  }
}

async function getNextTicketNumber(guildId) {
  return await incrementTicketCounter(guildId);
}

export async function updateTicketPriority(channel, priority, updater) {
  try {
    const ticketData = requireTicket(await getTicketData(channel.guild.id, channel.id), channel);
    
    const priorityInfo = PRIORITY_MAP[priority];
    if (!priorityInfo) {
      ticketUserError(
      'Ungültige Prioritätsstufe',
      'Ungültige Prioritätsstufe.',
      ErrorTypes.VALIDATION,
      { channelId: channel.id, priority, operation: 'updateTicketPriority' }
    );
    }
    
    ticketData.priority = priority;
    ticketData.priorityUpdatedBy = updater.id;
    ticketData.priorityUpdatedAt = new Date().toISOString();
    
    await saveTicketData(channel.guild.id, channel.id, ticketData);

    const currentName = channel.name;
    const priorityEmojis = [...new Set(Object.values(PRIORITY_MAP).map((item) => item.emoji).filter(Boolean))];
    const escapedPriorityEmojis = priorityEmojis.map((emoji) => emoji.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'));
    const cleanName = escapedPriorityEmojis.length > 0
      ? currentName.replace(new RegExp(`(?:${escapedPriorityEmojis.join('|')})`, 'g'), '').trim()
      : currentName.trim();
    const newName = priority === 'none' ? cleanName : `${priorityInfo.emoji} ${cleanName}`;

    if (newName && newName !== currentName) {
      try {
        await channel.setName(newName);
      } catch (nameError) {
        logger.warn(`Could not update channel name for priority: ${nameError.message}`);
      }
    }
    
    const messages = await channel.messages.fetch();
    const ticketMessage = messages.find(m => 
      m.embeds.length > 0 && 
      m.embeds[0].title?.startsWith('Ticket #')
    );
    
    if (ticketMessage) {
      const embed = ticketMessage.embeds[0];
      const descriptionBase = (embed.description || '')
        .split('\n**Priorität:**')[0]
        .split('\n**Priority:**')[0];
      
      const updatedEmbed = createEmbed({
        title: embed.title || 'Ticket',
        description: `${descriptionBase}\n**Priorität:** ${priorityInfo.emoji} ${priorityInfo.label}`,
        color: priorityInfo.color,
        fields: embed.fields || [],
        footer: embed.footer
      });
      
      await ticketMessage.edit({ embeds: [updatedEmbed] });
    }
    
    const updateEmbed = createEmbed({
      title: 'Priorität aktualisiert',
      description: `📊 Die Ticket-Priorität wurde von ${updater} auf **${priorityInfo.emoji} ${priorityInfo.label}** gesetzt.`,
      color: priorityInfo.color
    });
    
    await channel.send({ embeds: [updateEmbed] });
    
    await logTicketEvent({
      client: channel.client,
      guildId: channel.guild.id,
      event: {
        type: 'priority',
        ticketId: channel.id,
        ticketNumber: ticketData.id,
        userId: ticketData.userId,
        executorId: updater.id,
        priority: priority,
        metadata: {
          previousPriority: ticketData.priority,
          updatedAt: ticketData.priorityUpdatedAt
        }
      }
    });
    
    return ticketData;
    
  } catch (error) {
    rethrowTicketError(error, 'updateTicketPriority', 'Ticket-Priorität konnte nicht aktualisiert werden. Bitte versuche es gleich erneut.', { guildId: channel?.guild?.id, channelId: channel?.id, updaterId: updater?.id, priority });
  }
}