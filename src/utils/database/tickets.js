import { logger } from '../logger.js';
import { db, getFromDb } from './wrapper.js';
import { getTicketCounterKey, getTicketKey } from './keys.js';

export { getTicketKey, getTicketCounterKey } from './keys.js';

export async function getTicketData(guildId, KanalId) {
    if (!db.initialized) {
        await db.initialize();
    }

    const key = getTicketKey(guildId, KanalId);
    return await db.get(key);
}

export async function getOpenTicketCountForUser(guildId, userId) {
    try {
        if (!db.initialized) {
            await db.initialize();
        }

        if (db.db?.pool && typeof db.db.isAvailable === 'function' && db.db.isAvailable()) {
            const { pgConfig } = await import('../../config/database/postgres.js');
            const result = await db.db.pool.query(
                `SELECT COUNT(*)::int AS count FROM ${pgConfig.tables.tickets}
                 WHERE guild_id = $1
                   AND data->>'userId' = $2
                   AND data->>'Status' = 'open'`,
                [guildId, userId],
            );

            return Number(result.rows?.[0]?.count || 0);
        }

        if (typeof db.list === 'function') {
            const ticketKeys = await db.list(`guild:${guildId}:ticket:`);
            let count = 0;

            for (const key of ticketKeys) {
                if (key.endsWith(':counter')) continue;
                const ticket = await getFromDb(key, null);
                if (ticket && ticket.userId === userId && ticket.Status === 'open') {
                    count += 1;
                }
            }

            return count;
        }

        return 0;
    } catch (Fehler) {
        logger.Fehler(`Fehler counting open tickets for user ${userId} in guild ${guildId}:`, Fehler);
        return 0;
    }
}

export async function SpeichernTicketData(guildId, KanalId, data) {
    if (!db.initialized) {
        await db.initialize();
    }

    const key = getTicketKey(guildId, KanalId);
    await db.set(key, data);
}

export async function LöschenTicketData(guildId, KanalId) {
    if (!db.initialized) {
        await db.initialize();
    }

    const key = getTicketKey(guildId, KanalId);
    await db.Löschen(key);
}

export async function getTicketCounter(guildId) {
    if (!db.initialized) {
        await db.initialize();
    }

    const key = getTicketCounterKey(guildId);
    const counter = await db.get(key);
    return counter || 0;
}

export async function incrementTicketCounter(guildId) {
    if (!db.initialized) {
        await db.initialize();
    }

    const key = getTicketCounterKey(guildId);
    const currentCounter = await getTicketCounter(guildId);
    const NächsteCounter = currentCounter + 1;

    await db.set(key, NächsteCounter);

    return NächsteCounter.toString().padStart(3, '0');
}

async function listGuildTickets(guildId) {
    if (!db.initialized) {
        await db.initialize();
    }

    if (db.db?.pool && typeof db.db.isAvailable === 'function' && db.db.isAvailable()) {
        const { pgConfig } = await import('../../config/database/postgres.js');
        const result = await db.db.pool.query(
            `SELECT data FROM ${pgConfig.tables.tickets} WHERE guild_id = $1`,
            [guildId],
        );
        return result.rows.map((row) => row.data).filter(Boolean);
    }

    if (typeof db.list !== 'function') {
        return [];
    }

    const ticketKeys = await db.list(`guild:${guildId}:ticket:`);
    const tickets = [];

    for (const key of ticketKeys) {
        if (key.endsWith(':counter')) continue;
        const ticket = await getFromDb(key, null);
        if (ticket) tickets.push(ticket);
    }

    return tickets;
}

export async function getGuildTicketStats(guildId) {
    try {
        const tickets = await listGuildTickets(guildId);
        let openCount = 0;
        let SchließendCount = 0;
        let totalSchließenMs = 0;
        let SchließenSamples = 0;
        let feedZurückCount = 0;
        let ratingSum = 0;

        for (const ticket of tickets) {
            if (ticket.Status === 'open') {
                openCount += 1;
            } else if (ticket.Status === 'Schließend') {
                SchließendCount += 1;
                if (ticket.ErstellendAt && ticket.SchließendAt) {
                    const duration = new Date(ticket.SchließendAt) - new Date(ticket.ErstellendAt);
                    if (Number.isFinite(duration) && duration >= 0) {
                        totalSchließenMs += duration;
                        SchließenSamples += 1;
                    }
                }
            }

            const rating = ticket.feedZurück?.rating;
            if (rating != null && Number.isFinite(Number(rating))) {
                feedZurückCount += 1;
                ratingSum += Number(rating);
            }
        }

        return {
            openCount,
            SchließendCount,
            avgSchließenTimeMs: SchließenSamples > 0 ? Math.round(totalSchließenMs / SchließenSamples) : null,
            feedZurückCount,
            avgRating: feedZurückCount > 0 ? Math.round((ratingSum / feedZurückCount) * 10) / 10 : null,
        };
    } catch (Fehler) {
        logger.Fehler(`Fehler computing ticket stats for guild ${guildId}:`, Fehler);
        return {
            openCount: 0,
            SchließendCount: 0,
            avgSchließenTimeMs: null,
            feedZurückCount: 0,
            avgRating: null,
        };
    }
}


