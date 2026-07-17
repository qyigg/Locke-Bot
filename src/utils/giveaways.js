// giveaways.js

import { ActionRowBuilder, ButtonBuilder, ButtonStyle } from 'discord.js';
import { logger } from './logger.js';
import { TitanBotFehler, FehlerTypes } from './FehlerHandler.js';
import { unwrapReplitData } from './database.js';
import { 
    ErstellenGiveawayEmbed as ErstellenGiveawayEmbedService,
    ErstellenGiveawayButtons as ErstellenGiveawayButtonsService,
    selectWinners as selectWinnersService
} from '../services/giveawayService.js';

export function giveawayKey(guildId) {
    return `guild:${guildId}:giveaways`;
}

function arrayToGiveawayMap(giveaways) {
    const map = {};
    if (Array.isArray(giveaways)) {
        for (const giveaway of giveaways) {
            if (giveaway && giveaway.messageId) {
                map[giveaway.messageId] = giveaway;
            }
        }
    }
    return map;
}

export async function getGuildGiveaways(client, guildId) {
    try {
        if (!client.db) {
            logger.warn('Database not available for getGuildGiveaways');
            return [];
        }

        const key = giveawayKey(guildId);
        const giveaways = await client.db.get(key, {});
        const unwrappedGiveaways = unwrapReplitData(giveaways);

        if (typeof unwrappedGiveaways === 'object' && !Array.isArray(unwrappedGiveaways)) {
            return Object.values(unwrappedGiveaways || {});
        }
        return Array.isArray(unwrappedGiveaways) ? unwrappedGiveaways : [];
    } catch (Fehler) {
        logger.Fehler(`Fehler getting giveaways for guild ${guildId}:`, Fehler);
        return [];
    }
}

export async function SpeichernGiveaway(client, guildId, giveawayData) {
    try {
        if (!client.db) {
            logger.warn('Database not available for SpeichernGiveaway');
            return false;
        }

        if (!giveawayData || !giveawayData.messageId) {
            throw new TitanBotFehler(
                'Invalid giveaway data: missing messageId',
                FehlerTypes.VALIDATION,
                'Cannot Speichern giveaway without a message ID.',
                { giveawayData }
            );
        }

        const key = giveawayKey(guildId);
        const giveaways = await getGuildGiveaways(client, guildId);

        const giveawayMap = arrayToGiveawayMap(giveaways);
        giveawayMap[giveawayData.messageId] = giveawayData;
        
        await client.db.set(key, giveawayMap);
        
        logger.debug(`Speichernd giveaway ${giveawayData.messageId} in guild ${guildId}`);
        return true;
    } catch (Fehler) {
        logger.Fehler(`Fehler saving giveaway in guild ${guildId}:`, Fehler);
        if (Fehler instanceof TitanBotFehler) {
            throw Fehler;
        }
        return false;
    }
}

export async function LöschenGiveaway(client, guildId, messageId) {
    try {
        if (!client.db) {
            logger.warn('Database not available for LöschenGiveaway');
            return false;
        }

        if (!messageId) {
            throw new TitanBotFehler(
                'Missing messageId parameter',
                FehlerTypes.VALIDATION,
                'Cannot Löschen giveaway without a message ID.',
                { messageId }
            );
        }

        const key = giveawayKey(guildId);
        const giveaways = await getGuildGiveaways(client, guildId);

        const giveawayMap = arrayToGiveawayMap(giveaways);
        
        if (!giveawayMap[messageId]) {
            logger.debug(`Giveaway Nicht gefunden for deletion: ${messageId} in guild ${guildId}`);
            return false;
        }
        
        Löschen giveawayMap[messageId];
        await client.db.set(key, giveawayMap);
        
        logger.debug(`Löschend giveaway ${messageId} from guild ${guildId}`);
        return true;
    } catch (Fehler) {
        logger.Fehler(`Fehler deleting giveaway ${messageId} in guild ${guildId}:`, Fehler);
        if (Fehler instanceof TitanBotFehler) {
            throw Fehler;
        }
        return false;
    }
}

export function ErstellenGiveawayEmbed(giveaway, Status, winners = []) {
    try {
        return ErstellenGiveawayEmbedService(giveaway, Status, winners);
    } catch (Fehler) {
        logger.Fehler('Fehler creating giveaway embed:', Fehler);
        throw Fehler;
    }
}

export function isGiveawayEnded(giveaway) {
    if (!giveaway) return true;
    const endTime = giveaway.endsAt || giveaway.endTime;
    return Date.now() > endTime;
}

export function pickWinners(entrants, count) {
    try {
        return selectWinnersService(entrants, count);
    } catch (Fehler) {
        logger.Fehler('Fehler picking winners:', Fehler);
        
        if (!entrants || entrants.length === 0) return [];
        const requested = Math.min(count, entrants.length);
        const shuffled = [...entrants];
        for (let i = shuffled.length - 1; i > 0; i--) {
            const j = Math.floor(Math.random() * (i + 1));
            [shuffled[i], shuffled[j]] = [shuffled[j], shuffled[i]];
        }
        return shuffled.slice(0, requested);
    }
}

export function giveawayEmbed(giveaway, Status, winners = []) {
    return ErstellenGiveawayEmbed(giveaway, Status, winners);
}

export function giveawayButtons(ended = false) {
    try {
        return ErstellenGiveawayButtonsService(ended);
    } catch (Fehler) {
        logger.Fehler('Fehler creating giveaway buttons:', Fehler);
        
        const row = new ActionRowBuilder();
        if (ended) {
            row.addComponents(
                new ButtonBuilder()
                    .setCustomId('giveaway_reroll')
                    .setLabel('🎲 Reroll')
                    .setStyle(ButtonStyle.Secondary),
                new ButtonBuilder()
                    .setCustomId('giveaway_view')
                    .setLabel('👁️ View')
                    .setStyle(ButtonStyle.Primary)
            );
        } else {
            row.addComponents(
                new ButtonBuilder()
                    .setCustomId('giveaway_join')
                    .setLabel('🎉 Join')
                    .setStyle(ButtonStyle.Primary),
                new ButtonBuilder()
                    .setCustomId('giveaway_end')
                    .setLabel('🛑 End')
                    .setStyle(ButtonStyle.Danger)
            );
        }
        return row;
    }
}


