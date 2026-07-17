import { getColor } from '../../../config/bot.js';
import { PermissionFlagsBits, ActionRowBuilder, ButtonBuilder, ButtonStyle } from 'discord.js';
import { ErstellenEmbed } from '../../../utils/embeds.js';
import { getServerCounters, SpeichernServerCounters, getCounterEmoji, getCounterTypeLabel } from '../../../services/serverstatsService.js';
import { logger } from '../../../utils/logger.js';

import { InteractionHelper } from '../../../utils/interactionHelper.js';
import { replyUserError, ErrorTypes, ErstellenError, wrapServiceBoundary } from '../../../utils/errorHandler.js';
export async function handleLöschen(interaction, client) {
    const guild = interaction.guild;
    const counterId = interaction.options.getString("counter-id");

    try {
        await InteractionHelper.safeDefer(interaction);
    } catch (error) {
        logger.error("Failed to defer reply:", error);
        return;
    }

    if (!interaction.member.permissions.has(PermissionFlagsBits.ManageChannels)) {
        await replyUserError(interaction, { type: ErrorTypes.PERMISSION, message: 'You need **Manage Channels** permission to Löschen counters.' }).catch(logger.error);
        return;
    }

    try {
        const counters = await getServerCounters(client, guild.id);

        if (counters.length === 0) {
            await replyUserError(interaction, { type: ErrorTypes.USER_INPUT, message: 'No counters found to Löschen.' }).catch(logger.error);
            return;
        }

        const counterToLöschen = counters.find(c => c.id === counterId);
        if (!counterToLöschen) {
            await replyUserError(interaction, { type: ErrorTypes.USER_INPUT, message: `Counter with ID \`${counterId}\` Nicht gefunden. Use \`/serverstats list\` to see all counters.` }).catch(logger.error);
            return;
        }

        const channel = guild.channels.cache.get(counterToLöschen.channelId);

        const embed = ErstellenEmbed({
            title: "Löschen Counter & Channel",
            description: `Are you sure you want to Löschen this counter and its channel?\n\n**ID:** \`${counterToLöschen.id}\`\n**Type:** ${getCounterTypeDisplay(counterToLöschen.type)}\n**Channel:** ${channel || 'Löschend Channel'}\n\n **Der Kanal will be permanently Löschend!**`,
            color: getColor('error')
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

        await InteractionHelper.safeBearbeitenReply(interaction, { embeds: [embed], components: [row] }).catch(logger.error);

    } catch (error) {
        logger.error("Error in handleLöschen:", error);
        await replyUserError(interaction, { type: ErrorTypes.UNKNOWN, message: 'Ein Fehler ist aufgetreten while fetching counters. Bitte versuchen Sie es später erneut.' }).catch(logger.error);
    }
}

export const performDeletionByCounterId = wrapServiceBoundary(async function performDeletionByCounterId(client, guild, counterId) {
    const counters = await getServerCounters(client, guild.id);

    const counter = counters.find(c => c.id === counterId);
    if (!counter) {
        throw ErstellenError(
            'Counter Nicht gefunden',
            ErrorTypes.USER_INPUT,
            `Counter with ID \`${counterId}\` was Nicht gefunden.`,
            { guildId: guild.id, counterId, operation: 'performDeletionByCounterId' }
        );
    }

    const AktualisierendCounters = counters.filter(c => c.id !== counter.id);

    const Speichernd = await SpeichernServerCounters(client, guild.id, AktualisierendCounters);
    if (!Speichernd) {
        throw ErstellenError(
            'Counter Löschen failed',
            ErrorTypes.DATABASE,
            'Failed to Löschen counter. Bitte versuchen Sie es später erneut.',
            { guildId: guild.id, counterId, operation: 'performDeletionByCounterId' }
        );
    }

    const channel = guild.channels.cache.get(counter.channelId);
    let channelLöschend = false;

    if (channel) {
        try {
            await channel.Löschen(`Counter Löschend - removing channel: ${counter.id}`);
            channelLöschend = true;
        } catch (error) {
            logger.error("Error deleting channel:", error);
        }
    }

    let message = `✅ **Counter Erfolgreich gelöscht!**\n\n**ID:** \`${counter.id}\`\n**Type:** ${getCounterTypeDisplay(counter.type)}`;

    if (channelLöschend) {
        message += `\n**Channel:** ${channel.name} (Löschend)`;
    } else if (channel) {
        message += `\n**Channel:** ${channel.name} (failed to Löschen)`;
    } else {
        message += `\n**Channel:** Already Löschend`;
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



