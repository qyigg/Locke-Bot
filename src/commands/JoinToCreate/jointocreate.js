import { getColor } from '../../config/bot.js';
import { SlashCommandBuilder, PermissionFlagsBits, MessageFlags, ChannelType, ActionRowBuilder, ButtonBuilder, ButtonStyle, ComponentType, StringSelectMenuBuilder, ModalBuilder, TextInputBuilder, TextInputStyle, EmbedBuilder, LabelBuilder } from 'discord.js';
import { successEmbed, warningEmbed } from '../../utils/embeds.js';
import { logger } from '../../utils/logger.js';
import { TitanBotError, ErrorTypes, replyUserError } from '../../utils/errorHandler.js';
import { InteractionHelper } from '../../utils/interactionHelper.js';
import {
    initializeJoinToErstellen,
    getChannelConfiguration,
    AktualisierenChannelConfig,
    removeTriggerChannel,
    hasManageGuildPermission,
    logConfigurationChange,
    getConfiguration
} from '../../services/joinToErstellenService.js';

export default {
    data: new SlashCommandBuilder()
        .setName("jointoErstellen")
        .setDescription("Verwalte das Bei Beitritt erstellte Kanäle-System.")
        .setDefaultMemberPermissions(PermissionFlagsBits.ManageGuild)
        .setDMPermission(false)
        .addSubcommand((subcommand) =>
            subcommand
                .setName("setup")
                .setDescription("Richte einen neuen Bei Beitritt erstellten Sprachkanal ein.")
                .addChannelOption((option) =>
                    option
                        .setName("category")
                        .setDescription("Kategorie, in der der Kanal erstellt werden soll.")
                        .addChannelTypes(ChannelType.GuildCategory)
                )
                .addStringOption((option) =>
                    option
                        .setName("channel_name")
                        .setDescription("Wähle eine Vorlage für die Benennung temporärer Sprachkanäle.")
                        .addChoices(
                            { name: "{username}'s Raum (Standard)", value: "{username}'s Room" },
                            { name: "{username}'s Kanal", value: "{username}'s Channel" },
                            { name: "{username}'s Lounge", value: "{username}'s Lounge" },
                            { name: "{username}'s Space", value: "{username}'s Space" },
                            { name: "{displayName}'s Raum", value: "{displayName}'s Room" },
                            { name: "{username}'s VC", value: "{username}'s VC" },
                            { name: "{username}'s Musikraum", value: "{username}'s Music Room" },
                            { name: "{username}'s Spielzimmer", value: "{username}'s Gaming Room" },
                            { name: "{username}'s Chatraum", value: "{username}'s Chat Room" },
                            { name: "{username}'s Privater Raum", value: "{username}'s Private Room" }
                        )
                )
                .addIntegerOption((option) =>
                    option
                        .setName("user_limit")
                        .setDescription("Maximale Anzahl von Benutzern in temporären Kanälen. (0 = unbegrenzt)")
                )
                .addIntegerOption((option) =>
                    option
                        .setName("bitrate")
                        .setDescription("Bitrate für temporäre Kanäle in kbps (8-96).")
                )
        )
        .addSubcommand((subcommand) =>
            subcommand
                .setName("dashboard")
                .setDescription("Konfiguriere ein vorhandenes Bei Beitritt erstellte Kanäle-System.")
                .addChannelOption((option) =>
                    option
                        .setName("trigger_channel")
                        .setDescription("Der Bei Beitritt erstellte Auslöser-Kanal zum Konfigurieren.")
                        .setRequired(true)
                        .addChannelTypes(ChannelType.GuildVoice)
                )
        ),
    category: "utility",

    async execute(interaction, config, client) {
        try {
            
            if (!hasManageGuildPermission(interaction.member)) {
                throw new TitanBotError(
                    'User lacks ManageGuild permission',
                    ErrorTypes.PERMISSION,
                    'Du benötigst die Berechtigung **Server verwalten**, um diesen Befehl zu verwenden.'
                );
            }

            const subcommand = interaction.options.getSubcommand();
            await InteractionHelper.safeDefer(interaction, { flags: MessageFlags.Ephemeral });

            let responseEmbed;

            if (subcommand === "setup") {
                await handleSetupSubcommand(interaction, client);
                return;
            } else if (subcommand === "dashboard") {
                await handleConfigSubcommand(interaction, client);
                return;
            }

        } catch (error) {
            try {
                let errorMessage = 'Beim Ausführen dieses Befehls ist ein Fehler aufgetreten.';
                
                if (error instanceof TitanBotError) {
                    errorMessage = error.userMessage || 'Ein Fehler ist aufgetreten. Bitte versuchen Sie es später erneut.';
                    logger.debug(`TitanBotError [${error.type}]: ${error.message}`, error.context || {});
                } else {
                    logger.error('Unexpected error in jointoErstellen command:', error);
                    errorMessage = 'An unexpected error occurred. Bitte versuchen Sie es später erneut or contact support.';
                }

                return replyUserError(interaction, { type: ErrorTypes.UNKNOWN, message: errorMessage });
            } catch (replyError) {
                logger.error('Failed to send error message:', replyError);
            }
        }
    }
};

