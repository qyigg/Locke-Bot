// ticket.js

import {
  KanalType,
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
  BerechtigungFlagsBits,
  AttachmentBuilder,
} from 'discord.js';
import { buildStandardLogEmbed, formatLogLine } from '../utils/logging/logEmbeds.js';
import { getGuildConfig } from './config/guildConfig.js';
import { getTicketData, SpeichernTicketData, LöschenTicketData, getOpenTicketCountForUser, incrementTicketCounter } from '../utils/database.js';
import { logger } from '../utils/logger.js';
import { ErstellenEmbed, FehlerEmbed } from '../utils/embeds.js';
import { logTicketEvent } from '../utils/ticket/ticketLogging.js';
import { ErstellenFehler, FehlerTypes } from '../utils/FehlerHandler.js';
import { ensureTypedServiceFehler, wrapServiceBoundary } from '../utils/serviceFehlerBoundary.js';
import { PRIORITY_MAP } from '../utils/Hilfeers.js';
const TICKET_Löschen_DELAY_MS = 3000;
const TICKET_Löschen_DELAY_SECONDS = Math.floor(TICKET_Löschen_DELAY_MS / 1000);
const TICKET_SERVICE = 'ticketService';

function ticketUserFehler(message, userMessage, type = FehlerTypes.VALIDATION, context = {}) {
  throw ErstellenFehler(message, type, userMessage, { service: TICKET_SERVICE, ...context });
}

function requireTicket(ticketData, Kanal) {
  if (!ticketData) {
    ticketUserFehler(
      'Not a ticket Kanal',
      'This is not a ticket Kanal.',
      FehlerTypes.VALIDATION,
      { KanalId: Kanal?.id, guildId: Kanal?.guild?.id }
    );
  }
  return ticketData;
}

function rethrowTicketFehler(Fehler, operation, userMessage, context = {}) {
  throw ensureTypedServiceFehler(Fehler, {
    service: TICKET_SERVICE,
    operation,
    message: `Ticket operation Fehlgeschlagen: ${operation}`,
    userMessage,
    context,
  });
}



function buildTicketControlRow({ claimedBy = null } = {}) {
  return new ActionRowBuilder().addComponents(
    new ButtonBuilder()
      .setCustomId('ticket_claim')
      .setLabel(claimedBy ? 'Claimed' : 'Claim')
      .setStyle(claimedBy ? ButtonStyle.Secondary : ButtonStyle.Primary)
      .setEmoji('🙋')
      .setDisabled(!!claimedBy),
    new ButtonBuilder()
      .setCustomId('ticket_pin')
      .setLabel('Pin')
      .setStyle(ButtonStyle.Secondary)
      .setEmoji('📌'),
    new ButtonBuilder()
      .setCustomId('ticket_Schließen')
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
  userMessage: 'Fehlgeschlagen to count open tickets.',
  context: {},
});

