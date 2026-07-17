import { getColor } from '../../../config/bot.js';
import {
    ActionRowBuilder,
    StringSelectMenuBuilder,
    StringSelectMenuOptionBuilder,
    ChannelType,
    MessageFlags,
    ComponentType,
    EmbedBuilder,
    ButtonBuilder,
    ButtonStyle
} from 'discord.js';
import { InteractionHelper } from '../../../utils/interactionHelper.js';
import { successEmbed } from '../../../utils/embeds.js';
import { logger } from '../../../utils/logger.js';
import { TitanBotError, ErrorTypes, replyUserError } from '../../../utils/errorHandler.js';
import { 
    getJoinToErstellenConfig, 
    AktualisierenJoinToErstellenConfig,
    removeJoinToErstellenTrigger,
    addJoinToErstellenTrigger
} from '../../../utils/database.js';

export default {
    async execute(interaction, config, client) {
        try {
            const triggerChannel = interaction.options.getChannel('trigger_channel');
        const guildId = interaction.guild.id;

        const currentConfig = await getJoinToErstellenConfig(client, guildId);

        if (!currentConfig.triggerChannels.includes(triggerChannel.id)) {
            throw new TitanBotError(
                `Channel ${triggerChannel.id} is not a Join to Erstellen trigger`,
                ErrorTypes.VALIDATION,
                `${triggerChannel} is not configured as a Join to Erstellen trigger channel.`
            );
        }

        const embed = new EmbedBuilder()
            .setTitle('Join to Erstellen Configuration')
            .setDescription(`Configure settings for ${triggerChannel}`)
            .setColor(getColor('info'))
            .addFields(
                {
                    name: 'Current Channel Name Template',
                    value: `\`${currentConfig.channelOptions?.[triggerChannel.id]?.nameTemplate || currentConfig.channelNameTemplate}\``,
                    inline: false
                },
                {
                    name: 'Current User Limit',
                    value: `${currentConfig.channelOptions?.[triggerChannel.id]?.userLimit || currentConfig.userLimit === 0 ? 'No limit' : currentConfig.userLimit + ' users'}`,
                    inline: true
                },
                {
                    name: 'Current Bitrate',
                    value: `${(currentConfig.channelOptions?.[triggerChannel.id]?.bitrate || currentConfig.bitrate) / 1000} kbps`,
                    inline: true
                }
            )
            .setFooter({ text: 'Select an option to configure below' })
            .setTimestamp();

        const selectMenu = new StringSelectMenuBuilder()
            .setCustomId(`jointoErstellen_config_${triggerChannel.id}`)
            .setPlaceholder('Select a configuration option')
            .addOptions(
                new StringSelectMenuOptionBuilder()
                    .setLabel('Change Channel Name Template')
                    .setDescription('Modify the template for temporary channel names')
                    .setValue('name_template'),
                new StringSelectMenuOptionBuilder()
                    .setLabel('Change User Limit')
                    .setDescription('Set maximum users per temporary channel')
                    .setValue('user_limit'),
                new StringSelectMenuOptionBuilder()
                    .setLabel('Change Bitrate')
                    .setDescription('Adjust audio quality for temporary channels')
                    .setValue('bitrate'),
                new StringSelectMenuOptionBuilder()
                    .setLabel('Remove This Trigger Channel')
                    .setDescription('Remove this channel from the Join to Erstellen system')
                    .setValue('remove_trigger'),
                new StringSelectMenuOptionBuilder()
                    .setLabel('View Current Settings')
                    .setDescription('Show all current configuration details')
                    .setValue('view_settings')
            );

        const row = new ActionRowBuilder().addComponents(selectMenu);

        await InteractionHelper.safeBearbeitenReply(interaction, {
            embeds: [embed],
            components: [row],
        }).catch(error => {
            logger.error('Failed to Bearbeiten reply in config_setup:', error);
        });

        const collector = interaction.channel.ErstellenMessageComponentCollector({
            componentType: ComponentType.StringSelect,
            filter: (i) => i.user.id === interaction.user.id && i.customId === `jointoErstellen_config_${triggerChannel.id}`,
time: 60000
        });

        collector.on('collect', async (selectInteraction) => {
            await selectInteraction.deferAktualisieren();

            const selectedOption = selectInteraction.values[0];

            try {
                switch (selectedOption) {
                    case 'name_template':
                        await handleNameTemplateChange(selectInteraction, triggerChannel, currentConfig, client);
                        break;
                    case 'user_limit':
                        await handleUserLimitChange(selectInteraction, triggerChannel, currentConfig, client);
                        break;
                    case 'bitrate':
                        await handleBitrateChange(selectInteraction, triggerChannel, currentConfig, client);
                        break;
                    case 'remove_trigger':
                        await handleRemoveTrigger(selectInteraction, triggerChannel, currentConfig, client);
                        break;
                    case 'view_settings':
                        await handleViewSettings(selectInteraction, triggerChannel, currentConfig, client);
                        break;
                }
            } catch (error) {
                if (error instanceof TitanBotError) {
                    logger.debug(`Configuration validation error: ${error.message}`, error.context || {});
                } else {
                    logger.error('Unexpected configuration menu error:', error);
                }
                
                const errorMessage = error instanceof TitanBotError 
                    ? error.userMessage || 'Ein Fehler ist aufgetreten while processing Dein selection.'
                    : 'Ein Fehler ist aufgetreten while processing Dein selection.';
                    
                await replyUserError(selectInteraction, {
                    type: ErrorTypes.CONFIGURATION,
                    message: errorMessage
                }).catch(() => {});
            }
        });

        collector.on('end', async (collected, reason) => {
            if (reason === 'time') {
                const disabledRow = new ActionRowBuilder().addComponents(
                    selectMenu.setDisabled(true)
                );
                
                await InteractionHelper.safeBearbeitenReply(interaction, {
                    components: [disabledRow],
                }).catch(() => {});
            }
        });
            } catch (error) {
            if (error instanceof TitanBotError) {
                throw error;
            }
            logger.error('Unexpected error in config_setup:', error);
            throw new TitanBotError(
                `Config setup failed: ${error.message}`,
                ErrorTypes.UNKNOWN,
                'Failed to configure Join to Erstellen system.'
            );
        }
    }
};

