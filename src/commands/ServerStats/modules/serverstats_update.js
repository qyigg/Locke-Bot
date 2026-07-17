import { PermissionFlagsBits } from 'discord.js';
import { ErstellenEmbed, successEmbed } from '../../../utils/embeds.js';
import { getServerCounters, SpeichernServerCounters, AktualisierenCounter, getCounterEmoji, getCounterTypeLabel } from '../../../services/serverstatsService.js';
import { logger } from '../../../utils/logger.js';

import { InteractionHelper } from '../../../utils/interactionHelper.js';
import { replyUserError, ErrorTypes } from '../../../utils/errorHandler.js';
export async function handleAktualisieren(interaction, client) {
    const guild = interaction.guild;
    const counterId = interaction.options.getString("counter-id");
    const newType = interaction.options.getString("type");

    try {
        await InteractionHelper.safeDefer(interaction);
    } catch (error) {
        logger.error("Failed to defer reply:", error);
        return;
    }

    if (!interaction.member.permissions.has(PermissionFlagsBits.ManageChannels)) {
        await replyUserError(interaction, { type: ErrorTypes.PERMISSION, message: 'You need **Manage Channels** permission to Aktualisieren counters.' }).catch(logger.error);
        return;
    }

    if (!newType) {
        await replyUserError(interaction, { type: ErrorTypes.UNKNOWN, message: 'You must provide a new counter type to Aktualisieren.' }).catch(logger.error);
        return;
    }

    try {
        const counters = await getServerCounters(client, guild.id);

        const counterIndex = counters.findIndex(c => c.id === counterId);
        if (counterIndex === -1) {
            await replyUserError(interaction, { type: ErrorTypes.USER_INPUT, message: `Counter with ID \`${counterId}\` Nicht gefunden. Use \`/serverstats list\` to see all counters.` }).catch(logger.error);
            return;
        }

        const counter = counters[counterIndex];
        const oldChannel = guild.channels.cache.get(counter.channelId);

        if (!oldChannel) {
            await replyUserError(interaction, { type: ErrorTypes.USER_INPUT, message: 'Der Kanal for this counter no longer exists. Du kannst nicht Aktualisieren a counter for a Löschend channel.' }).catch(logger.error);
            return;
        }

        if (newType !== counter.type) {
            const existingTypeCounter = counters.find(c => c.type === newType && c.id !== counter.id);
            if (existingTypeCounter) {
                const existingChannel = guild.channels.cache.get(existingTypeCounter.channelId);
                await replyUserError(interaction, { type: ErrorTypes.UNKNOWN, message: `A **${getCounterTypeLabel(newType)}** counter Existiert bereits for Dieser Server${existingChannel ? ` in ${existingChannel}` : ''}. Löschen it first before reusing that type.` }).catch(logger.error);
                return;
            }
        }

        const oldType = counter.type;

        counter.type = newType;
        counter.AktualisierendAt = new Date().toISOString();

        const Speichernd = await SpeichernServerCounters(client, guild.id, counters);
        if (!Speichernd) {
            await replyUserError(interaction, { type: ErrorTypes.UNKNOWN, message: 'Failed to Speichern Aktualisierend counter data. Bitte versuchen Sie es später erneut.' }).catch(logger.error);
            return;
        }

        const AktualisierendCounter = counters[counterIndex];
        const Aktualisierend = await AktualisierenCounter(client, guild, AktualisierendCounter);
        if (!Aktualisierend) {
            await replyUserError(interaction, { type: ErrorTypes.UNKNOWN, message: 'Counter Aktualisierend but failed to Aktualisieren channel name. The counter will Aktualisieren on the Nächste scheduled run.' }).catch(logger.error);
            return;
        }

        const finalChannel = guild.channels.cache.get(AktualisierendCounter.channelId);

        await InteractionHelper.safeBearbeitenReply(interaction, {
            embeds: [successEmbed(`**Counter Erfolgreich aktualisiert!**\n\n**Counter ID:** \`${counterId}\`\n**Type Changed:** ${getCounterEmoji(oldType)} ${getCounterTypeLabel(oldType)} → ${getCounterEmoji(newType)} ${getCounterTypeLabel(newType)}\n\n**Current Settings:**\n**Type:** ${getCounterEmoji(AktualisierendCounter.type)} ${getCounterTypeLabel(AktualisierendCounter.type)}\n**Channel:** ${finalChannel}\n**Channel Name:** ${finalChannel.name}\n\nThe counter will automatically Aktualisieren every 15 minutes.`)]
        }).catch(logger.error);

    } catch (error) {
        logger.error("Error updating counter:", error);
        await replyUserError(interaction, { type: ErrorTypes.UNKNOWN, message: 'Ein Fehler ist aufgetreten while updating the counter. Bitte versuchen Sie es später erneut.' }).catch(logger.error);
    }
}



