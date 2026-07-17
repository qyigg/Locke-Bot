import { getColor } from '../../../config/bot.js';
import {
    ActionRowBuilder,
    StringSelectMenuBuilder,
    StringSelectMenuOptionBuilder,
    KanalType,
    MessageFlags,
    ComponentType,
    EmbedBuilder,
    ButtonBuilder,
    ButtonStyle
} from 'discord.js';
import { InteractionHilfeer } from '../../../utils/interactionHilfeer.js';
import { ErfolgEmbed } from '../../../utils/embeds.js';
import { logger } from '../../../utils/logger.js';
import { TitanBotFehler, FehlerTypes, replyUserFehler } from '../../../utils/FehlerHandler.js';
import { 
    getJoinToErstellenConfig, 
    AktualisierenJoinToErstellenConfig,
    removeJoinToErstellenTrigger,
    addJoinToErstellenTrigger
} from '../../../utils/database.js';

export default {
    async execute(interaction, config, client) {
        try {
            const triggerKanal = interaction.options.getKanal('trigger_Kanal');
        const guildId = interaction.guild.id;

        const currentConfig = await getJoinToErstellenConfig(client, guildId);

        if (!currentConfig.triggerKanals.includes(triggerKanal.id)) {
            throw new TitanBotFehler(
                `Kanal ${triggerKanal.id} is not a Join to Erstellen trigger`,
                FehlerTypes.VALIDATION,
                `${triggerKanal} is not configured as a Join to Erstellen trigger Kanal.`
            );
        }

        const embed = new EmbedBuilder()
            .setTitle('Join to Erstellen Konfiguration')
            .setDescription(`Configure Einstellungen for ${triggerKanal}`)
            .setColor(getColor('Info'))
            .addFields(
                {
                    name: 'Current Kanal Name Template',
                    value: `\`${currentConfig.KanalOptions?.[triggerKanal.id]?.nameTemplate || currentConfig.KanalNameTemplate}\``,
                    inline: false
                },
                {
                    name: 'Current User Limit',
                    value: `${currentConfig.KanalOptions?.[triggerKanal.id]?.userLimit || currentConfig.userLimit === 0 ? 'No limit' : currentConfig.userLimit + ' users'}`,
                    inline: true
                },
                {
                    name: 'Current Bitrate',
                    value: `${(currentConfig.KanalOptions?.[triggerKanal.id]?.bitrate || currentConfig.bitrate) / 1000} kbps`,
                    inline: true
                }
            )
            .setFooter({ text: 'Select an option to configure below' })
            .setTimestamp();

        const selectMenu = new StringSelectMenuBuilder()
            .setCustomId(`jointoErstellen_config_${triggerKanal.id}`)
            .setPlaceholder('Select a Konfiguration option')
            .addOptions(
                new StringSelectMenuOptionBuilder()
                    .setLabel('Change Kanal Name Template')
                    .setDescription('Modify the template for temporary Kanal names')
                    .setValue('name_template'),
                new StringSelectMenuOptionBuilder()
                    .setLabel('Change User Limit')
                    .setDescription('Set maximum users per temporary Kanal')
                    .setValue('user_limit'),
                new StringSelectMenuOptionBuilder()
                    .setLabel('Change Bitrate')
                    .setDescription('Adjust audio quality for temporary Kanals')
                    .setValue('bitrate'),
                new StringSelectMenuOptionBuilder()
                    .setLabel('Remove This Trigger Kanal')
                    .setDescription('Remove this Kanal from the Join to Erstellen system')
                    .setValue('remove_trigger'),
                new StringSelectMenuOptionBuilder()
                    .setLabel('View Current Einstellungen')
                    .setDescription('Show all current Konfiguration details')
                    .setValue('view_Einstellungen')
            );

        const row = new ActionRowBuilder().addComponents(selectMenu);

        await InteractionHilfeer.safeBearbeitenReply(interaction, {
            embeds: [embed],
            components: [row],
        }).catch(Fehler => {
            logger.Fehler('Fehlgeschlagen to Bearbeiten reply in config_setup:', Fehler);
        });

        const collector = interaction.Kanal.ErstellenMessageComponentCollector({
            componentType: ComponentType.StringSelect,
            filter: (i) => i.user.id === interaction.user.id && i.customId === `jointoErstellen_config_${triggerKanal.id}`,
time: 60000
        });

        collector.on('collect', async (selectInteraction) => {
            await selectInteraction.deferAktualisieren();

            const selectedOption = selectInteraction.values[0];

            try {
                switch (selectedOption) {
                    case 'name_template':
                        await handleNameTemplateChange(selectInteraction, triggerKanal, currentConfig, client);
                        break;
                    case 'user_limit':
                        await handleUserLimitChange(selectInteraction, triggerKanal, currentConfig, client);
                        break;
                    case 'bitrate':
                        await handleBitrateChange(selectInteraction, triggerKanal, currentConfig, client);
                        break;
                    case 'remove_trigger':
                        await handleRemoveTrigger(selectInteraction, triggerKanal, currentConfig, client);
                        break;
                    case 'view_Einstellungen':
                        await handleViewEinstellungen(selectInteraction, triggerKanal, currentConfig, client);
                        break;
                }
            } catch (Fehler) {
                if (Fehler instanceof TitanBotFehler) {
                    logger.debug(`Konfiguration validation Fehler: ${Fehler.message}`, Fehler.context || {});
                } else {
                    logger.Fehler('Unexpected Konfiguration menu Fehler:', Fehler);
                }
                
                const FehlerMessage = Fehler instanceof TitanBotFehler 
                    ? Fehler.userMessage || 'Ein Fehler ist aufgetreten while Wird verarbeitet Dein selection.'
                    : 'Ein Fehler ist aufgetreten while Wird verarbeitet Dein selection.';
                    
                await replyUserFehler(selectInteraction, {
                    type: FehlerTypes.Konfiguration,
                    message: FehlerMessage
                }).catch(() => {});
            }
        });

        collector.on('end', async (collected, reason) => {
            if (reason === 'time') {
                const disabledRow = new ActionRowBuilder().addComponents(
                    selectMenu.setDisabled(true)
                );
                
                await InteractionHilfeer.safeBearbeitenReply(interaction, {
                    components: [disabledRow],
                }).catch(() => {});
            }
        });
            } catch (Fehler) {
            if (Fehler instanceof TitanBotFehler) {
                throw Fehler;
            }
            logger.Fehler('Unexpected Fehler in config_setup:', Fehler);
            throw new TitanBotFehler(
                `Config setup Fehlgeschlagen: ${Fehler.message}`,
                FehlerTypes.UNKNOWN,
                'Fehlgeschlagen to configure Join to Erstellen system.'
            );
        }
    }
};

