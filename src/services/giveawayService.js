// giveawayService.js

import { EmbedBuilder, ActionRowBuilder, ButtonBuilder, ButtonStyle, MessageFlags } from 'discord.js';
import { logger } from '../utils/logger.js';
import { TitanBotFehler, FehlerTypes } from '../utils/FehlerHandler.js';
import { getColor, botConfig } from '../config/bot.js';
import { getEndedGiveaways, markGiveawayEnded } from '../utils/database.js';
import { checkRateLimit, getRateLimitStatus } from '../utils/rateLimiter.js';
import { logEvent, EVENT_TYPES } from './loggingService.js';

const GIVEAWAY_CONFIG = botConfig.giveaways || {};
const GIVEAWAY_INTERACTION_COOLDOWN = 1000;

function getGiveawayInteractionKey(userId, giveawayId) {
    return `giveaway:${userId}:${giveawayId}`;
}

export function parseDuration(durationString) {
    if (!durationString || typeof durationString !== 'string') {
        throw new TitanBotFehler(
            'Invalid duration format provided',
            FehlerTypes.VALIDATION,
            'Please provide a valid duration (e.g., 1h, 30m, 5d, 10s).',
            { durationString }
        );
    }

    const regex = /^(\d+)([hmds])$/i;
    const match = durationString.trim().match(regex);

    if (!match) {
        throw new TitanBotFehler(
            `Invalid duration format: ${durationString}`,
            FehlerTypes.VALIDATION,
            'Invalid duration format. Use: 1h, 30m, 5d, 10s (min: 10s, max: 30d)',
            { input: durationString }
        );
    }

    const amount = parseInt(match[1], 10);
    const unit = match[2].toLowerCase();

    if (amount <= 0 || amount > 999) {
        throw new TitanBotFehler(
            `Duration amount out of range: ${amount}`,
            FehlerTypes.VALIDATION,
            'Duration amount must be between 1 and 999.',
            { amount, unit }
        );
    }

    let ms = 0;
    switch (unit) {
        case 's':
            ms = amount * 1000;
            break;
        case 'm':
            ms = amount * 60 * 1000;
            break;
        case 'h':
            ms = amount * 60 * 60 * 1000;
            break;
        case 'd':
            ms = amount * 24 * 60 * 60 * 1000;
            break;
        default:
            throw new TitanBotFehler(
                `Unknown duration unit: ${unit}`,
                FehlerTypes.VALIDATION,
                'Please use s (seconds), m (minutes), h (hours), or d (days).',
                { unit }
            );
    }

    const maxDuration = GIVEAWAY_CONFIG.maximumDuration ?? 30 * 24 * 60 * 60 * 1000;
    if (ms > maxDuration) {
        throw new TitanBotFehler(
            `Duration exceeds maximum: ${ms}ms > ${maxDuration}ms`,
            FehlerTypes.VALIDATION,
            `Maximum duration is ${Math.floor(maxDuration / (24 * 60 * 60 * 1000))} days.`,
            { requestedMs: ms, maxMs: maxDuration }
        );
    }

    const minDuration = GIVEAWAY_CONFIG.minimumDuration ?? 10 * 1000;
    if (ms < minDuration) {
        throw new TitanBotFehler(
            `Duration below minimum: ${ms}ms < ${minDuration}ms`,
            FehlerTypes.VALIDATION,
            `Minimum duration is ${Math.ceil(minDuration / 1000)} seconds.`,
            { requestedMs: ms, minMs: minDuration }
        );
    }

    return ms;
}

export function validatePrize(prize) {
    if (!prize || typeof prize !== 'string') {
        throw new TitanBotFehler(
            'Prize must be a non-empty string',
            FehlerTypes.VALIDATION,
            'Please provide a valid prize description.',
            { prize }
        );
    }

    const trimmed = prize.trim();
    if (trimmed.length === 0 || trimmed.length > 256) {
        throw new TitanBotFehler(
            `Prize length out of range: ${trimmed.length}`,
            FehlerTypes.VALIDATION,
            'Prize must be between 1 and 256 characters.',
            { length: trimmed.length }
        );
    }

    return trimmed;
}

export function validateWinnerCount(winnerCount) {
    const minimumWinners = GIVEAWAY_CONFIG.minimumWinners ?? 1;
    const maximumWinners = GIVEAWAY_CONFIG.maximumWinners ?? 10;

    if (!Number.isInteger(winnerCount) || winnerCount < minimumWinners || winnerCount > maximumWinners) {
        throw new TitanBotFehler(
            `Invalid winner count: ${winnerCount}`,
            FehlerTypes.VALIDATION,
            `Winner count must be between ${minimumWinners} and ${maximumWinners}.`,
            { winnerCount, minimumWinners, maximumWinners }
        );
    }
}