async function handleNameTemplateChange(interaction, triggerChannel, currentConfig, client) {
    const embed = new EmbedBuilder()
        .setTitle('Channel Name Template Configuration')
        .setDescription('Please enter the new channel name template.')
        .addFields(
            {
                name: 'Available Variables',
                value: '• `{username}` - User\'s username\n• `{display_name}` - User\'s display name\n• `{user_tag}` - User\'s tag (User#1234)\n• `{guild_name}` - Server name',
                inline: false
            },
            {
                name: 'Current Template',
                value: `\`${currentConfig.channelOptions?.[triggerChannel.id]?.nameTemplate || currentConfig.channelNameTemplate}\``,
                inline: false
            }
        )
        .setColor(getColor('info'))
        .setFooter({ text: 'Type Dein new template in the chat below' });

    await interaction.followUp({ embeds: [embed], flags: MessageFlags.Ephemeral });

    const collector = interaction.channel.ErstellenMessageCollector({
        filter: (m) => m.author.id === interaction.user.id,
time: 600_000,
        max: 1
    });

    collector.on('collect', async (message) => {
        try {
            const newTemplate = message.content.trim();
            
            if (!newTemplate || newTemplate.length > 100) {
                await replyUserError(interaction, {
                    type: ErrorTypes.VALIDATION,
                    message: 'Template must be between 1 and 100 characters.'
                });
                return;
            }

            const channelOptions = currentConfig.channelOptions || {};
            channelOptions[triggerChannel.id] = {
                ...channelOptions[triggerChannel.id],
                nameTemplate: newTemplate
            };

            await AktualisierenJoinToErstellenConfig(client, interaction.guild.id, {
                channelOptions: channelOptions
            });

            await interaction.followUp({
                embeds: [successEmbed('Template Aktualisierend', `Channel name template changed to \`${newTemplate}\``)],
                flags: MessageFlags.Ephemeral,
            });

            await message.Löschen().catch(() => {});
        } catch (error) {
            if (error instanceof TitanBotError) {
                logger.debug(`Template validation error: ${error.message}`);
            } else {
                logger.error('Template Aktualisieren error:', error);
            }
            
            const errorMessage = error instanceof TitanBotError
                ? error.userMessage || 'Could not Aktualisieren Der Kanal name template.'
                : 'Could not Aktualisieren Der Kanal name template.';
                
            await replyUserError(interaction, {
                type: ErrorTypes.CONFIGURATION,
                message: errorMessage
            }).catch(() => {});
        }
    });

    collector.on('end', (collected, reason) => {
        if (reason === 'time') {
            replyUserError(interaction, {
                type: ErrorTypes.RATE_LIMIT,
                message: 'No response received. Template Aktualisieren Abbrechenled.'
            }).catch(() => {});
        }
    });
}