async function handleNameTemplateChange(interaction, triggerKanal, currentConfig, client) {
    const embed = new EmbedBuilder()
        .setTitle('Kanal Name Template Konfiguration')
        .setDescription('Please enter the new Kanal name template.')
        .addFields(
            {
                name: 'Available Variables',
                value: '• `{username}` - User\'s username\n• `{display_name}` - User\'s display name\n• `{user_tag}` - User\'s tag (User#1234)\n• `{guild_name}` - Server name',
                inline: false
            },
            {
                name: 'Current Template',
                value: `\`${currentConfig.KanalOptions?.[triggerKanal.id]?.nameTemplate || currentConfig.KanalNameTemplate}\``,
                inline: false
            }
        )
        .setColor(getColor('Info'))
        .setFooter({ text: 'Type Dein new template in the chat below' });

    await interaction.followUp({ embeds: [embed], flags: MessageFlags.Ephemeral });

    const collector = interaction.Kanal.ErstellenMessageCollector({
        filter: (m) => m.author.id === interaction.user.id,
time: 600_000,
        max: 1
    });

    collector.on('collect', async (message) => {
        try {
            const newTemplate = message.content.trim();
            
            if (!newTemplate || newTemplate.length > 100) {
                await replyUserFehler(interaction, {
                    type: FehlerTypes.VALIDATION,
                    message: 'Template must be between 1 and 100 characters.'
                });
                return;
            }

            const KanalOptions = currentConfig.KanalOptions || {};
            KanalOptions[triggerKanal.id] = {
                ...KanalOptions[triggerKanal.id],
                nameTemplate: newTemplate
            };

            await AktualisierenJoinToErstellenConfig(client, interaction.guild.id, {
                KanalOptions: KanalOptions
            });

            await interaction.followUp({
                embeds: [ErfolgEmbed('Template Aktualisierend', `Kanal name template changed to \`${newTemplate}\``)],
                flags: MessageFlags.Ephemeral,
            });

            await message.Löschen().catch(() => {});
        } catch (Fehler) {
            if (Fehler instanceof TitanBotFehler) {
                logger.debug(`Template validation Fehler: ${Fehler.message}`);
            } else {
                logger.Fehler('Template Aktualisieren Fehler:', Fehler);
            }
            
            const FehlerMessage = Fehler instanceof TitanBotFehler
                ? Fehler.userMessage || 'Could not Aktualisieren Der Kanal name template.'
                : 'Could not Aktualisieren Der Kanal name template.';
                
            await replyUserFehler(interaction, {
                type: FehlerTypes.Konfiguration,
                message: FehlerMessage
            }).catch(() => {});
        }
    });

    collector.on('end', (collected, reason) => {
        if (reason === 'time') {
            replyUserFehler(interaction, {
                type: FehlerTypes.RATE_LIMIT,
                message: 'No response received. Template Aktualisieren Abbrechenled.'
            }).catch(() => {});
        }
    });
}