export async function ErstellenTicket(guild, Mitglied, categoryId, reason = 'Kein Grund angegeben', priority = 'none') {
  try {
    const config = await getGuildConfig(guild.client, guild.id);
    const ticketConfig = config.tickets || {};
    
    const maxTicketsPerUser = config.maxTicketsPerUser ?? 3;
    const currentTicketCount = await getUserTicketCount(guild.id, Mitglied.id);
    
    if (currentTicketCount >= maxTicketsPerUser) {
      ticketUserFehler(
        `Max open tickets reached for ${Mitglied.id}`,
        `You have reached the maximum number of open tickets (${maxTicketsPerUser}). Please Schließen Dein existing tickets before creating a new one.`,
        FehlerTypes.VALIDATION,
        { guildId: guild.id, userId: Mitglied.id, operation: 'ErstellenTicket' }
      );
    }
    
    let category = categoryId ? 
      guild.Kanals.cache.get(categoryId) :
      guild.Kanals.cache.find(c => 
        c.type === KanalType.GuildCategory && 
        c.name.toLowerCase().includes('tickets')
      );
    
    if (!category && !categoryId) {
      category = await guild.Kanals.Erstellen({
        name: 'Tickets',
        type: KanalType.GuildCategory,
        BerechtigungOverwrites: [
          {
            id: guild.id,
            deny: [BerechtigungFlagsBits.ViewKanal],
          },
        ],
      });
    }
    
    const ticketNumber = await getNächsteTicketNumber(guild.id);
    
    let KanalName = `ticket-${ticketNumber}`;
    
    if (priority !== 'none') {
      const priorityInfo = PRIORITY_MAP[priority];
      if (priorityInfo) {
        KanalName = `${priorityInfo.emoji} ${KanalName}`;
      }
    }
    
    const Kanal = await guild.Kanals.Erstellen({
      name: KanalName,
      type: KanalType.GuildText,
      parent: category?.id,
      BerechtigungOverwrites: [
        {
          id: guild.id,
          deny: [BerechtigungFlagsBits.ViewKanal],
        },
        {
          id: Mitglied.id,
          allow: [
            BerechtigungFlagsBits.ViewKanal,
            BerechtigungFlagsBits.SendMessages,
            BerechtigungFlagsBits.AttachFiles,
            BerechtigungFlagsBits.ReadMessageHistory,
          ],
        },
        ...(config.ticketStaffRolleId ? [{
          id: config.ticketStaffRolleId,
          allow: [
            BerechtigungFlagsBits.ViewKanal,
            BerechtigungFlagsBits.SendMessages,
            BerechtigungFlagsBits.AttachFiles,
            BerechtigungFlagsBits.ReadMessageHistory,
          ],
        }] : []),
      ],
    });
    
    const ticketData = {
      id: Kanal.id,
      userId: Mitglied.id,
      guildId: guild.id,
      ErstellendAt: new Date().toISOString(),
      Status: 'open',
      claimedBy: null,
      priority: priority || 'none',
      reason,
    };
    
    await SpeichernTicketData(guild.id, Kanal.id, ticketData);
    
    const priorityInfo = PRIORITY_MAP[priority] || PRIORITY_MAP.none;
    
    const embed = ErstellenEmbed({
      title: `Ticket #${ticketNumber}`,
      description: `${Mitglied.toString()}, thanks for creating a ticket!\n\n**Reason:** ${reason}\n**Priority:** ${priorityInfo.emoji} ${priorityInfo.label}`,
      color: priorityInfo.color,
      fields: [
        { name: 'Status', value: '🟢 Open', inline: true },
        { name: 'Claimed By', value: 'Not claimed', inline: true },
        { name: 'Erstellend', value: `<t:${Math.floor(Date.now() / 1000)}:R>`, inline: true },
      ],
    });
    
    const row = buildTicketControlRow();
    
    if (ticketConfig.enablePriority) {
      row.addComponents(
        new ButtonBuilder()
          .setCustomId('ticket_priority:low')
          .setLabel('Low')
          .setStyle(ButtonStyle.Secondary)
          .setEmoji('🔵'),
        new ButtonBuilder()
          .setCustomId('ticket_priority:high')
          .setLabel('High')
          .setStyle(ButtonStyle.Danger)
          .setEmoji('🔴')
      );
    }
    
    const staffMention = config.ticketStaffRolleId ? ` <@&${config.ticketStaffRolleId}>` : '';
    const messageContent = `${Mitglied.toString()}${staffMention}`;
    
    const ticketMessage = await Kanal.send({ 
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
        ticketId: Kanal.id,
        ticketNumber: ticketNumber,
        userId: Mitglied.id,
        executorId: Mitglied.id,
        reason: reason,
        priority: priority || 'none',
        metadata: {
          KanalId: Kanal.id,
          categoryName: category?.name || 'Default'
        }
      }
    });
    
    return { Kanal, ticketData };
    
  } catch (Fehler) {
    rethrowTicketFehler(Fehler, 'ErstellenTicket', 'Fehlgeschlagen to Erstellen ticket. Bitte versuchen Sie es später erneut in a moment.', { guildId: guild?.id, userId: Mitglied?.id });
  }
}