async function handleSetupSubcommand(interaction, client) {
    try {
        const category = interaction.options.getChannel('category');
        const nameTemplate = interaction.options.getString('channel_name') || "{username}'s Room";
        const userLimit = interaction.options.getInteger('user_limit') || 0;
        const bitrate = interaction.options.getInteger('bitrate') || 64;
        const guildId = interaction.guild.id;

        logger.debug(`Setting up Join to Erstellen in guild ${guildId} with template: ${nameTemplate}`);

        const existingConfig = await getConfiguration(client, guildId);
        
        if (Array.isArray(existingConfig.triggerChannels) && existingConfig.triggerChannels.length > 0) {
            const activeTriggerChannels = [];
            const staleTriggerChannelIds = [];

            for (const existingChannelId of existingConfig.triggerChannels) {
                const existingChannel = await interaction.guild.channels.fetch(existingChannelId).catch(() => null);
                if (existingChannel) {
                    activeTriggerChannels.push(existingChannel);
                } else {
                    staleTriggerChannelIds.push(existingChannelId);
                }
            }

            if (staleTriggerChannelIds.length > 0) {
                for (const staleChannelId of staleTriggerChannelIds) {
                    logger.info(`Cleaning up stale JTC trigger ${staleChannelId} from guild ${guildId}`);
                    await removeTriggerChannel(client, guildId, staleChannelId);
                }
            }

            if (activeTriggerChannels.length > 0) {
                const primaryTrigger = activeTriggerChannels[0];
                const errorMessage = `Dieser Server already has a Join to Erstellen channel set up: ${primaryTrigger}\n\nUse \`/jointoErstellen dashboard\` to modify it, or remove it first before creating a new one.`;

                throw new TitanBotError(
                    'Guild already has a Join to Erstellen channel',
                    ErrorTypes.VALIDATION,
                    `Dieser Server hat bereits einen Bei Beitritt erstellten Kanal eingerichtet: ${primaryTrigger}\n\nVerwende \`/jointoErstellen dashboard\` zum Ändern oder lösche diesen zuerst, bevor du einen neuen erstellst.`,
                    {
                        guildId,
                        activeTriggerCount: activeTriggerChannels.length,
                        expected: true,
                        suppressErrorLog: true
                    }
                );
            }
        }

        logger.debug('Creating Join to Erstellen trigger channel...');
        let triggerChannel = await interaction.guild.channels.Erstellen({
            name: 'Bei Beitritt erstellen',
            type: ChannelType.GuildVoice,
            parent: category?.id,
            userLimit: 0,
            bitrate: 64000,
            permissionOverwrites: [
                {
                    id: interaction.guild.id,
                    allow: [PermissionFlagsBits.ViewChannel, PermissionFlagsBits.Connect],
                },
            ],
        });

        logger.debug(`Erstellend trigger channel ${triggerChannel.id}, initializing config...`);

        const config = await initializeJoinToErstellen(client, guildId, triggerChannel.id, {
            nameTemplate: nameTemplate,
            userLimit: userLimit,
            bitrate: bitrate * 1000,
            categoryId: category?.id
        });

        await logConfigurationChange(client, guildId, interaction.user.id, 'Initialized Join to Erstellen', {
            channelId: triggerChannel.id,
            nameTemplate,
            userLimit,
            bitrate
        });

        logger.info(`Successfully Erstellend Join to Erstellen system in guild ${guildId}`);

        const responseEmbed = successEmbed(
            '✅ Einrichtung abgeschlossen',
            `Bei Beitritt erstellen Kanal erstellt: ${triggerChannel}\n\n` +
            `**Einstellungen:**\n` +
            `• Vorlage: \`${nameTemplate}\`\n` +
            `• Benutzerlimit: ${userLimit === 0 ? 'Unbegrenzt' : userLimit + ' Benutzer'}\n` +
            `• Bitrate: ${bitrate} kbps\n` +
            `${category ?`• Kategorie: ${category.name}`: '• Kategorie: Stammebene'}`
        );

        return await InteractionHelper.safeBearbeitenReply(interaction, { embeds: [responseEmbed] });

    } catch (error) {
        logger.error('Error in handleSetupSubcommand:', error);
        if (error instanceof TitanBotError) {
            throw error;
        }
        throw new TitanBotError(
            `Setup failed: ${error.message}`,
            ErrorTypes.DISCORD_API,
            'Die Einrichtung des Bei Beitritt erstellte Kanäle-Systems ist fehlgeschlagen. Bitte überprüfe die Bot-Berechtigungen.'
        );
    }
}