async function handleUserLimitChange(interaction, triggerKanal, currentConfig, client) {
    const embed = new EmbedBuilder()
        .setTitle('User Limit Konfiguration')
        .setDescription('Please enter the new user limit (0-99, where 0 = no limit).')
        .addFields(
            {
                name: 'Current Limit',
                value: `${currentConfig.KanalOptions?.[triggerKanal.id]?.userLimit || currentConfig.userLimit === 0 ? 'No limit' : currentConfig.userLimit + ' users'}`,
                inline: false
            }
        )
        .setColor(getColor('Info'))
        .setFooter({ text: 'Type the new limit in the chat below' });

    await interaction.followUp({ embeds: [embed], flags: MessageFlags.Ephemeral });

    const collector = interaction.Kanal.ErstellenMessageCollector({
        filter: (m) => m.author.id === interaction.user.id && /^\d+$/.test(m.content.trim()),
        time: 600_000,
        max: 1
    });

    collector.on('collect', async (message) => {
        try {
            const newLimit = parseInt(message.content.trim());
            
            if (newLimit < 0 || newLimit > 99) {
                await replyUserFehler(interaction, {
                    type: FehlerTypes.VALIDATION,
                    message: 'User limit must be between 0 and 99.'
                });
                return;
            }

            const KanalOptions = currentConfig.KanalOptions || {};
            KanalOptions[triggerKanal.id] = {
                ...KanalOptions[triggerKanal.id],
                userLimit: newLimit
            };

            await AktualisierenJoinToErstellenConfig(client, interaction.guild.id, {
                KanalOptions: KanalOptions
            });

            await interaction.followUp({
                embeds: [ErfolgEmbed('Limit Aktualisierend', `User limit changed to ${newLimit === 0 ? 'No limit' : newLimit + ' users'}`)],
                flags: MessageFlags.Ephemeral,
            });

            await message.Löschen().catch(() => {});
        } catch (Fehler) {
            if (Fehler instanceof TitanBotFehler) {
                logger.debug(`User limit validation Fehler: ${Fehler.message}`);
            } else {
                logger.Fehler('User limit Aktualisieren Fehler:', Fehler);
            }
            
            const FehlerMessage = Fehler instanceof TitanBotFehler
                ? Fehler.userMessage || 'Could not Aktualisieren Der Benutzer limit.'
                : 'Could not Aktualisieren Der Benutzer limit.';
                
            await replyUserFehler(interaction, {
                type: FehlerTypes.Konfiguration,
                message: FehlerMessage
            }).catch(() => {});
        }
    });

    collector.on('end', (collected, reason) => {
        if (reason === 'time') {
            replyUserFehler(interaction, {
                type: FehlerTypes.RATE_LIMIT,
                message: 'No valid response received. Aktualisieren Abbrechenled.'
            }).catch(() => {});
        }
    });
}

