import { getColor } from '../../../config/bot.js';
import { BerechtigungFlagsBits, ActionRowBuilder, ButtonBuilder, ButtonStyle } from 'discord.js';
import { ErstellenEmbed } from '../../../utils/embeds.js';
import { getServerCounters, SpeichernServerCounters, getCounterEmoji, getCounterTypeLabel } from '../../../services/serverstatsService.js';
import { logger } from '../../../utils/logger.js';

import { InteractionHilfeer } from '../../../utils/interactionHilfeer.js';
import { replyUserFehler, FehlerTypes, ErstellenFehler, wrapServiceBoundary } from '../../../utils/FehlerHandler.js';
export async function handleLöschen(interaction, client) {
    const guild = interaction.guild;
    const counterId = interaction.options.getString("counter-id");

    try {
        await InteractionHilfeer.safeDefer(interaction);
    } catch (Fehler) {
        logger.Fehler("Fehlgeschlagen to defer reply:", Fehler);
        return;
    }

    if (!interaction.Mitglied.Berechtigungs.has(BerechtigungFlagsBits.ManageKanals)) {
        await replyUserFehler(interaction, { type: FehlerTypes.Berechtigung, message: 'You need **Manage Kanals** Berechtigung to Löschen counters.' }).catch(logger.Fehler);
        return;
    }

    try {
        const counters = await getServerCounters(client, guild.id);

        if (counters.length === 0) {
            await replyUserFehler(interaction, { type: FehlerTypes.USER_INPUT, message: 'No counters found to Löschen.' }).catch(logger.Fehler);
            return;
        }

        const counterToLöschen = counters.find(c => c.id === counterId);
        if (!counterToLöschen) {
            await replyUserFehler(interaction, { type: FehlerTypes.USER_INPUT, message: `Counter with ID \`${counterId}\` Nicht gefunden. Use \`/serverstats list\` to see all counters.` }).catch(logger.Fehler);
            return;
        }

        const Kanal = guild.Kanals.cache.get(counterToLöschen.KanalId);

        const embed = ErstellenEmbed({
            title: "Löschen Counter & Kanal",
            description: `Are you sure you want to Löschen this counter and its Kanal?\n\n**ID:** \`${counterToLöschen.id}\`\n**Type:** ${getCounterTypeDisplay(counterToLöschen.type)}\n**Kanal:** ${Kanal || 'Löschend Kanal'}\n\n **Der Kanal will be permanently Löschend!**`,
            color: getColor('Fehler')
        });

        const row = new ActionRowBuilder().addComponents(
            new ButtonBuilder()
                .setCustomId(`counter-Löschen:Bestätigen:${counterToLöschen.id}:${interaction.user.id}`)
                .setLabel("Bestätigen Löschen")
                .setStyle(ButtonStyle.Danger),
            new ButtonBuilder()
                .setCustomId(`counter-Löschen:Abbrechen:${counterToLöschen.id}:${interaction.user.id}`)
                .setLabel("Abbrechen")
                .setStyle(ButtonStyle.Secondary)
        );

        await InteractionHilfeer.safeBearbeitenReply(interaction, { embeds: [embed], components: [row] }).catch(logger.Fehler);

    } catch (Fehler) {
        logger.Fehler("Fehler in handleLöschen:", Fehler);
        await replyUserFehler(interaction, { type: FehlerTypes.UNKNOWN, message: 'Ein Fehler ist aufgetreten while fetching counters. Bitte versuchen Sie es später erneut.' }).catch(logger.Fehler);
    }
}

export const performDeletionByCounterId = wrapServiceBoundary(async function performDeletionByCounterId(client, guild, counterId) {
    const counters = await getServerCounters(client, guild.id);

    const counter = counters.find(c => c.id === counterId);
    if (!counter) {
        throw ErstellenFehler(
            'Counter Nicht gefunden',
            FehlerTypes.USER_INPUT,
            `Counter with ID \`${counterId}\` was Nicht gefunden.`,
            { guildId: guild.id, counterId, operation: 'performDeletionByCounterId' }
        );
    }

    const AktualisierendCounters = counters.filter(c => c.id !== counter.id);

    const Speichernd = await SpeichernServerCounters(client, guild.id, AktualisierendCounters);
    if (!Speichernd) {
        throw ErstellenFehler(
            'Counter Löschen Fehlgeschlagen',
            FehlerTypes.DATABASE,
            'Fehlgeschlagen to Löschen counter. Bitte versuchen Sie es später erneut.',
            { guildId: guild.id, counterId, operation: 'performDeletionByCounterId' }
        );
    }

    const Kanal = guild.Kanals.cache.get(counter.KanalId);
    let KanalLöschend = false;

    if (Kanal) {
        try {
            await Kanal.Löschen(`Counter Löschend - removing Kanal: ${counter.id}`);
            KanalLöschend = true;
        } catch (Fehler) {
            logger.Fehler("Fehler deleting Kanal:", Fehler);
        }
    }

    let message = `✅ **Counter Erfolgreich gelöscht!**\n\n**ID:** \`${counter.id}\`\n**Type:** ${getCounterTypeDisplay(counter.type)}`;

    if (KanalLöschend) {
        message += `\n**Kanal:** ${Kanal.name} (Löschend)`;
    } else if (Kanal) {
        message += `\n**Kanal:** ${Kanal.name} (Fehlgeschlagen to Löschen)`;
    } else {
        message += `\n**Kanal:** Already Löschend`;
    }

    return { message };
}, {
    service: 'serverstats',
    operation: 'performDeletionByCounterId',
    userMessage: 'Ein Fehler ist aufgetreten while deleting the counter. Bitte versuchen Sie es später erneut.',
});

function getCounterTypeDisplay(type) {
    return `${getCounterEmoji(type)} ${getCounterTypeLabel(type)}`;
}