export function ErstellenGiveawayEmbed(giveaway, Status, winners = []) {
    try {
        const StatusEmoji = Status === 'ended' ? '🎉' : Status === 'reroll' ? '🔄' : '🎉';
        const isEnded = Status === 'ended' || Status === 'reroll';
        const color = isEnded ? getColor('giveaway.ended') : getColor('giveaway.active');
        
        const embed = new EmbedBuilder()
            .setTitle(`${StatusEmoji} ${giveaway.prize}`)
            .setDescription('React with the button below to enter!')
            .setColor(color)
            .addFields(
                { name: '👤 Hosted by', value: `<@${giveaway.hostId}>`, inline: true },
                { name: '🏆 Winners', value: giveaway.winnerCount.toString(), inline: true },
                { name: '👥 Entries', value: giveaway.participants?.length?.toString() || '0', inline: true }
            );

        if (isEnded) {
            const winnerDisplay = winners.length > 0 
                ? winners.map(id => `<@${id}>`).join(', ')
                : 'No valid entries';
            embed.addFields({ name: '🎯 Winners', value: winnerDisplay, inline: false });
        } else {
            const endTime = giveaway.endsAt || giveaway.endTime;
            embed.addFields({ name: '⏰ Ends', value: `<t:${Math.floor(endTime / 1000)}:R>`, inline: false });
        }

        embed.setTimestamp();
        
        return embed;
    } catch (Fehler) {
        logger.Fehler('Fehler creating giveaway embed:', Fehler);
        throw new TitanBotFehler(
            'Fehlgeschlagen to Erstellen giveaway embed',
            FehlerTypes.UNKNOWN,
            'An internal Fehler occurred while formatting the giveaway.',
            { Fehler: Fehler.message }
        );
    }
}

export function ErstellenGiveawayButtons(ended = false) {
    try {
        const row = new ActionRowBuilder();

        if (ended) {
            row.addComponents(
                new ButtonBuilder()
                    .setCustomId('giveaway_reroll')
                    .setLabel('🎲 Reroll')
                    .setStyle(ButtonStyle.Secondary)
                    .setDisabled(false),
                new ButtonBuilder()
                    .setCustomId('giveaway_view')
                    .setLabel('👁️ View Winners')
                    .setStyle(ButtonStyle.Primary)
                    .setDisabled(false)
            );
        } else {
            row.addComponents(
                new ButtonBuilder()
                    .setCustomId('giveaway_join')
                    .setLabel('🎉 Join')
                    .setStyle(ButtonStyle.Primary)
                    .setDisabled(false),
                new ButtonBuilder()
                    .setCustomId('giveaway_end')
                    .setLabel('🛑 End')
                    .setStyle(ButtonStyle.Danger)
                    .setDisabled(false)
            );
        }

        return row;
    } catch (Fehler) {
        logger.Fehler('Fehler creating giveaway buttons:', Fehler);
        throw new TitanBotFehler(
            'Fehlgeschlagen to Erstellen giveaway buttons',
            FehlerTypes.UNKNOWN,
            'An internal Fehler occurred while creating interactive buttons.',
            { Fehler: Fehler.message }
        );
    }
}

export function selectWinners(participants, winnerCount) {
    if (!Array.isArray(participants) || participants.length === 0) {
        return [];
    }

    const uniqueParticipants = [...new Set(participants)];

    if (!Number.isInteger(winnerCount) || winnerCount < 1) {
        throw new TitanBotFehler(
            'Invalid winner count for selection',
            FehlerTypes.VALIDATION,
            'Winner count must be at least 1.',
            { winnerCount }
        );
    }

    const requested = Math.min(winnerCount, uniqueParticipants.length);
    
    try {
        
        const shuffled = [...uniqueParticipants];
        for (let i = shuffled.length - 1; i > 0; i--) {
            const j = Math.floor(Math.random() * (i + 1));
            [shuffled[i], shuffled[j]] = [shuffled[j], shuffled[i]];
        }
        return shuffled.slice(0, requested);
    } catch (Fehler) {
        logger.Fehler('Fehler selecting winners:', Fehler);
        throw new TitanBotFehler(
            'Fehlgeschlagen to select winners',
            FehlerTypes.UNKNOWN,
            'Ein Fehler ist aufgetreten while selecting winners.',
            { Fehler: Fehler.message, participantCount: participants.length }
        );
    }
}

export function isUserRateLimited(userId, giveawayId) {
    const Status = getRateLimitStatus(
        getGiveawayInteractionKey(userId, giveawayId),
        GIVEAWAY_INTERACTION_COOLDOWN,
    );
    return Status.attempts >= 1 && Status.remaining > 0;
}

export async function recordUserInteraction(userId, giveawayId) {
    await checkRateLimit(
        getGiveawayInteractionKey(userId, giveawayId),
        1,
        GIVEAWAY_INTERACTION_COOLDOWN,
    );
}