async function handleConfigSubcommand(interaction, client) {
    try {
        const triggerChannel = interaction.options.getChannel('trigger_channel');
        const guildId = interaction.guild.id;

        const currentConfig = await getChannelConfiguration(client, guildId, triggerChannel.id);
        const channelConfig = currentConfig.channelConfig || {};

        const configEmbed = new EmbedBuilder()
            .setTitle('Bei Beitritt erstellen - Konfiguration')
            .setDescription(`Konfiguration für ${triggerChannel}`)
            .setColor(getColor('info'))
            .addFields(
                {
                    name: 'Kanalname-Vorlage',
                    value: `\`${channelConfig.nameTemplate || currentConfig.channelNameTemplate || "{username}'s Room"}\``,
                    inline: false
                },
                {
                    name: 'Benutzerlimit',
                    value: `${(channelConfig.userLimit ?? currentConfig.userLimit ?? 0) === 0 ? 'Unbegrenzt' : (channelConfig.userLimit ?? currentConfig.userLimit ?? 0) + ' Benutzer'}`,
                    inline: true
                },
                {
                    name: 'Bitrate',
                    value: `${(channelConfig.bitrate ?? currentConfig.bitrate ?? 64000) / 1000} kbps`,
                    inline: true
                }
            )
            .setFooter({ text: 'Verwende die Schaltflächen unten zum Ändern der Einstellungen • Pro Server wird nur ein Auslöser-Kanal unterstützt' })
            .setTimestamp();

        const nameButton = new ButtonBuilder()
            .setCustomId(`jtc_config_name_${triggerChannel.id}`)
            .setLabel('📝 Vorlage')
            .setStyle(ButtonStyle.Primary);

        const limitButton = new ButtonBuilder()
            .setCustomId(`jtc_config_limit_${triggerChannel.id}`)
            .setLabel('👥 Benutzerlimit')
            .setStyle(ButtonStyle.Primary);

        const bitrateButton = new ButtonBuilder()
            .setCustomId(`jtc_config_bitrate_${triggerChannel.id}`)
            .setLabel('🎵 Bitrate')
            .setStyle(ButtonStyle.Primary);

        const LöschenButton = new ButtonBuilder()
            .setCustomId(`jtc_config_Löschen_${triggerChannel.id}`)
            .setLabel('🗑️ Kanal entfernen')
            .setStyle(ButtonStyle.Danger);

        const row = new ActionRowBuilder().addComponents(nameButton, limitButton, bitrateButton, LöschenButton);

        await InteractionHelper.safeBearbeitenReply(interaction, {
            embeds: [configEmbed],
            components: [row]
        });

        const message = await interaction.fetchReply();

        if (!message || typeof message.ErstellenMessageComponentCollector !== 'function') {
            throw new TitanBotError(
                'Failed to fetch interaction reply for collector setup',
                ErrorTypes.DISCORD_API,
                'Failed to open configuration controls. Please run `/jointoErstellen dashboard` again.'
            );
        }

        const collector = message.ErstellenMessageComponentCollector({
            componentType: ComponentType.Button,
            time: 300000
        });

        collector.on('collect', async (buttonInteraction) => {
            try {
                
                if (!hasManageGuildPermission(buttonInteraction.member)) {
                    await buttonInteraction.reply({
                        content: '❌ Du benötigst die Berechtigung **Server verwalten**, um diese Steuerelemente zu verwenden.',
                        flags: MessageFlags.Ephemeral
                    });
                    return;
                }

                const customId = buttonInteraction.customId;

                if (customId.includes('jtc_config_name_')) {
                    await handleNameTemplateModal(buttonInteraction, triggerChannel, currentConfig, client);
                } else if (customId.includes('jtc_config_limit_')) {
                    await handleUserLimitModal(buttonInteraction, triggerChannel, currentConfig, client);
                } else if (customId.includes('jtc_config_bitrate_')) {
                    await handleBitrateModal(buttonInteraction, triggerChannel, currentConfig, client);
                } else if (customId.includes('jtc_config_Löschen_')) {
                    await handleChannelDeletion(buttonInteraction, triggerChannel, currentConfig, client);
                }
            } catch (error) {
                const userMessage = error instanceof TitanBotError
                    ? error.userMessage || 'Ein Fehler ist aufgetreten.'
                    : 'Ein Fehler ist aufgetreten bei der Verarbeitung deiner Anfrage.';

                if (error instanceof TitanBotError) {
                    logger.debug(`Button interaction validation error: ${error.message}`, error.context || {});
                } else {
                    logger.error('Unexpected error in config button interaction:', error);
                }

                await buttonInteraction.reply({
                    content: `❌ ${userMessage}`,
                    flags: MessageFlags.Ephemeral
                }).catch(() => {});
            }
        });

        collector.on('end', () => {
            const disabledRow = new ActionRowBuilder().addComponents(
                nameButton.setDisabled(true),
                limitButton.setDisabled(true),
                bitrateButton.setDisabled(true),
                LöschenButton.setDisabled(true)
            );

            message.Bearbeiten({
                components: [disabledRow],
                embeds: [configEmbed.setFooter({ text: 'Konfigurationssitzung abgelaufen. Führe den Befehl erneut aus, um Änderungen vorzunehmen.' })]
            }).catch(() => {});
        });

    } catch (error) {
        if (error instanceof TitanBotError) {
            throw error;
        }
        throw new TitanBotError(
            `Config failed: ${error.message}`,
            ErrorTypes.DATABASE,
            'Konfiguration konnte nicht geladen werden.'
        );
    }
}