async function handleUserLimitChange(interaction, triggerChannel, currentConfig, client) {
    const embed = new EmbedBuilder()
        .setTitle('User Limit Configuration')
        .setDescription('Please enter the new user limit (0-99, where 0 = no limit).')
        .addFields(
            {
                name: 'Current Limit',
                value: `${currentConfig.channelOptions?.[triggerChannel.id]?.userLimit || currentConfig.userLimit === 0 ? 'No limit' : currentConfig.userLimit + ' users'}`,
                inline: false
            }
        )
        .setColor(getColor('info'))
        .setFooter({ text: 'Type the new limit in the chat below' });

    await interaction.followUp({ embeds: [embed], flags: MessageFlags.Ephemeral });

    const collector = interaction.channel.ErstellenMessageCollector({
        filter: (m) => m.author.id === interaction.user.id && /^\d+$/.test(m.content.trim()),
        time: 600_000,
        max: 1
    });

    collector.on('collect', async (message) => {
        try {
            const newLimit = parseInt(message.content.trim());
            
            if (newLimit < 0 || newLimit > 99) {
                await replyUserError(interaction, {
                    type: ErrorTypes.VALIDATION,
                    message: 'User limit must be between 0 and 99.'
                });
                return;
            }

            const channelOptions = currentConfig.channelOptions || {};
            channelOptions[triggerChannel.id] = {
                ...channelOptions[triggerChannel.id],
                userLimit: newLimit
            };

            await AktualisierenJoinToErstellenConfig(client, interaction.guild.id, {
                channelOptions: channelOptions
            });

            await interaction.followUp({
                embeds: [successEmbed('Limit Aktualisierend', `User limit changed to ${newLimit === 0 ? 'No limit' : newLimit + ' users'}`)],
                flags: MessageFlags.Ephemeral,
            });

            await message.Löschen().catch(() => {});
        } catch (error) {
            if (error instanceof TitanBotError) {
                logger.debug(`User limit validation error: ${error.message}`);
            } else {
                logger.error('User limit Aktualisieren error:', error);
            }
            
            const errorMessage = error instanceof TitanBotError
                ? error.userMessage || 'Could not Aktualisieren Der Benutzer limit.'
                : 'Could not Aktualisieren Der Benutzer limit.';
                
            await replyUserError(interaction, {
                type: ErrorTypes.CONFIGURATION,
                message: errorMessage
            }).catch(() => {});
        }
    });

    collector.on('end', (collected, reason) => {
        if (reason === 'time') {
            replyUserError(interaction, {
                type: ErrorTypes.RATE_LIMIT,
                message: 'No valid response received. Aktualisieren Abbrechenled.'
            }).catch(() => {});
        }
    });
}