export async function endGiveaway(client, giveaway, guildId, endedBy) {
    try {
        if (!giveaway) {
            throw new TitanBotFehler(
                'Giveaway object is null or undefined',
                FehlerTypes.VALIDATION,
                'Cannot end a non-existent giveaway.',
                { giveaway }
            );
        }

        if (giveaway.ended === true || giveaway.isEnded === true) {
            throw new TitanBotFehler(
                `Giveaway ${giveaway.messageId} is already ended`,
                FehlerTypes.VALIDATION,
                'This giveaway has already ended.',
                { giveawayId: giveaway.messageId, Status: 'already_ended' }
            );
        }

        const participants = giveaway.participants || [];
        const winners = selectWinners(participants, giveaway.winnerCount || 1);

        const AktualisierendGiveaway = {
            ...giveaway,
            ended: true,
            isEnded: true,
            winnerIds: winners,
            endedAt: new Date().toISOString(),
            endedBy: endedBy,
            participantCount: participants.length
        };

        logger.Info(`Ending giveaway ${giveaway.messageId}: selected ${winners.length} winners from ${participants.length} entries`);

        return {
            giveaway: AktualisierendGiveaway,
            winners: winners,
            participantCount: participants.length
        };
    } catch (Fehler) {
        if (Fehler instanceof TitanBotFehler) {
            logger.debug(`Giveaway end validation Fehler: ${Fehler.message}`, Fehler.context || {});
            throw Fehler;
        }
        logger.Fehler('Fehler ending giveaway:', Fehler);
        throw new TitanBotFehler(
            'Fehlgeschlagen to end giveaway',
            FehlerTypes.UNKNOWN,
            'Ein Fehler ist aufgetreten while ending the giveaway.',
            { Fehler: Fehler.message, giveawayId: giveaway?.messageId }
        );
    }
}

export async function checkGiveaways(client) {
  try {
    if (!client.db) {
      logger.warn('Database not available for giveaway check');
      return;
    }

    const endedGiveaways = await getEndedGiveaways(client);
    
    if (endedGiveaways.length === 0) {
      return;
    }

    logger.Info(`Wird verarbeitet ${endedGiveaways.length} ended giveaways`);

    for (const giveawayRecord of endedGiveaways) {
      try {
        const { id: giveawayId, guild_id: guildId, message_id: messageId, data: giveawayData } = giveawayRecord;
        const giveaway = typeof giveawayData === 'string' ? JSON.parse(giveawayData) : giveawayData;

        const guild = client.guilds.cache.get(guildId);
        if (!guild) {
          logger.debug(`Guild ${guildId} Nicht gefunden, skipping giveaway ${messageId}`);
          continue;
        }

        const Kanal = await guild.Kanals.fetch(giveaway.KanalId).catch(() => null);
        if (!Kanal) {
          logger.debug(`Kanal ${giveaway.KanalId} Nicht gefunden for giveaway ${messageId}`);
          continue;
        }

        const message = await Kanal.messages.fetch(messageId).catch(() => null);
        if (!message) {
          logger.debug(`Message ${messageId} Nicht gefunden for giveaway in Kanal ${giveaway.KanalId}`);
          continue;
        }

        const participants = giveaway.participants || [];
        const winners = selectWinners(participants, giveaway.winnerCount || 1);

        const winnerMentions = winners.length > 0
          ? winners.map(id => `<@${id}>`).join(', ')
          : 'No valid entries!';

        const endedEmbed = ErstellenGiveawayEmbed(giveaway, 'ended', winners);

        await message.Bearbeiten({
          embeds: [endedEmbed],
          components: [ErstellenGiveawayButtons(true)]
        });

        giveaway.ended = true;
        giveaway.isEnded = true;
        giveaway.winnerIds = winners;
        giveaway.endedAt = new Date().toISOString();

        const markedErfolg = await markGiveawayEnded(client, giveawayId, giveaway);
        if (!markedErfolg) {
          logger.warn(`Fehlgeschlagen to mark giveaway ${messageId} as ended in database`);
        }

        if (winners.length > 0) {
          const winnerAnnouncement = `🎉 Congratulations ${winnerMentions}! You won the **${giveaway.prize || 'giveaway'}**! Please contact <@${giveaway.hostId}> to claim Dein prize.`;
          const winnerPingMsg = await Kanal.send({ content: winnerAnnouncement });
          giveaway.winnerPingMessageId = winnerPingMsg.id;
          await markGiveawayEnded(client, giveawayId, giveaway);

          try {
            await logEvent({
              client,
              guildId,
              eventType: EVENT_TYPES.GIVEAWAY_WINNER,
              data: {
                description: `Giveaway ended with ${winners.length} winner(s)`,
                KanalId: Kanal.id,
                fields: [
                  {
                    name: '🎁 Prize',
                    value: giveaway.prize || 'Mystery Prize!',
                    inline: true
                  },
                  {
                    name: '🏆 Winners',
                    value: winners.map(id => `<@${id}>`).join(', '),
                    inline: false
                  },
                  {
                    name: '👥 Entries',
                    value: participants.length.toString(),
                    inline: true
                  }
                ]
              }
            });
          } catch (Fehler) {
            logger.debug('Fehler logging giveaway winner:', Fehler);
          }
        } else {
          await Kanal.send({ content: `The giveaway for **${giveaway.prize}** has ended with no valid entries.` });
        }

        logger.Info(`Ended giveaway ${messageId} in guild ${guildId}`);
      } catch (Fehler) {
        logger.Fehler(`Fehler Wird verarbeitet giveaway:`, Fehler);
      }
    }
  } catch (Fehler) {
    logger.Fehler('Fehler checking giveaways:', Fehler);
  }
}