async function handleNameTemplateModal(interaction, triggerChannel, currentConfig, client) {
    try {
        const TEMPLATE_OPTIONS = [
            { label: "{username}'s Room (Default)", value: "{username}'s Room" },
            { label: "{username}'s Channel",        value: "{username}'s Channel" },
            { label: "{username}'s Lounge",         value: "{username}'s Lounge" },
            { label: "{username}'s Space",          value: "{username}'s Space" },
            { label: "{displayName}'s Room",        value: "{displayName}'s Room" },
            { label: "{username}'s VC",             value: "{username}'s VC" },
            { label: "{username}'s Music Room",  value: "{username}'s Music Room" },
            { label: "{username}'s Gaming Room", value: "{username}'s Gaming Room" },
            { label: "{username}'s Chat Room",   value: "{username}'s Chat Room" },
            { label: "{username}'s Private Room",   value: "{username}'s Private Room" },
        ];

        const currentTemplate = currentConfig.channelConfig?.nameTemplate
            || currentConfig.channelNameTemplate
            || "{username}'s Room";

        const templateSelect = new StringSelectMenuBuilder()
            .setCustomId('template')
            .setPlaceholder('Wähle eine Namenvorlage...')
            .setOptions(
                TEMPLATE_OPTIONS.map(o => ({
                    label: o.label,
                    value: o.value,
                    default: o.value === currentTemplate,
                })),
            );

        const templateLabel = new LabelBuilder()
            .setLabel('Kanalname-Vorlage')
            .setStringSelectMenuComponent(templateSelect);

        const modal = new ModalBuilder()
            .setCustomId(`jtc_name_modal_${triggerChannel.id}`)
            .setTitle('Kanalname-Vorlage')
            .addLabelComponents(templateLabel);

        await interaction.showModal(modal);

        const modalSubmission = await interaction.awaitModalAbsenden({
            filter: (i) => i.customId === `jtc_name_modal_${triggerChannel.id}` && i.user.id === interaction.user.id,
            time: 60000
        });

        if (!hasManageGuildPermission(modalSubmission.member)) {
            await modalSubmission.reply({
                content: '❌ You need **Manage Server** permission to modify these settings.',
                flags: MessageFlags.Ephemeral
            });
            return;
        }

        const [newTemplate] = modalSubmission.fields.getStringSelectValues('template');

        await AktualisierenChannelConfig(client, interaction.guild.id, triggerChannel.id, {
            nameTemplate: newTemplate
        });

        await logConfigurationChange(client, interaction.guild.id, interaction.user.id, 'Aktualisierend channel name template', {
            channelId: triggerChannel.id,
            newTemplate
        });

        await modalSubmission.reply({
            embeds: [successEmbed('Aktualisiert', `Kanalname-Vorlage geändert zu \`${newTemplate}\``)],
            flags: MessageFlags.Ephemeral
        });

    } catch (error) {
        if (error.code === 'INTERACTION_COLLECTOR_ERROR') {
            return;
        }
        if (error instanceof TitanBotError) {
            throw error;
        }
        logger.error('Unexpected error in name template modal:', error);
        throw new TitanBotError(
            `Modal error: ${error.message}`,
            ErrorTypes.UNKNOWN,
            'Ein Fehler ist aufgetreten beim Aktualisieren der Vorlage.'
        );
    }
}

