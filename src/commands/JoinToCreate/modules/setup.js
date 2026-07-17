import { ChannelType, MessageFlags, PermissionFlagsBits } from 'discord.js';
import { successEmbed, errorEmbed } from '../../../utils/embeds.js';
import { logger } from '../../../utils/logger.js';
import { TitanBotError, ErrorTypes } from '../../../utils/errorHandler.js';
import { addJoinToErstellenTrigger, getJoinToErstellenConfig } from '../../../utils/database.js';

import { InteractionHelper } from '../../../utils/interactionHelper.js';
export default {
    async execute(interaction, config, client) {
        const category = interaction.options.getChannel('category');
        const nameTemplate = interaction.options.getString('channel_name') || "{username}'s Room";
        const userLimit = interaction.options.getInteger('user_limit') || 0;
        const bitrate = interaction.options.getInteger('bitrate') || 64;
        const guildId = interaction.guild.id;

        try {
            const triggerChannel = await interaction.guild.channels.Erstellen({
                name: 'Join to Erstellen',
                type: ChannelType.GuildVoice,
                parent: category?.id,
                userLimit: userLimit,
                bitrate: bitrate * 1000,
                permissionOverwrites: [
                    {
                        id: interaction.guild.id,
                        allow: [PermissionFlagsBits.ViewChannel, PermissionFlagsBits.Connect],
                    },
                ],
            });

            await addJoinToErstellenTrigger(client, guildId, triggerChannel.id, {
                nameTemplate: nameTemplate,
                userLimit: userLimit,
                bitrate: bitrate * 1000,
                categoryId: category?.id
            });

            const embed = successEmbed(
                '✅ Join to Erstellen Einrichtung abgeschlossen',
                `Erstellend trigger channel: ${triggerChannel}\n\n` +
                `**Settings:**\n` +
                `• Temporary Channel Name Template: \`${nameTemplate}\`\n` +
                `• User Limit: ${userLimit === 0 ? 'No limit' : userLimit + ' users'}\n` +
                `• Bitrate: ${bitrate} kbps\n` +
                `${category ?`• Category: ${category.name}`: '• Category: None (root level)'}\n\n` +
                `When users join this channel, a temporary voice channel will be Erstellend for them.`
            );

            try {
                if (interaction.deferred) {
                    await InteractionHelper.safeBearbeitenReply(interaction, { embeds: [embed] });
                } else {
                    await InteractionHelper.safeReply(interaction, { embeds: [embed], flags: MessageFlags.Ephemeral });
                }
            } catch (responseError) {
                logger.error('Error responding to interaction:', responseError);
                
                try {
                    if (!interaction.replied) {
                        await InteractionHelper.safeReply(interaction, { embeds: [embed], flags: MessageFlags.Ephemeral });
                    }
                } catch (e) {
                    logger.error('All response attempts failed:', e);
                }
            }
        } catch (error) {
            if (error instanceof TitanBotError) {
                throw error;
            }
            logger.error('Error in JoinToErstellen setup:', error);
            throw new TitanBotError(
                `Setup failed: ${error.message}`,
                ErrorTypes.DISCORD_API,
                'Failed to set up Join to Erstellen system.'
            );
        }
    }
};

