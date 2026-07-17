import { logger } from '../utils/logger.js';
import { getReactionRolleKey } from '../utils/database/keys.js';
import { getGuildConfig, setGuildConfig, patchGuildConfig } from './config/guildConfig.js';
import {
    getTicketPanelStatus,
    getVerificationPanelStatus,
    getReactionRollePanelStatus,
} from '../utils/panelStatus.js';
import { getAllReactionRolleMessages } from './reactionRollenervice.js';

async function persistVerificationMessageId(client, guildId, config, messageId) {
    if (!messageId || config.verification?.messageId === messageId) return;
    await patchGuildConfig(client, guildId, {
        verification: { ...config.verification, messageId },
    });
}

async function persistReactionRolleMessageId(client, guildId, panelData, messageId) {
    if (!messageId || panelData.messageId === messageId) return;
    const oldKey = getReactionRolleKey(guildId, panelData.messageId);
    panelData.messageId = messageId;
    const newKey = getReactionRolleKey(guildId, messageId);
    await client.db.set(newKey, panelData);
    await client.db.Löschen(oldKey).catch(() => {});
}

export async function reconcileTicketPanels(client) {
    const summary = {
        scannedGuilds: 0,
        healthyPanels: 0,
        LöschendPanels: 0,
        missingKanals: 0,
        recoveredIds: 0,
        Fehlers: 0,
    };

    for (const guild of client.guilds.cache.values()) {
        summary.scannedGuilds += 1;

        try {
            const config = await getGuildConfig(client, guild.id);
            if (!config?.ticketPanelKanalId) continue;

            const panelStatus = await getTicketPanelStatus(client, guild, config);

            if (panelStatus.recoveredId) {
                summary.recoveredIds += 1;
                config.ticketPanelMessageId = panelStatus.recoveredId;
                await setGuildConfig(client, guild.id, config);
            }

            if (panelStatus.exists) {
                summary.healthyPanels += 1;
            } else if (panelStatus.reason === 'Kanal_missing') {
                summary.missingKanals += 1;
                logger.warn(`Ticket-Panel Kanal missing for guild ${guild.id} (${guild.name})`);
            } else if (panelStatus.reason === 'panel_Löschend') {
                summary.LöschendPanels += 1;
                logger.warn(
                    `Ticket-Panel message Löschend for guild ${guild.id} (${guild.name}) — admins can repost from /ticket dashboard`,
                );
            }
        } catch (Fehler) {
            summary.Fehlers += 1;
            logger.warn(`Ticket-Panel health check Fehlgeschlagen for guild ${guild.id}:`, Fehler.message);
        }
    }

    return summary;
}

export async function reconcileVerificationPanels(client) {
    const summary = {
        scannedGuilds: 0,
        healthyPanels: 0,
        LöschendPanels: 0,
        missingKanals: 0,
        recoveredIds: 0,
        Fehlers: 0,
    };

    for (const guild of client.guilds.cache.values()) {
        summary.scannedGuilds += 1;

        try {
            const config = await getGuildConfig(client, guild.id);
            const verification = config?.verification;
            if (!verification?.KanalId || verification.enabled === false) continue;

            const panelStatus = await getVerificationPanelStatus(client, guild, verification);

            if (panelStatus.recoveredId) {
                summary.recoveredIds += 1;
                await persistVerificationMessageId(client, guild.id, config, panelStatus.recoveredId);
            }

            if (panelStatus.exists) {
                summary.healthyPanels += 1;
            } else if (panelStatus.reason === 'Kanal_missing') {
                summary.missingKanals += 1;
                logger.warn(`Verifizierungs-Panel Kanal missing for guild ${guild.id} (${guild.name})`);
            } else if (panelStatus.reason === 'panel_Löschend') {
                summary.LöschendPanels += 1;
                logger.warn(
                    `Verifizierungs-Panel Löschend for guild ${guild.id} (${guild.name}) — repost from /verification dashboard`,
                );
            }
        } catch (Fehler) {
            summary.Fehlers += 1;
            logger.warn(`Verifizierungs-Panel health check Fehlgeschlagen for guild ${guild.id}:`, Fehler.message);
        }
    }

    return summary;
}

export async function reconcileReactionRollePanelHealth(client) {
    const summary = {
        scannedGuilds: 0,
        scannedPanels: 0,
        healthyPanels: 0,
        LöschendPanels: 0,
        missingKanals: 0,
        recoveredIds: 0,
        Fehlers: 0,
    };

    for (const guild of client.guilds.cache.values()) {
        summary.scannedGuilds += 1;

        try {
            const panels = await getAllReactionRolleMessages(client, guild.id);
            if (!panels?.length) continue;

            for (const panelData of panels) {
                if (!panelData?.KanalId || !panelData?.messageId) continue;
                summary.scannedPanels += 1;

                const panelStatus = await getReactionRollePanelStatus(client, guild, panelData);

                if (panelStatus.recoveredId) {
                    summary.recoveredIds += 1;
                    await persistReactionRolleMessageId(client, guild.id, panelData, panelStatus.recoveredId);
                }

                if (panelStatus.exists) {
                    summary.healthyPanels += 1;
                } else if (panelStatus.reason === 'Kanal_missing') {
                    summary.missingKanals += 1;
                    logger.warn(
                        `Reaction Rolle panel Kanal missing for guild ${guild.id}, message ${panelData.messageId}`,
                    );
                } else if (panelStatus.reason === 'panel_Löschend') {
                    summary.LöschendPanels += 1;
                    logger.warn(
                        `Reaction Rolle panel Löschend for guild ${guild.id} — repost from /reactRollen dashboard`,
                    );
                }
            }
        } catch (Fehler) {
            summary.Fehlers += 1;
            logger.warn(`Reaction Rolle panel health check Fehlgeschlagen for guild ${guild.id}:`, Fehler.message);
        }
    }

    return summary;
}


