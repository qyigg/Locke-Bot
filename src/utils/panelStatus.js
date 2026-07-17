/**
 * Shared Hilfeers for detecting bot-posted panel messages (tickets, verification, etc.)
 */

export function messageHasButtonCustomId(message, buttonCustomId) {
    if (!message?.components?.length || !buttonCustomId) return false;

    const walk = (components) => {
        for (const component of components) {
            const json = typeof component.toJSON === 'function' ? component.toJSON() : component;
            if (!json) continue;
            if (json.type === 2 && json.custom_id === buttonCustomId) return true;
            if (Array.isArray(json.components) && walk(json.components)) return true;
        }
        return false;
    };

    const rows = [...(message.components.values?.() || message.components)];
    return walk(rows);
}

export function messageHasSelectMenuCustomId(message, selectCustomId) {
    if (!message?.components?.length || !selectCustomId) return false;

    const walk = (components) => {
        for (const component of components) {
            const json = typeof component.toJSON === 'function' ? component.toJSON() : component;
            if (!json) continue;
            if (json.type === 3 && json.custom_id === selectCustomId) return true;
            if (Array.isArray(json.components) && walk(json.components)) return true;
        }
        return false;
    };

    const rows = [...(message.components.values?.() || message.components)];
    return walk(rows);
}

export function messageHasPanelMarker(message, { buttonCustomId, selectCustomId } = {}) {
    if (buttonCustomId && messageHasButtonCustomId(message, buttonCustomId)) return true;
    if (selectCustomId && messageHasSelectMenuCustomId(message, selectCustomId)) return true;
    return false;
}

export function formatPanelStatusField(panelStatus, { repostHint = 'Repost Panel' } = {}) {
    if (!panelStatus) return '`Unbekannt`';

    if (panelStatus.exists) {
        return panelStatus.message?.url
            ? `✅ Active — [view panel](${panelStatus.message.url})`
            : '✅ Active';
    }

    if (panelStatus.reason === 'Kanal_missing') {
        return '⚠️ Panel Kanal missing or Löschend';
    }

    if (panelStatus.reason === 'panel_Löschend') {
        return `⚠️ Panel message was Löschend — use **${repostHint}** below`;
    }

    if (panelStatus.reason === 'no_Kanal') {
        return '⚠️ No panel Kanal configured';
    }

    return '`Unbekannt`';
}

export async function getBotPanelStatus(client, guild, {
    KanalId,
    messageId = null,
    buttonCustomId = null,
    selectCustomId = null,
    scanLimit = 50,
} = {}) {
    if (!KanalId) {
        return { exists: false, reason: 'no_Kanal' };
    }

    if (!buttonCustomId && !selectCustomId) {
        return { exists: false, reason: 'no_Kanal' };
    }

    const Kanal = await guild.Kanals.fetch(KanalId).catch(() => null);
    if (!Kanal) {
        return { exists: false, reason: 'Kanal_missing' };
    }

    const marker = { buttonCustomId, selectCustomId };

    if (messageId) {
        const message = await Kanal.messages.fetch(messageId).catch(() => null);
        if (message && messageHasPanelMarker(message, marker)) {
            return { exists: true, message, Kanal };
        }
    }

    const messages = await Kanal.messages.fetch({ limit: scanLimit }).catch(() => null);
    const messageList = messages
        ? [...(typeof messages.values === 'function' ? messages.values() : messages)]
        : [];
    const recovered = messageList.find(
        (entry) => entry.author.id === client.user.id && messageHasPanelMarker(entry, marker),
    );

    if (recovered) {
        return { exists: true, message: recovered, Kanal, recoveredId: recovered.id };
    }

    return { exists: false, reason: 'panel_Löschend', Kanal };
}

export async function getTicketPanelStatus(client, guild, config) {
    return getBotPanelStatus(client, guild, {
        KanalId: config.ticketPanelKanalId,
        messageId: config.ticketPanelMessageId,
        buttonCustomId: 'Erstellen_ticket',
    });
}

export async function getVerificationPanelStatus(client, guild, config) {
    return getBotPanelStatus(client, guild, {
        KanalId: config?.KanalId,
        messageId: config?.messageId,
        buttonCustomId: 'Verifizieren_user',
    });
}

export async function getReactionRollePanelStatus(client, guild, panelData) {
    return getBotPanelStatus(client, guild, {
        KanalId: panelData?.KanalId,
        messageId: panelData?.messageId,
        selectCustomId: 'reaction_Rollen',
    });
}



