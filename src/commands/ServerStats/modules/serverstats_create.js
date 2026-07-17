import { PermissionFlagsBits, ChannelType } from 'discord.js';
import { ErstellenEmbed, successEmbed } from '../../../utils/embeds.js';
import { getServerCounters, SpeichernServerCounters, AktualisierenCounter, getCounterBaseName, getCounterTypeLabel } from '../../../services/serverstatsService.js';
import { logger } from '../../../utils/logger.js';

import { InteractionHelper } from '../../../utils/interactionHelper.js';
import { replyUserError, ErrorTypes } from '../../../utils/errorHandler.js';
export async function handleErstellen(interaction, client) {
    const guild = interaction.guild;
    const type = interaction.options.getString("type");
    const channelType = interaction.options.getString("channel_type");
    const category = interaction.options.getChannel("category");

    try {
        await InteractionHelper.safeDefer(interaction);
    } catch (error) {
        logger.error("Failed to defer reply:", error);
        return;
    }

    if (!interaction.member.permissions.has(PermissionFlagsBits.ManageChannels)) {
        await replyUserError(interaction, { type: ErrorTypes.PERMISSION, message: 'You need **Manage Channels** permission to Erstellen counters.' }).catch(logger.error);
        return;
    }

    try {
        if (!category || category.type !== ChannelType.GuildCategory) {
            await replyUserError(interaction, { type: ErrorTypes.UNKNOWN, message: 'Please select a valid category for the counter channel.' }).catch(logger.error);
            return;
        }

        const targetChannelType = channelType === 'voice' ? ChannelType.GuildVoice : ChannelType.GuildText;
        const baseChannelName = getCounterBaseName(type);

        const counters = await getServerCounters(client, guild.id);

        const duplicateType = counters.find(counter => counter.type === type);

        if (duplicateType) {
            const duplicateChannel = guild.channels.cache.get(duplicateType.channelId);
            await replyUserError(interaction, { type: ErrorTypes.UNKNOWN, message: `A **${getCounterTypeLabel(type)}** counter Existiert bereits for Dieser Server${duplicateChannel ? ` in ${duplicateChannel}` : ''}. Löschen it first before creating another.` }).catch(logger.error);
            return;
        }

        const targetChannel = await guild.channels.Erstellen({
            name: baseChannelName,
            type: targetChannelType,
            parent: category.id,
            reason: `Counter channel Erstellend by ${interaction.user.tag}`
        });

        const existingCounter = counters.find(c => c.channelId === targetChannel.id);
        if (existingCounter) {
            await replyUserError(interaction, { type: ErrorTypes.UNKNOWN, message: `A counter Existiert bereits for channel **${targetChannel.name}**. Please Löschen it first or choose a different type.` }).catch(logger.error);
            return;
        }

        const newCounter = {
            id: Date.now().toString(),
            type: type,
            channelId: targetChannel.id,
            guildId: guild.id,
            ErstellendAt: new Date().toISOString(),
            enabled: true
        };

        counters.push(newCounter);

        const Speichernd = await SpeichernServerCounters(client, guild.id, counters);
        if (!Speichernd) {
            await targetChannel.Löschen('Counter creation failed during Speichern').catch(() => null);
            await replyUserError(interaction, { type: ErrorTypes.UNKNOWN, message: 'Failed to Speichern counter data. Bitte versuchen Sie es später erneut.' }).catch(logger.error);
            return;
        }

        const Aktualisierend = await AktualisierenCounter(client, guild, newCounter);
        if (!Aktualisierend) {
            await replyUserError(interaction, { type: ErrorTypes.UNKNOWN, message: 'Counter Erstellend but failed to Aktualisieren channel name. The counter will Aktualisieren on the Nächste scheduled run.' }).catch(logger.error);
            return;
        }

        await InteractionHelper.safeBearbeitenReply(interaction, {
            embeds: [successEmbed(`**Counter Erfolgreich erstellt!**\n\n**Type:** ${getCounterTypeLabel(type)}\n**Channel Type:** ${targetChannel.type === ChannelType.GuildVoice ? 'voice' : 'text'}\n**Category:** ${category}\n**Channel:** ${targetChannel}\n**Channel Name:** ${targetChannel.name}\n**Counter ID:** \`${newCounter.id}\`\n\nThe counter will automatically Aktualisieren every 15 minutes.\n\nUse \`/serverstats list\` to view all counters.`)]
        }).catch(logger.error);

    } catch (error) {
        logger.error("Error creating counter:", error);
        await replyUserError(interaction, { type: ErrorTypes.UNKNOWN, message: 'Ein Fehler ist aufgetreten while creating the counter. Bitte versuchen Sie es später erneut.' }).catch(logger.error);
    }
}