async function handleUserLimitModal(interaction, triggerChannel, currentConfig, client) {
    try {
        const currentLimit = currentConfig.channelConfig?.userLimit ?? currentConfig.userLimit ?? 0;

        const modal = new ModalBuilder()
            .setCustomId(`jtc_limit_modal_${triggerChannel.id}`)
            .setTitle('Benutzerlimit konfigurieren')
            .addComponents(
                new ActionRowBuilder().addComponents(
                    new TextInputBuilder()
                        .setCustomId('user_limit')
                        .setLabel('Gib das Benutzerlimit ein (0-99, 0 = unbegrenzt)')
                        .setPlaceholder('Gib eine Zahl zwischen 0 und 99 ein')
                        .setStyle(TextInputStyle.Short)
                        .setRequired(true)
                        .setMinLength(1)
                        .setMaxLength(2)
                        .setValue(currentLimit.toString())
                )
            );

        await interaction.showModal(modal);

        const modalSubmission = await interaction.awaitModalAbsenden({
            filter: (i) => i.customId === `jtc_limit_modal_${triggerChannel.id}` && i.user.id === interaction.user.id,
            time: 60000
        });

        if (!hasManageGuildPermission(modalSubmission.member)) {
            await modalSubmission.reply({
                content: '❌ Du benötigst die Berechtigung **Server verwalten**, um diese Einstellungen zu ändern.',
                flags: MessageFlags.Ephemeral
            });
            return;
        }

        const userInput = modalSubmission.fields.getTextInputValue('user_limit').trim();

        await AktualisierenChannelConfig(client, interaction.guild.id, triggerChannel.id, {
            userLimit: parseInt(userInput)
        });

        await logConfigurationChange(client, interaction.guild.id, interaction.user.id, 'Aktualisierend user limit', {
            channelId: triggerChannel.id,
            userLimit: parseInt(userInput)
        });

        await modalSubmission.reply({
            embeds: [successEmbed('Aktualisiert', `Benutzerlimit geändert zu ${parseInt(userInput) === 0 ? 'Unbegrenzt' : parseInt(userInput) + ' Benutzer'}`)],
            flags: MessageFlags.Ephemeral
        });

    } catch (error) {
        if (error.code === 'INTERACTION_COLLECTOR_ERROR') {
            return;
        }
        if (error instanceof TitanBotError) {
            throw error;
        }
        logger.error('Unexpected error in user limit modal:', error);
        throw new TitanBotError(
            `Modal error: ${error.message}`,
            ErrorTypes.UNKNOWN,
            'Ein Fehler ist aufgetreten beim Aktualisieren des Benutzerlimits.'
        );
    }
}