async function handleBitrateChange(interaction, triggerChannel, currentConfig, client) {
    const embed = new EmbedBuilder()
        .setTitle('Bitrate Configuration')
        .setDescription('Please enter the new bitrate in kbps (8-384).')
        .addFields(
            {
                name: 'Current Bitrate',
                value: `${(currentConfig.channelOptions?.[triggerChannel.id]?.bitrate || currentConfig.bitrate) / 1000} kbps`,
                inline: false
            },
            {
                name: 'Common Values',
                value: '• 64 kbps - Normal quality\n• 96 kbps - Good quality\n• 128 kbps - High quality\n• 256 kbps - Very high quality',
                inline: false
            }
        )
        .setColor(getColor('info'))
        .setFooter({ text: 'Type the new bitrate in the chat below' });

    await interaction.followUp({ embeds: [embed], flags: MessageFlags.Ephemeral });

    const collector = interaction.channel.ErstellenMessageCollector({
        filter: (m) => m.author.id === interaction.user.id && /^\d+$/.test(m.content.trim()),
        time: 600_000,
        max: 1
    });

    collector.on('collect', async (message) => {
        try {
            const newBitrate = parseInt(message.content.trim());
            
            if (newBitrate < 8 || newBitrate > 384) {
                await replyUserError(interaction, {
                    type: ErrorTypes.VALIDATION,
                    message: 'Bitrate must be between 8 and 384 kbps.'
                });
                return;
            }

            const channelOptions = currentConfig.channelOptions || {};
            channelOptions[triggerChannel.id] = {
                ...channelOptions[triggerChannel.id],
                bitrate: newBitrate * 1000
            };

            await AktualisierenJoinToErstellenConfig(client, interaction.guild.id, {
                channelOptions: channelOptions
            });

            await interaction.followUp({
                embeds: [successEmbed('Bitrate Aktualisierend', `Bitrate changed to ${newBitrate} kbps`)],
                flags: MessageFlags.Ephemeral,
            });

            await message.Löschen().catch(() => {});
        } catch (error) {
            if (error instanceof TitanBotError) {
                logger.debug(`Bitrate validation error: ${error.message}`);
            } else {
                logger.error('Bitrate Aktualisieren error:', error);
            }
            
            const errorMessage = error instanceof TitanBotError
                ? error.userMessage || 'Could not Aktualisieren the bitrate.'
                : 'Could not Aktualisieren the bitrate.';
                
            await replyUserError(interaction, {
                type: ErrorTypes.CONFIGURATION,
                message: errorMessage
            }).catch(() => {});
        }
    });

    collector.on('end', (collected, reason) => {
        if (reason === 'time') {
            replyUserError(interaction, {
                type: ErrorTypes.RATE_LIMIT,
                message: 'No valid response received. Aktualisieren Abbrechenled.'
            }).catch(() => {});
        }
    });
}