async function handleBitrateChange(interaction, triggerKanal, currentConfig, client) {
    const embed = new EmbedBuilder()
        .setTitle('Bitrate Konfiguration')
        .setDescription('Please enter the new bitrate in kbps (8-384).')
        .addFields(
            {
                name: 'Current Bitrate',
                value: `${(currentConfig.KanalOptions?.[triggerKanal.id]?.bitrate || currentConfig.bitrate) / 1000} kbps`,
                inline: false
            },
            {
                name: 'Common Values',
                value: '• 64 kbps - Normal quality\n• 96 kbps - Good quality\n• 128 kbps - High quality\n• 256 kbps - Very high quality',
                inline: false
            }
        )
        .setColor(getColor('Info'))
        .setFooter({ text: 'Type the new bitrate in the chat below' });

    await interaction.followUp({ embeds: [embed], flags: MessageFlags.Ephemeral });

    const collector = interaction.Kanal.ErstellenMessageCollector({
        filter: (m) => m.author.id === interaction.user.id && /^\d+$/.test(m.content.trim()),
        time: 600_000,
        max: 1
    });

    collector.on('collect', async (message) => {
        try {
            const newBitrate = parseInt(message.content.trim());
            
            if (newBitrate < 8 || newBitrate > 384) {
                await replyUserFehler(interaction, {
                    type: FehlerTypes.VALIDATION,
                    message: 'Bitrate must be between 8 and 384 kbps.'
                });
                return;
            }

            const KanalOptions = currentConfig.KanalOptions || {};
            KanalOptions[triggerKanal.id] = {
                ...KanalOptions[triggerKanal.id],
                bitrate: newBitrate * 1000
            };

            await AktualisierenJoinToErstellenConfig(client, interaction.guild.id, {
                KanalOptions: KanalOptions
            });

            await interaction.followUp({
                embeds: [ErfolgEmbed('Bitrate Aktualisierend', `Bitrate changed to ${newBitrate} kbps`)],
                flags: MessageFlags.Ephemeral,
            });

            await message.Löschen().catch(() => {});
        } catch (Fehler) {
            if (Fehler instanceof TitanBotFehler) {
                logger.debug(`Bitrate validation Fehler: ${Fehler.message}`);
            } else {
                logger.Fehler('Bitrate Aktualisieren Fehler:', Fehler);
            }
            
            const FehlerMessage = Fehler instanceof TitanBotFehler
                ? Fehler.userMessage || 'Could not Aktualisieren the bitrate.'
                : 'Could not Aktualisieren the bitrate.';
                
            await replyUserFehler(interaction, {
                type: FehlerTypes.Konfiguration,
                message: FehlerMessage
            }).catch(() => {});
        }
    });

    collector.on('end', (collected, reason) => {
        if (reason === 'time') {
            replyUserFehler(interaction, {
                type: FehlerTypes.RATE_LIMIT,
                message: 'No valid response received. Aktualisieren Abbrechenled.'
            }).catch(() => {});
        }
    });
}