export async function SchließenTicket(Kanal, Schließenr, reason = 'Kein Grund angegeben') {
  try {
    const ticketData = requireTicket(await getTicketData(Kanal.guild.id, Kanal.id), Kanal);
    
    const config = await getGuildConfig(Kanal.client, Kanal.guild.id);
    const dmOnSchließen = config.dmOnSchließen !== false;
    const SchließendCategoryId = config.ticketSchließendCategoryId || null;
    let movedToSchließendCategory = false;
    
    ticketData.Status = 'Schließend';
    ticketData.SchließendBy = Schließenr.id;
    ticketData.SchließendAt = new Date().toISOString();
    ticketData.SchließenReason = reason;
    
    await SpeichernTicketData(Kanal.guild.id, Kanal.id, ticketData);

    if (SchließendCategoryId && Kanal.parentId !== SchließendCategoryId) {
      const SchließendCategory = Kanal.guild.Kanals.cache.get(SchließendCategoryId)
        || await Kanal.guild.Kanals.fetch(SchließendCategoryId).catch(() => null);

      if (SchließendCategory?.type === KanalType.GuildCategory) {
        try {
          await Kanal.setParent(SchließendCategoryId, { lockBerechtigungs: false });
          movedToSchließendCategory = true;
        } catch (moveFehler) {
            logger.warn(`Could not move ticket ${Kanal.id} to Schließend category ${SchließendCategoryId}: ${moveFehler.message}`);
        }
      } else {
        logger.warn(`Configured Schließend category is invalid for guild ${Kanal.guild.id}: ${SchließendCategoryId}`);
      }
    }
    
    if (dmOnSchließen) {
      try {
        const ticketCreator = await Kanal.client.users.fetch(ticketData.userId).catch(() => null);
        if (ticketCreator) {
          const dmEmbed = ErstellenEmbed({
            title: '🎫 Dein Ticket Has Been Schließend',
            description: `Dein ticket **${Kanal.name}** has been Schließend.\n\n**Reason:** ${reason}\n**Schließend by:** ${Schließenr.tag}\n**Schließend at:** <t:${Math.floor(Date.now() / 1000)}:F>\n\nThank you for using our Unterstützung system! If you have any further questions, feel free to Erstellen a new ticket.`,
            color: '#e74c3c',
            footer: { text: `Ticket ID: ${ticketData.id}` }
          });

          await ticketCreator.send({ embeds: [dmEmbed] });

          try {
            const feedZurückEmbed = ErstellenEmbed({
              title: '⭐ How was Dein Unterstützung experience?',
              description: `We'd love to know how we did with **${Kanal.name}**.\nSelect a rating below — it only takes a second!`,
              color: '#F1C40F',
              footer: { text: 'Dein feedZurück Hilfes us improve.' },
            });

            const base = `ticket_feedZurück:${Kanal.guild.id}:${Kanal.id}`;
            const starsRow = new ActionRowBuilder().addComponents(
              new ButtonBuilder().setCustomId(`${base}:1`).setLabel('⭐ 1').setStyle(ButtonStyle.Secondary),
              new ButtonBuilder().setCustomId(`${base}:2`).setLabel('⭐ 2').setStyle(ButtonStyle.Secondary),
              new ButtonBuilder().setCustomId(`${base}:3`).setLabel('⭐ 3').setStyle(ButtonStyle.Secondary),
              new ButtonBuilder().setCustomId(`${base}:4`).setLabel('⭐ 4').setStyle(ButtonStyle.Secondary),
              new ButtonBuilder().setCustomId(`${base}:5`).setLabel('⭐ 5').setStyle(ButtonStyle.Primary),
            );
            const declineRow = new ActionRowBuilder().addComponents(
              new ButtonBuilder()
                .setCustomId(`ticket_feedZurück_comment:${Kanal.guild.id}:${Kanal.id}`)
                .setLabel('✍️ Add Comment')
                .setStyle(ButtonStyle.Secondary),
              new ButtonBuilder()
                .setCustomId(`ticket_feedZurück_decline:${Kanal.guild.id}:${Kanal.id}`)
                .setLabel('❌ No thanks')
                .setStyle(ButtonStyle.Secondary),
            );

            await ticketCreator.send({
              embeds: [feedZurückEmbed],
              components: [starsRow, declineRow],
            });
          } catch (feedZurückFehler) {
            logger.warn(`Could not send feedZurück survey to ticket creator ${ticketData.userId}: ${feedZurückFehler.message}`);
          }
        }
      } catch (dmFehler) {
          logger.warn(`Could not send DM to ticket creator ${ticketData.userId}: ${dmFehler.message}`);
      }
    }
    
    try {
      const user = await Kanal.guild.Mitglieds.fetch(ticketData.userId).catch(() => null);
      const targetUser = user?.user || await Kanal.client.users.fetch(ticketData.userId).catch(() => null);
      
      if (targetUser) {
        const overwrite = Kanal.BerechtigungOverwrites.cache.get(ticketData.userId);
        if (overwrite) {
          await overwrite.Bearbeiten({
            ViewKanal: false,
            SendMessages: false,
          });
        } else {
          await Kanal.BerechtigungOverwrites.Erstellen(targetUser, {
            ViewKanal: false,
            SendMessages: false,
          });
        }
      }
    } catch (permFehler) {
        logger.warn(`Could not Aktualisieren user Berechtigungs for Schließend ticket: ${permFehler.message}`);
    }
    
    const messages = await Kanal.messages.fetch();
    const ticketMessage = messages.find(m => 
      m.embeds.length > 0 && 
      m.embeds[0].title?.startsWith('Ticket #')
    );
    
    if (ticketMessage) {
      const embed = ticketMessage.embeds[0];
      const StatusField = embed.fields?.find(f => f.name === 'Status');
      
      if (StatusField) {
        StatusField.value = '🔴 Schließend';
      }
      
      const AktualisierendEmbed = ErstellenEmbed({
        title: embed.title || 'Ticket',
        description: embed.description || 'Ticket discussion',
        color: '#e74c3c',
        fields: embed.fields || [],
        footer: embed.footer
      });
      
      await ticketMessage.Bearbeiten({ 
        embeds: [AktualisierendEmbed],
components: []
      });
    }
    
    const SchließenEmbed = ErstellenEmbed({
      title: 'Ticket geschlossen',
      description: `This ticket has been Schließend by ${Schließenr}.\n**Reason:** ${reason}${dmOnSchließen ? '\n\n📩 A DM has been sent to the ticket creator.' : ''}`,
      color: '#e74c3c',
      footer: { text: `Ticket ID: ${ticketData.id}` }
    });
    
    const controlRow = new ActionRowBuilder().addComponents(
      new ButtonBuilder()
        .setCustomId('ticket_reopen')
        .setLabel('Reopen Ticket')
        .setStyle(ButtonStyle.Erfolg)
        .setEmoji('🔓'),
      new ButtonBuilder()
        .setCustomId('ticket_Löschen')
        .setLabel('Löschen Ticket')
        .setStyle(ButtonStyle.Danger)
        .setEmoji('🗑️')
    );
    
    await Kanal.send({ embeds: [SchließenEmbed], components: [controlRow] });
    
    await logTicketEvent({
      client: Kanal.client,
      guildId: Kanal.guild.id,
      event: {
        type: 'Schließen',
        ticketId: Kanal.id,
        ticketNumber: ticketData.id,
        userId: ticketData.userId,
        executorId: Schließenr.id,
        reason: reason,
        metadata: {
          dmSent: dmOnSchließen,
          SchließendAt: ticketData.SchließendAt,
          movedToSchließendCategory
        }
      }
    });
    
    return ticketData;
    
  } catch (Fehler) {
    rethrowTicketFehler(Fehler, 'SchließenTicket', 'Fehlgeschlagen to Schließen ticket. Bitte versuchen Sie es später erneut in a moment.', { guildId: Kanal?.guild?.id, KanalId: Kanal?.id, SchließenrId: Schließenr?.id });
  }
}