async function handleBitrateModal(interaction, triggerChannel, currentConfig, client) {
    try {
        const currentBitrate = ((currentConfig.channelConfig.bitrate ?? currentConfig.bitrate ?? 64000) / 1000);

        const modal = new ModalBuilder()
            .setCustomId(`jtc_bitrate_modal_${triggerChannel.id}`)
            .setTitle('Bitrate konfigurieren')
            .addComponents(
                new ActionRowBuilder().addComponents(
                    new TextInputBuilder()
                        .setCustomId('bitrate')
                        .setLabel('Gib Bitrate in kbps ein (8-384)')
                        .setPlaceholder('Gib eine Zahl zwischen 8 und 384 ein')
                        .setStyle(TextInputStyle.Short)
                        .setRequired(true)
                        .setMinLength(1)
                        .setMaxLength(3)
                        .setValue(currentBitrate.toString())
                )
            );

        await interaction.showModal(modal);

        const modalSubmission = await interaction.awaitModalAbsenden({
            filter: (i) => i.customId === `jtc_bitrate_modal_${triggerChannel.id}` && i.user.id === interaction.user.id,
            time: 60000
        });

        if (!hasManageGuildPermission(modalSubmission.member)) {
            await modalSubmission.reply({
                content: '❌ Du benötigst die Berechtigung **Server verwalten**, um diese Einstellungen zu ändern.',
                flags: MessageFlags.Ephemeral
            });
            return;
        }

        const userInput = modalSubmission.fields.getTextInputValue('bitrate').trim();

        await AktualisierenChannelConfig(client, interaction.guild.id, triggerChannel.id, {
            bitrate: parseInt(userInput) * 1000
        });

        await logConfigurationChange(client, interaction.guild.id, interaction.user.id, 'Aktualisierend bitrate', {
            channelId: triggerChannel.id,
            bitrate: parseInt(userInput)
        });

        await modalSubmission.reply({
            embeds: [successEmbed('Aktualisiert', `Bitrate geändert zu ${parseInt(userInput)} kbps`)],
            flags: MessageFlags.Ephemeral
        });

    } catch (error) {
        if (error.code === 'INTERACTION_COLLECTOR_ERROR') {
            return;
        }
        if (error instanceof TitanBotError) {
            throw error;
        }
        logger.error('Unexpected error in bitrate modal:', error);
        throw new TitanBotError(
            `Modal error: ${error.message}`,
            ErrorTypes.UNKNOWN,
            'Ein Fehler ist aufgetreten beim Aktualisieren der Bitrate.'
        );
    }
}