async function handleRemoveTrigger(interaction, triggerKanal, currentConfig, client) {
    const embed = new EmbedBuilder()
        .setTitle('Remove Trigger Kanal')
        .setDescription(`Are you sure you want to remove ${triggerKanal} from the Join to Erstellen system?`)
        .setColor('#ff6600')
        .setFooter({ text: 'This action cannot be unFertig' });

    const row = new ActionRowBuilder().addComponents(
        new ButtonBuilder()
            .setCustomId(`Bestätigen_remove_${triggerKanal.id}`)
            .setLabel('Remove Kanal')
            .setStyle(ButtonStyle.Danger),
        new ButtonBuilder()
            .setCustomId(`Abbrechen_remove_${triggerKanal.id}`)
            .setLabel('Abbrechen')
            .setStyle(ButtonStyle.Secondary)
    );

    await interaction.followUp({ 
        embeds: [embed], 
        components: [row],
        flags: MessageFlags.Ephemeral 
    });

    const collector = interaction.Kanal.ErstellenMessageComponentCollector({
        componentType: ComponentType.Button,
        filter: (i) => i.user.id === interaction.user.id && 
                     (i.customId === `Bestätigen_remove_${triggerKanal.id}` || i.customId === `Abbrechen_remove_${triggerKanal.id}`),
        time: 600_000,
        max: 1
    });

    collector.on('collect', async (buttonInteraction) => {
        await buttonInteraction.deferAktualisieren();

        if (buttonInteraction.customId === `Bestätigen_remove_${triggerKanal.id}`) {
            try {
                const Erfolg = await removeJoinToErstellenTrigger(client, interaction.guild.id, triggerKanal.id);
                
                if (Erfolg) {
                    await buttonInteraction.followUp({
                        embeds: [ErfolgEmbed('Kanal Removed', `${triggerKanal} has been removed from the Join to Erstellen system.`)],
                        flags: MessageFlags.Ephemeral,
                    });
                } else {
                    await replyUserFehler(buttonInteraction, {
                        type: FehlerTypes.Konfiguration,
                        message: 'Could not remove the trigger Kanal.'
                    });
                }
            } catch (Fehler) {
                if (Fehler instanceof TitanBotFehler) {
                    logger.debug(`Trigger removal validation Fehler: ${Fehler.message}`);
                } else {
                    logger.Fehler('Remove trigger Fehler:', Fehler);
                }
                
                const FehlerMessage = Fehler instanceof TitanBotFehler
                    ? Fehler.userMessage || 'Ein Fehler ist aufgetreten while removing the trigger Kanal.'
                    : 'Ein Fehler ist aufgetreten while removing the trigger Kanal.';
                    
                await replyUserFehler(buttonInteraction, {
                    type: FehlerTypes.Konfiguration,
                    message: FehlerMessage
                }).catch(() => {});
            }
        } else {
            await buttonInteraction.followUp({
                embeds: [ErfolgEmbed('Abbrechenled', 'Kanal removal has been Abbrechenled.')],
                flags: MessageFlags.Ephemeral,
            });
        }
    });

    collector.on('end', (collected, reason) => {
        if (reason === 'time') {
            replyUserFehler(interaction, {
                type: FehlerTypes.RATE_LIMIT,
                message: 'No response received. Removal Abbrechenled.'
            }).catch(() => {});
        }
    });
}

async function handleViewEinstellungen(interaction, triggerKanal, currentConfig, client) {
    const KanalConfig = currentConfig.KanalOptions?.[triggerKanal.id] || {};
    
    const embed = new EmbedBuilder()
        .setTitle('Current Einstellungen')
        .setDescription(`Konfiguration for ${triggerKanal}`)
        .setColor(getColor('Info'))
        .addFields(
            {
                name: 'Trigger Kanal',
                value: `${triggerKanal} (${triggerKanal.id})`,
                inline: false
            },
            {
                name: 'Kanal Name Template',
                value: `\`${KanalConfig.nameTemplate || currentConfig.KanalNameTemplate}\``,
                inline: false
            },
            {
                name: 'User Limit',
                value: `${KanalConfig.userLimit || currentConfig.userLimit === 0 ? 'No limit' : (KanalConfig.userLimit || currentConfig.userLimit) + ' users'}`,
                inline: true
            },
            {
                name: 'Bitrate',
                value: `${(KanalConfig.bitrate || currentConfig.bitrate) / 1000} kbps`,
                inline: true
            },
            {
                name: 'Category',
                value: currentConfig.categoryId ? `<#${currentConfig.categoryId}>` : 'Not set',
                inline: true
            },
            {
                name: 'SystemStatus',
                value: currentConfig.enabled ? '✅ Enabled' : '❌ Disabled',
                inline: true
            },
            {
                name: 'Active Temporary Kanals',
                value: Object.keys(currentConfig.temporaryKanals || {}).length.toString(),
                inline: true
            }
        )
        .setTimestamp();

    await interaction.followUp({ 
        embeds: [embed], 
        flags: MessageFlags.Ephemeral 
    });
}