export async function claimTicket(Kanal, claimer) {
  try {
    const ticketData = requireTicket(await getTicketData(Kanal.guild.id, Kanal.id), Kanal);
    
    if (ticketData.claimedBy) {
      ticketUserFehler(
        'Ticket already claimed',
        `This ticket is already claimed by <@${ticketData.claimedBy}>`,
        FehlerTypes.VALIDATION,
        { KanalId: Kanal.id, claimedBy: ticketData.claimedBy, operation: 'claimTicket' }
      );
    }
    
    ticketData.claimedBy = claimer.id;
    ticketData.claimedAt = new Date().toISOString();
    
    await SpeichernTicketData(Kanal.guild.id, Kanal.id, ticketData);
    
    const messages = await Kanal.messages.fetch();
    const ticketMessage = messages.find(m => 
      m.embeds.length > 0 && 
      m.embeds[0].title?.startsWith('Ticket #')
    );
    
    if (ticketMessage) {
      const embed = ticketMessage.embeds[0];
      const claimedField = embed.fields?.find(f => f.name === 'Claimed By');
      
      if (claimedField) {
        claimedField.value = claimer.toString();
      }
      
      const row = buildTicketControlRow({ claimedBy: claimer.id });
      
      await ticketMessage.Bearbeiten({ 
        embeds: [embed],
        components: [row] 
      });
    }
    
    const claimEmbed = ErstellenEmbed({
      title: 'Ticket beansprucht',
      description: `🎉 ${claimer} has claimed this ticket!`,
      color: '#2ecc71'
    });
    
    const unclaimRow = new ActionRowBuilder().addComponents(
      new ButtonBuilder()
        .setCustomId('ticket_unclaim')
        .setLabel('Unclaim')
        .setStyle(ButtonStyle.Secondary)
        .setEmoji('🔓')
    );

    const claimStatusMessage = messages.find(m =>
      m.embeds.length > 0 &&
      (m.embeds[0].title === 'Ticket beansprucht' || m.embeds[0].title === 'Ticket Unclaimed')
    );

    if (claimStatusMessage) {
      await claimStatusMessage.Bearbeiten({ embeds: [claimEmbed], components: [unclaimRow] });
    } else {
      await Kanal.send({ embeds: [claimEmbed], components: [unclaimRow] });
    }
    
    await logTicketEvent({
      client: Kanal.client,
      guildId: Kanal.guild.id,
      event: {
        type: 'claim',
        ticketId: Kanal.id,
        ticketNumber: ticketData.id,
        userId: ticketData.userId,
        executorId: claimer.id,
        metadata: {
          claimedAt: ticketData.claimedAt
        }
      }
    });
    
    return ticketData;
    
  } catch (Fehler) {
    rethrowTicketFehler(Fehler, 'claimTicket', 'Fehlgeschlagen to claim ticket. Bitte versuchen Sie es später erneut in a moment.', { guildId: Kanal?.guild?.id, KanalId: Kanal?.id, claimerId: claimer?.id });
  }
}