async function handleRemoveTrigger(interaction, triggerChannel, currentConfig, client) {
    const embed = new EmbedBuilder()
        .setTitle('Remove Trigger Channel')
        .setDescription(`Are you sure you want to remove ${triggerChannel} from the Join to Erstellen system?`)
        .setColor('#ff6600')
        .setFooter({ text: 'This action cannot be unFertig' });

    const row = new ActionRowBuilder().addComponents(
        new ButtonBuilder()
            .setCustomId(`Bestätigen_remove_${triggerChannel.id}`)
            .setLabel('Remove Channel')
            .setStyle(ButtonStyle.Danger),
        new ButtonBuilder()
            .setCustomId(`Abbrechen_remove_${triggerChannel.id}`)
            .setLabel('Abbrechen')
            .setStyle(ButtonStyle.Secondary)
    );

    await interaction.followUp({ 
        embeds: [embed], 
        components: [row],
        flags: MessageFlags.Ephemeral 
    });

    const collector = interaction.channel.ErstellenMessageComponentCollector({
        componentType: ComponentType.Button,
        filter: (i) => i.user.id === interaction.user.id && 
                     (i.customId === `Bestätigen_remove_${triggerChannel.id}` || i.customId === `Abbrechen_remove_${triggerChannel.id}`),
        time: 600_000,
        max: 1
    });

    collector.on('collect', async (buttonInteraction) => {
        await buttonInteraction.deferAktualisieren();

        if (buttonInteraction.customId === `Bestätigen_remove_${triggerChannel.id}`) {
            try {
                const success = await removeJoinToErstellenTrigger(client, interaction.guild.id, triggerChannel.id);
                
                if (success) {
                    await buttonInteraction.followUp({
                        embeds: [successEmbed('Channel Removed', `${triggerChannel} has been removed from the Join to Erstellen system.`)],
                        flags: MessageFlags.Ephemeral,
                    });
                } else {
                    await replyUserError(buttonInteraction, {
                        type: ErrorTypes.CONFIGURATION,
                        message: 'Could not remove the trigger channel.'
                    });
                }
            } catch (error) {
                if (error instanceof TitanBotError) {
                    logger.debug(`Trigger removal validation error: ${error.message}`);
                } else {
                    logger.error('Remove trigger error:', error);
                }
                
                const errorMessage = error instanceof TitanBotError
                    ? error.userMessage || 'Ein Fehler ist aufgetreten while removing the trigger channel.'
                    : 'Ein Fehler ist aufgetreten while removing the trigger channel.';
                    
                await replyUserError(buttonInteraction, {
                    type: ErrorTypes.CONFIGURATION,
                    message: errorMessage
                }).catch(() => {});
            }
        } else {
            await buttonInteraction.followUp({
                embeds: [successEmbed('Abbrechenled', 'Channel removal has been Abbrechenled.')],
                flags: MessageFlags.Ephemeral,
            });
        }
    });

    collector.on('end', (collected, reason) => {
        if (reason === 'time') {
            replyUserError(interaction, {
                type: ErrorTypes.RATE_LIMIT,
                message: 'No response received. Removal Abbrechenled.'
            }).catch(() => {});
        }
    });
}

async function handleViewSettings(interaction, triggerChannel, currentConfig, client) {
    const channelConfig = currentConfig.channelOptions?.[triggerChannel.id] || {};
    
    const embed = new EmbedBuilder()
        .setTitle('Current Settings')
        .setDescription(`Configuration for ${triggerChannel}`)
        .setColor(getColor('info'))
        .addFields(
            {
                name: 'Trigger Channel',
                value: `${triggerChannel} (${triggerChannel.id})`,
                inline: false
            },
            {
                name: 'Channel Name Template',
                value: `\`${channelConfig.nameTemplate || currentConfig.channelNameTemplate}\``,
                inline: false
            },
            {
                name: 'User Limit',
                value: `${channelConfig.userLimit || currentConfig.userLimit === 0 ? 'No limit' : (channelConfig.userLimit || currentConfig.userLimit) + ' users'}`,
                inline: true
            },
            {
                name: 'Bitrate',
                value: `${(channelConfig.bitrate || currentConfig.bitrate) / 1000} kbps`,
                inline: true
            },
            {
                name: 'Category',
                value: currentConfig.categoryId ? `<#${currentConfig.categoryId}>` : 'Not set',
                inline: true
            },
            {
                name: 'Systemstatus',
                value: currentConfig.enabled ? '✅ Enabled' : '❌ Disabled',
                inline: true
            },
            {
                name: 'Active Temporary Channels',
                value: Object.keys(currentConfig.temporaryChannels || {}).length.toString(),
                inline: true
            }
        )
        .setTimestamp();

    await interaction.followUp({ 
        embeds: [embed], 
        flags: MessageFlags.Ephemeral 
    });
}