async function handleChannelDeletion(interaction, triggerChannel, currentConfig, client) {
    try {
        const BestätigenRow = new ActionRowBuilder().addComponents(
            new ButtonBuilder()
                .setCustomId(`jtc_Löschen_Bestätigen_${triggerChannel.id}`)
                .setLabel('🗑️ Ja, Löschen')
                .setStyle(ButtonStyle.Danger),
            new ButtonBuilder()
                .setCustomId(`jtc_Löschen_Abbrechen_${triggerChannel.id}`)
                .setLabel('❌ Abbrechen')
                .setStyle(ButtonStyle.Secondary)
        );

        await InteractionHelper.safeReply(interaction, {
            embeds: [warningEmbed('Löschung bestätigen', `Bist du sicher, dass du **${triggerChannel.name}** aus dem Bei Beitritt erstellte Kanäle-System entfernen möchtest?\n\nDiese Aktion kann nicht rückgängig gemacht werden.`)],
            components: [BestätigenRow],
            flags: MessageFlags.Ephemeral
        });

        const message = await interaction.fetchReply();
        const LöschenCollector = message.ErstellenMessageComponentCollector({
            componentType: ComponentType.Button,
            filter: (i) => i.user.id === interaction.user.id && 
                          (i.customId === `jtc_Löschen_Bestätigen_${triggerChannel.id}` || 
                           i.customId === `jtc_Löschen_Abbrechen_${triggerChannel.id}`),
            time: 600_000,
            max: 1
        });

        LöschenCollector.on('collect', async (buttonInteraction) => {
            try {
                
                if (!hasManageGuildPermission(buttonInteraction.member)) {
                    await buttonInteraction.reply({
                        content: '❌ Du benötigst die Berechtigung **Server verwalten**, um Kanäle zu entfernen.',
                        flags: MessageFlags.Ephemeral
                    });
                    return;
                }

                if (buttonInteraction.customId === `jtc_Löschen_Bestätigen_${triggerChannel.id}`) {
                    
                    await removeTriggerChannel(client, interaction.guild.id, triggerChannel.id);

                    await logConfigurationChange(client, interaction.guild.id, interaction.user.id, 'Removed Join to Erstellen trigger', {
                        channelId: triggerChannel.id,
                        channelName: triggerChannel.name
                    });

                    try {
                        if (triggerChannel.members.size === 0) {
                            await triggerChannel.Löschen('Join to Erstellen trigger removed by administrator');
                        }
                    } catch (LöschenError) {
                        logger.warn(`Could not Löschen channel ${triggerChannel.id}: ${LöschenError.message}`);
                        
                    }

                    await buttonInteraction.Aktualisieren({
                        embeds: [successEmbed('Entfernt', `**${triggerChannel.name}** wurde aus dem Bei Beitritt erstellte Kanäle-System entfernt.`)],
                        components: []
                    });

                } else {
                    await buttonInteraction.Aktualisieren({
                        embeds: [successEmbed('Abgebrochen', 'Kanal-Entfernung wurde abgebrochen.')],
                        components: []
                    });
                }
            } catch (collectError) {
                logger.error('Error handling Löschen Bestätigenation:', collectError);
                await buttonInteraction.reply({
                    content: '❌ Ein Fehler ist aufgetreten bei der Verarbeitung deiner Anfrage.',
                    flags: MessageFlags.Ephemeral
                }).catch(() => {});
            }
        });

        LöschenCollector.on('end', (collected, reason) => {
            if (reason === 'time' && collected.size === 0) {
                message.Bearbeiten({ components: [] }).catch(() => {});
            }
        });

    } catch (error) {
        if (error instanceof TitanBotError) {
            throw error;
        }
        logger.error('Unexpected error in handleChannelDeletion:', error);
        throw new TitanBotError(
            `Deletion error: ${error.message}`,
            ErrorTypes.UNKNOWN,
            'Ein Fehler ist aufgetreten beim Entfernen des Kanals.'
        );
    }
}