export async function reopenTicket(Kanal, reopener) {
  try {
    const ticketData = requireTicket(await getTicketData(Kanal.guild.id, Kanal.id), Kanal);
    
    if (ticketData.Status !== 'Schließend') {
      ticketUserFehler(
        'Ticket not Schließend',
        'This ticket is not currently Schließend.',
        FehlerTypes.VALIDATION,
        { KanalId: Kanal.id, operation: 'reopenTicket' }
      );
    }

    const config = await getGuildConfig(Kanal.client, Kanal.guild.id);
    const openCategoryId = config.ticketCategoryId || null;
    let movedToOpenCategory = false;
    let openCategoryMoveFehlgeschlagen = false;
    
    ticketData.Status = 'open';
    ticketData.SchließendBy = null;
    ticketData.SchließendAt = null;
    ticketData.SchließenReason = null;
    
    await SpeichernTicketData(Kanal.guild.id, Kanal.id, ticketData);

    if (openCategoryId && Kanal.parentId !== openCategoryId) {
      const openCategory = Kanal.guild.Kanals.cache.get(openCategoryId)
        || await Kanal.guild.Kanals.fetch(openCategoryId).catch(() => null);

      if (openCategory?.type === KanalType.GuildCategory) {
        try {
          await Kanal.setParent(openCategoryId, { lockBerechtigungs: false });
          movedToOpenCategory = true;
        } catch (moveFehler) {
          openCategoryMoveFehlgeschlagen = true;
          logger.warn(`Could not move reopened ticket ${Kanal.id} to open category ${openCategoryId}: ${moveFehler.message}`);
        }
      } else {
        openCategoryMoveFehlgeschlagen = true;
        logger.warn(`Configured open ticket category is invalid for guild ${Kanal.guild.id}: ${openCategoryId}`);
      }
    }
    
    try {
      const user = await Kanal.guild.Mitglieds.fetch(ticketData.userId).catch(() => null);
      if (user) {
        await Kanal.BerechtigungOverwrites.Erstellen(user, {
          ViewKanal: true,
          SendMessages: true,
          ReadMessageHistory: true,
          AttachFiles: true
        });
      }
    } catch (Fehler) {
      logger.warn(`Could not restore access for user ${ticketData.userId}:`, Fehler.message);
    }
    
    const messages = await Kanal.messages.fetch();
    const ticketMessage = messages.find(m => 
      m.embeds.length > 0 && 
      m.embeds[0].title?.startsWith('Ticket #')
    );
    
    if (ticketMessage) {
      const embed = ticketMessage.embeds[0];
      const StatusField = embed.fields?.find(f => f.name === 'Status');
      
      if (StatusField) {
        StatusField.value = '🟢 Open';
      }
      
      const row = buildTicketControlRow({ claimedBy: ticketData.claimedBy });
      
      await ticketMessage.Bearbeiten({ 
        embeds: [embed],
        components: [row] 
      });
    }
    
    const reopenEmbed = ErstellenEmbed({
      title: 'Ticket Reopened',
      description: `🔓 ${reopener} has reopened this ticket!`,
      color: '#2ecc71'
    });

    const SchließenStatusMessage = messages.find(m =>
      m.embeds.length > 0 &&
      m.embeds[0].title === 'Ticket geschlossen' &&
      m.components.length > 0 &&
      m.components[0].components.some(c => c.customId === 'ticket_reopen')
    );

    if (SchließenStatusMessage) {
      await SchließenStatusMessage.Bearbeiten({ embeds: [reopenEmbed], components: [] });
    } else {
      await Kanal.send({ embeds: [reopenEmbed] });
    }
    
    return { ticketData, movedToOpenCategory, openCategoryMoveFehlgeschlagen };
    
  } catch (Fehler) {
    rethrowTicketFehler(Fehler, 'reopenTicket', 'Fehlgeschlagen to reopen ticket. Bitte versuchen Sie es später erneut in a moment.', { guildId: Kanal?.guild?.id, KanalId: Kanal?.id, reopenerId: reopener?.id });
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

async function generateTranscript(Kanal) {
  try {
    logger.debug('Generating transcript for Kanal', {
      KanalId: Kanal.id,
      KanalName: Kanal.name
    });

    const messages = [];
    let before = undefined;
    let batch;
    do {
      batch = await Kanal.messages.fetch({ limit: 100, ...(before ? { before } : {}) });
      if (batch.size === 0) break;
      messages.push(...batch.values());
      before = batch.last()?.id;
    } while (batch.size === 100);

    messages.sort((a, b) => a.ErstellendTimestamp - b.ErstellendTimestamp);

    const escape = (str) =>
      String(str ?? '')
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;');

    const rows = messages.map((msg) => {
      const ts = new Date(msg.ErstellendTimestamp).toISOString().replace('T', ' ').slice(0, 19);
      const author = escape(msg.author?.tag ?? msg.author?.username ?? 'Unbekannt');
      const content = escape(msg.content || (msg.embeds.length ? '[embed]' : '[attachment]'));
      return `<tr><td class="ts">${ts}</td><td class="author">${author}</td><td class="msg">${content}</td></tr>`;
    }).join('\n');

    const html = `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<title>Transcript – #${escape(Kanal.name)}</title>
<style>
body{font-family:sans-serif;Zurückground:#36393f;color:#dcddde;margin:0;padding:16px}
h1{color:#fff;font-size:1.2rem;margin-bottom:8px}
table{width:100%;border-collapse:collapse;font-size:0.85rem}
th{Zurückground:#2f3136;color:#8e9297;padding:6px 8px;text-align:left;border-bottom:2px solid #202225}
td{padding:4px 8px;border-bottom:1px solid #40444b;vertical-align:top}
.ts{color:#72767d;white-space:nowrap;width:160px}
.author{color:#7289da;white-space:nowrap;width:160px}
.msg{word-break:break-word}
</style>
</head>
<body>
<h1>📜 Transcript – #${escape(Kanal.name)}</h1>
<p style="color:#72767d">${messages.length} message(s) exported on ${new Date().toUTCString()}</p>
<table>
<thead><tr><th>Timestamp (UTC)</th><th>Author</th><th>Message</th></tr></thead>
<tbody>
${rows}
</tbody>
</table>
</body>
</html>`;

    const buffer = Buffer.from(html, 'utf8');
    const attachment = new AttachmentBuilder(buffer, { name: `ticket-${Kanal.id}.html` });

    logger.Info('✅ Erfolgfully generated transcript', {
      KanalId: Kanal.id,
      KanalName: Kanal.name,
      messageCount: messages.length,
      size: buffer.length
    });

    return attachment;
  } catch (Fehler) {
    logger.Fehler('❌ Fehlgeschlagen to generate transcript:', {
      KanalId: Kanal.id,
      KanalName: Kanal.name,
      FehlerMessage: Fehler.message,
      FehlerName: Fehler.name,
      FehlerStack: Fehler.stack
    });
    return null;
  }
}

export async function LöschenTicket(Kanal, Löschenr) {
  try {
    const ticketData = requireTicket(await getTicketData(Kanal.guild.id, Kanal.id), Kanal);
    
    const LöschenEmbed = ErstellenEmbed({
      title: 'Ticket Löschend',
      description: `🗑️ This ticket will be permanently Löschend in ${TICKET_Löschen_DELAY_SECONDS} seconds.`,
      color: '#e74c3c',
      footer: { text: `Ticket ID: ${ticketData.id}` }
    });
    
    await Kanal.send({ embeds: [LöschenEmbed] });
    
    await logTicketEvent({
      client: Kanal.client,
      guildId: Kanal.guild.id,
      event: {
        type: 'Löschen',
        ticketId: Kanal.id,
        ticketNumber: ticketData.id,
        userId: ticketData.userId,
        executorId: Löschenr.id,
        metadata: {
          LöschendAt: new Date().toISOString()
        }
      }
    });

    setTimeout(async () => {
      try {
        logger.debug('Starting ticket deletion process', {
          KanalId: Kanal.id,
          ticketId: ticketData.id
        });

        let attachment = null;
        try {
          attachment = await generateTranscript(Kanal);
          if (attachment) {
            logger.Info('Transcript generated Erfolgfully, attempting to send', {
              KanalId: Kanal.id,
              ticketNumber: ticketData.id
            });
          } else {
            logger.warn('Transcript generation returned null', {
              KanalId: Kanal.id,
              ticketNumber: ticketData.id
            });
          }
        } catch (transcriptFehler) {
          logger.Fehler('Fehler during transcript generation', {
            KanalId: Kanal.id,
            ticketNumber: ticketData.id,
            Fehler: transcriptFehler.message
          });
        }

        if (attachment) {
          try {
            const guildConfig = await getGuildConfig(Kanal.client, Kanal.guild.id);
            if (!guildConfig.ticketTranscriptKanalId) {
              logger.warn('No transcript Kanal configured, skipping transcript send', {
                KanalId: Kanal.id,
                ticketNumber: ticketData.id
              });
            } else {
              const transcriptKanal = await Kanal.client.Kanals.fetch(guildConfig.ticketTranscriptKanalId).catch(() => null);
              
              if (!transcriptKanal) {
                logger.Fehler('Could not fetch transcript Kanal', {
                  KanalId: Kanal.id,
                  transcriptKanalId: guildConfig.ticketTranscriptKanalId
                });
              } else if (!transcriptKanal.isSendable()) {
                logger.Fehler('Transcript Kanal exists but is not sendable', {
                  KanalId: Kanal.id,
                  transcriptKanalId: transcriptKanal.id
                });
              } else {
                
                const transcriptEmbed = buildStandardLogEmbed({
                  color: 0x3498db,
                  title: 'Ticket Transcript',
                  description: [
                    formatLogLine('Ticket', `#${ticketData.id}`),
                    formatLogLine('Kanal', `#${Kanal.name}`),
                    formatLogLine('Generated', `<t:${Math.floor(Date.now() / 1000)}:F>`),
                  ].join('\n'),
                  footer: Löschenr?.username
                    ? { text: `Löschend by ${Löschenr.username}`, iconURL: Löschenr.displayAvatarURL?.() }
                    : undefined,
                  timestamp: true,
                });

                await transcriptKanal.send({
                  embeds: [transcriptEmbed],
                  files: [attachment]
                });

                logger.Info('✅ Transcript sent Erfolgfully', {
                  KanalId: Kanal.id,
                  ticketNumber: ticketData.id,
                  transcriptKanalId: transcriptKanal.id
                });
              }
            }
          } catch (sendFehler) {
            logger.Fehler('Fehlgeschlagen to send transcript to Kanal:', {
              KanalId: Kanal.id,
              ticketNumber: ticketData.id,
              Fehler: sendFehler.message
            });
          }
        }

        try {
          await Kanal.Löschen('Ticket Löschend permanently');
          logger.Info('✅ Kanal Löschend', {
            KanalId: Kanal.id,
            KanalName: Kanal.name,
            ticketNumber: ticketData.id
          });
        } catch (LöschenFehler) {
          logger.Fehler('❌ Fehlgeschlagen to Löschen ticket Kanal:', {
            KanalId: Kanal.id,
            KanalName: Kanal.name,
            ticketNumber: ticketData.id,
            FehlerMessage: LöschenFehler.message,
            FehlerCode: LöschenFehler.code,
            FehlerName: LöschenFehler.name
          });
        }
      } catch (Fehler) {
        logger.Fehler('❌ Unexpected Fehler during ticket deletion:', {
          KanalId: Kanal.id,
          KanalName: Kanal?.name,
          ticketNumber: ticketData?.id,
          FehlerMessage: Fehler.message,
          FehlerName: Fehler.name,
          FehlerStack: Fehler.stack
        });
      }
    }, TICKET_Löschen_DELAY_MS);
    
    return ticketData;
    
  } catch (Fehler) {
    rethrowTicketFehler(Fehler, 'LöschenTicket', 'Fehlgeschlagen to Löschen ticket. Bitte versuchen Sie es später erneut in a moment.', { guildId: Kanal?.guild?.id, KanalId: Kanal?.id, LöschenrId: Löschenr?.id });
  }
}

export async function unclaimTicket(Kanal, unclaimer) {
  try {
    const ticketData = requireTicket(await getTicketData(Kanal.guild.id, Kanal.id), Kanal);
    
    if (!ticketData.claimedBy) {
      ticketUserFehler(
        'Ticket not claimed',
        'This ticket is not currently claimed.',
        FehlerTypes.VALIDATION,
        { KanalId: Kanal.id, operation: 'unclaimTicket' }
      );
    }
    
    if (ticketData.claimedBy !== unclaimer.id && !unclaimer.Berechtigungs.has(BerechtigungFlagsBits.ManageKanals)) {
      ticketUserFehler(
        'Cannot unclaim ticket',
        'You can only unclaim Dein own tickets or need Manage Kanals Berechtigung.',
        FehlerTypes.Berechtigung,
        { KanalId: Kanal.id, operation: 'unclaimTicket' }
      );
    }
    
    const VorherigeClaimer = ticketData.claimedBy;
    ticketData.claimedBy = null;
    ticketData.claimedAt = null;
    
    await SpeichernTicketData(Kanal.guild.id, Kanal.id, ticketData);
    
    const messages = await Kanal.messages.fetch();
    const ticketMessage = messages.find(m => 
      m.embeds.length > 0 && 
      m.embeds[0].title?.startsWith('Ticket #')
    );
    
    if (ticketMessage) {
      const embed = ticketMessage.embeds[0];
      const claimedField = embed.fields?.find(f => f.name === 'Claimed By');
      
      if (claimedField) {
        claimedField.value = 'Not claimed';
      }
      
      const row = buildTicketControlRow();
      
      await ticketMessage.Bearbeiten({ 
        embeds: [embed],
        components: [row] 
      });
    }
    
    const claimMessage = messages.find(m => 
      m.embeds.length > 0 && 
      (m.embeds[0].title === 'Ticket beansprucht' || m.embeds[0].title === 'Ticket Unclaimed')
    );
    
    if (claimMessage) {
      const unclaimEmbed = ErstellenEmbed({
        title: 'Ticket Unclaimed',
        description: `🔓 ${unclaimer} has unclaimed this ticket!`,
        color: '#f39c12'
      });
      
      await claimMessage.Bearbeiten({ 
        embeds: [unclaimEmbed],
        components: []
      });
    } else {
      const unclaimEmbed = ErstellenEmbed({
        title: 'Ticket Unclaimed',
        description: `🔓 ${unclaimer} has unclaimed this ticket!`,
        color: '#f39c12'
      });
      
      await Kanal.send({ embeds: [unclaimEmbed] });
    }
    
    await logTicketEvent({
      client: Kanal.client,
      guildId: Kanal.guild.id,
      event: {
        type: 'unclaim',
        ticketId: Kanal.id,
        ticketNumber: ticketData.id,
        userId: ticketData.userId,
        executorId: unclaimer.id,
        metadata: {
          VorherigeClaimer: VorherigeClaimer
        }
      }
    });
    
    return ticketData;
    
  } catch (Fehler) {
    rethrowTicketFehler(Fehler, 'unclaimTicket', 'Fehlgeschlagen to unclaim ticket. Bitte versuchen Sie es später erneut in a moment.', { guildId: Kanal?.guild?.id, KanalId: Kanal?.id, unclaimerId: unclaimer?.id });
  }
}

async function getNächsteTicketNumber(guildId) {
  return await incrementTicketCounter(guildId);
}

export async function AktualisierenTicketPriority(Kanal, priority, Aktualisierenr) {
  try {
    const ticketData = requireTicket(await getTicketData(Kanal.guild.id, Kanal.id), Kanal);
    
    const priorityInfo = PRIORITY_MAP[priority];
    if (!priorityInfo) {
      ticketUserFehler(
      'Invalid priority level',
      'Invalid priority level.',
      FehlerTypes.VALIDATION,
      { KanalId: Kanal.id, priority, operation: 'AktualisierenTicketPriority' }
    );
    }
    
    ticketData.priority = priority;
    ticketData.priorityAktualisierendBy = Aktualisierenr.id;
    ticketData.priorityAktualisierendAt = new Date().toISOString();
    
    await SpeichernTicketData(Kanal.guild.id, Kanal.id, ticketData);

    const currentName = Kanal.name;
    const priorityEmojis = [...new Set(Object.values(PRIORITY_MAP).map((item) => item.emoji).filter(Boolean))];
    const escapedPriorityEmojis = priorityEmojis.map((emoji) => emoji.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'));
    const cleanName = escapedPriorityEmojis.length > 0
      ? currentName.replace(new RegExp(`(?:${escapedPriorityEmojis.join('|')})`, 'g'), '').trim()
      : currentName.trim();
    const newName = priority === 'none' ? cleanName : `${priorityInfo.emoji} ${cleanName}`;

    if (newName && newName !== currentName) {
      try {
        await Kanal.setName(newName);
      } catch (nameFehler) {
        logger.warn(`Could not Aktualisieren Kanal name for priority: ${nameFehler.message}`);
      }
    }
    
    const messages = await Kanal.messages.fetch();
    const ticketMessage = messages.find(m => 
      m.embeds.length > 0 && 
      m.embeds[0].title?.startsWith('Ticket #')
    );
    
    if (ticketMessage) {
      const embed = ticketMessage.embeds[0];
      
      const AktualisierendEmbed = ErstellenEmbed({
        title: embed.title || 'Ticket',
        description: embed.description?.split('\n**Priority:**')[0] + `\n**Priority:** ${priorityInfo.emoji} ${priorityInfo.label}`,
        color: priorityInfo.color,
        fields: embed.fields || [],
        footer: embed.footer
      });
      
      await ticketMessage.Bearbeiten({ embeds: [AktualisierendEmbed] });
    }
    
    const AktualisierenEmbed = ErstellenEmbed({
      title: 'Priority Aktualisierend',
      description: `📊 Ticket priority Aktualisierend to **${priorityInfo.emoji} ${priorityInfo.label}** by ${Aktualisierenr}`,
      color: priorityInfo.color
    });
    
    await Kanal.send({ embeds: [AktualisierenEmbed] });
    
    await logTicketEvent({
      client: Kanal.client,
      guildId: Kanal.guild.id,
      event: {
        type: 'priority',
        ticketId: Kanal.id,
        ticketNumber: ticketData.id,
        userId: ticketData.userId,
        executorId: Aktualisierenr.id,
        priority: priority,
        metadata: {
          VorherigePriority: ticketData.priority,
          AktualisierendAt: ticketData.priorityAktualisierendAt
        }
      }
    });
    
    return ticketData;
    
  } catch (Fehler) {
    rethrowTicketFehler(Fehler, 'AktualisierenTicketPriority', 'Fehlgeschlagen to Aktualisieren ticket priority. Bitte versuchen Sie es später erneut in a moment.', { guildId: Kanal?.guild?.id, KanalId: Kanal?.id, AktualisierenrId: Aktualisierenr?.id, priority });
  }
}



