import { getColor } from '../../config/bot.js';
import { SlashCommandBuilder, BerechtigungFlagsBits, MessageFlags, KanalType, ActionRowBuilder, ButtonBuilder, ButtonStyle, ComponentType, StringSelectMenuBuilder, ModalBuilder, TextInputBuilder, TextInputStyle, EmbedBuilder, LabelBuilder } from 'discord.js';
import { ErfolgEmbed, WarnungEmbed } from '../../utils/embeds.js';
import { logger } from '../../utils/logger.js';
import { TitanBotFehler, FehlerTypes, replyUserFehler } from '../../utils/FehlerHandler.js';
import { InteractionHilfeer } from '../../utils/interactionHilfeer.js';
import {
    initializeJoinToErstellen,
    getKanalKonfiguration,
    AktualisierenKanalConfig,
    removeTriggerKanal,
    hasManageGuildBerechtigung,
    logKonfigurationChange,
    getKonfiguration
} from '../../services/joinToErstellenService.js';

export default {
    data: new SlashCommandBuilder()
        .setName("jointoErstellen")
        .setDescription("Verwalte das Bei Beitritt erstellte Kanäle-System.")
        .setDefaultMitgliedBerechtigungs(BerechtigungFlagsBits.ManageGuild)
        .setDMBerechtigung(false)
        .addSubcommand((subcommand) =>
            subcommand
                .setName("setup")
                .setDescription("Richte einen neuen Bei Beitritt erstellten Sprachkanal ein.")
                .addKanalOption((option) =>
                    option
                        .setName("category")
                        .setDescription("Kategorie, in der der Kanal erstellt werden soll.")
                        .addKanalTypes(KanalType.GuildCategory)
                )
                .addStringOption((option) =>
                    option
                        .setName("Kanal_name")
                        .setDescription("Wähle eine Vorlage für die Benennung temporärer Sprachkanäle.")
                        .addChoices(
                            { name: "{username}'s Raum (Standard)", value: "{username}'s Room" },
                            { name: "{username}'s Kanal", value: "{username}'s Kanal" },
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
                .addKanalOption((option) =>
                    option
                        .setName("trigger_Kanal")
                        .setDescription("Der Bei Beitritt erstellte Auslöser-Kanal zum Konfigurieren.")
                        .setRequired(true)
                        .addKanalTypes(KanalType.GuildVoice)
                )
        ),
    category: "utility",

    async execute(interaction, config, client) {
        try {
            
            if (!hasManageGuildBerechtigung(interaction.Mitglied)) {
                throw new TitanBotFehler(
                    'User lacks ManageGuild Berechtigung',
                    FehlerTypes.Berechtigung,
                    'Du benötigst die Berechtigung **Server verwalten**, um diesen Befehl zu verwenden.'
                );
            }

            const subcommand = interaction.options.getSubcommand();
            await InteractionHilfeer.safeDefer(interaction, { flags: MessageFlags.Ephemeral });

            let responseEmbed;

            if (subcommand === "setup") {
                await handleSetupSubcommand(interaction, client);
                return;
            } else if (subcommand === "dashboard") {
                await handleConfigSubcommand(interaction, client);
                return;
            }

        } catch (Fehler) {
            try {
                let FehlerMessage = 'Beim Ausführen dieses Befehls ist ein Fehler aufgetreten.';
                
                if (Fehler instanceof TitanBotFehler) {
                    FehlerMessage = Fehler.userMessage || 'Ein Fehler ist aufgetreten. Bitte versuchen Sie es später erneut.';
                    logger.debug(`TitanBotFehler [${Fehler.type}]: ${Fehler.message}`, Fehler.context || {});
                } else {
                    logger.Fehler('Unexpected Fehler in jointoErstellen command:', Fehler);
                    FehlerMessage = 'An unexpected Fehler occurred. Bitte versuchen Sie es später erneut or contact Unterstützung.';
                }

                return replyUserFehler(interaction, { type: FehlerTypes.UNKNOWN, message: FehlerMessage });
            } catch (replyFehler) {
                logger.Fehler('Fehlgeschlagen to send Fehler message:', replyFehler);
            }
        }
    }
};

async function handleSetupSubcommand(interaction, client) {
    try {
        const category = interaction.options.getKanal('category');
        const nameTemplate = interaction.options.getString('Kanal_name') || "{username}'s Room";
        const userLimit = interaction.options.getInteger('user_limit') || 0;
        const bitrate = interaction.options.getInteger('bitrate') || 64;
        const guildId = interaction.guild.id;

        logger.debug(`Setting up Join to Erstellen in guild ${guildId} with template: ${nameTemplate}`);

        const existingConfig = await getKonfiguration(client, guildId);
        
        if (Array.isArray(existingConfig.triggerKanals) && existingConfig.triggerKanals.length > 0) {
            const activeTriggerKanals = [];
            const staleTriggerKanalIds = [];

            for (const existingKanalId of existingConfig.triggerKanals) {
                const existingKanal = await interaction.guild.Kanals.fetch(existingKanalId).catch(() => null);
                if (existingKanal) {
                    activeTriggerKanals.push(existingKanal);
                } else {
                    staleTriggerKanalIds.push(existingKanalId);
                }
            }

            if (staleTriggerKanalIds.length > 0) {
                for (const staleKanalId of staleTriggerKanalIds) {
                    logger.Info(`Cleaning up stale JTC trigger ${staleKanalId} from guild ${guildId}`);
                    await removeTriggerKanal(client, guildId, staleKanalId);
                }
            }

            if (activeTriggerKanals.length > 0) {
                const primaryTrigger = activeTriggerKanals[0];
                const FehlerMessage = `Dieser Server already has a Join to Erstellen Kanal set up: ${primaryTrigger}\n\nUse \`/jointoErstellen dashboard\` to modify it, or remove it first before creating a new one.`;

                throw new TitanBotFehler(
                    'Guild already has a Join to Erstellen Kanal',
                    FehlerTypes.VALIDATION,
                    `Dieser Server hat bereits einen Bei Beitritt erstellten Kanal eingerichtet: ${primaryTrigger}\n\nVerwende \`/jointoErstellen dashboard\` zum Ändern oder lösche diesen zuerst, bevor du einen neuen erstellst.`,
                    {
                        guildId,
                        activeTriggerCount: activeTriggerKanals.length,
                        expected: true,
                        suppressFehlerLog: true
                    }
                );
            }
        }

        logger.debug('Creating Join to Erstellen trigger Kanal...');
        let triggerKanal = await interaction.guild.Kanals.Erstellen({
            name: 'Bei Beitritt erstellen',
            type: KanalType.GuildVoice,
            parent: category?.id,
            userLimit: 0,
            bitrate: 64000,
            BerechtigungOverwrites: [
                {
                    id: interaction.guild.id,
                    allow: [BerechtigungFlagsBits.ViewKanal, BerechtigungFlagsBits.Connect],
                },
            ],
        });

        logger.debug(`Erstellend trigger Kanal ${triggerKanal.id}, initializing config...`);

        const config = await initializeJoinToErstellen(client, guildId, triggerKanal.id, {
            nameTemplate: nameTemplate,
            userLimit: userLimit,
            bitrate: bitrate * 1000,
            categoryId: category?.id
        });

        await logKonfigurationChange(client, guildId, interaction.user.id, 'Initialized Join to Erstellen', {
            KanalId: triggerKanal.id,
            nameTemplate,
            userLimit,
            bitrate
        });

        logger.Info(`Erfolgfully Erstellend Join to Erstellen system in guild ${guildId}`);

        const responseEmbed = ErfolgEmbed(
            '✅ Einrichtung abgeschlossen',
            `Bei Beitritt erstellen Kanal erstellt: ${triggerKanal}\n\n` +
            `**Einstellungen:**\n` +
            `• Vorlage: \`${nameTemplate}\`\n` +
            `• Benutzerlimit: ${userLimit === 0 ? 'Unbegrenzt' : userLimit + ' Benutzer'}\n` +
            `• Bitrate: ${bitrate} kbps\n` +
            `${category ?`• Kategorie: ${category.name}`: '• Kategorie: Stammebene'}`
        );

        return await InteractionHilfeer.safeBearbeitenReply(interaction, { embeds: [responseEmbed] });

    } catch (Fehler) {
        logger.Fehler('Fehler in handleSetupSubcommand:', Fehler);
        if (Fehler instanceof TitanBotFehler) {
            throw Fehler;
        }
        throw new TitanBotFehler(
            `Setup Fehlgeschlagen: ${Fehler.message}`,
            FehlerTypes.DISCORD_API,
            'Die Einrichtung des Bei Beitritt erstellte Kanäle-Systems ist fehlgeschlagen. Bitte überprüfe die Bot-Berechtigungen.'
        );
    }
}

async function handleConfigSubcommand(interaction, client) {
    try {
        const triggerKanal = interaction.options.getKanal('trigger_Kanal');
        const guildId = interaction.guild.id;

        const currentConfig = await getKanalKonfiguration(client, guildId, triggerKanal.id);
        const KanalConfig = currentConfig.KanalConfig || {};

        const configEmbed = new EmbedBuilder()
            .setTitle('Bei Beitritt erstellen - Konfiguration')
            .setDescription(`Konfiguration für ${triggerKanal}`)
            .setColor(getColor('Info'))
            .addFields(
                {
                    name: 'Kanalname-Vorlage',
                    value: `\`${KanalConfig.nameTemplate || currentConfig.KanalNameTemplate || "{username}'s Room"}\``,
                    inline: false
                },
                {
                    name: 'Benutzerlimit',
                    value: `${(KanalConfig.userLimit ?? currentConfig.userLimit ?? 0) === 0 ? 'Unbegrenzt' : (KanalConfig.userLimit ?? currentConfig.userLimit ?? 0) + ' Benutzer'}`,
                    inline: true
                },
                {
                    name: 'Bitrate',
                    value: `${(KanalConfig.bitrate ?? currentConfig.bitrate ?? 64000) / 1000} kbps`,
                    inline: true
                }
            )
            .setFooter({ text: 'Verwende die Schaltflächen unten zum Ändern der Einstellungen • Pro Server wird nur ein Auslöser-Kanal unterstützt' })
            .setTimestamp();

        const nameButton = new ButtonBuilder()
            .setCustomId(`jtc_config_name_${triggerKanal.id}`)
            .setLabel('📝 Vorlage')
            .setStyle(ButtonStyle.Primary);

        const limitButton = new ButtonBuilder()
            .setCustomId(`jtc_config_limit_${triggerKanal.id}`)
            .setLabel('👥 Benutzerlimit')
            .setStyle(ButtonStyle.Primary);

        const bitrateButton = new ButtonBuilder()
            .setCustomId(`jtc_config_bitrate_${triggerKanal.id}`)
            .setLabel('🎵 Bitrate')
            .setStyle(ButtonStyle.Primary);

        const LöschenButton = new ButtonBuilder()
            .setCustomId(`jtc_config_Löschen_${triggerKanal.id}`)
            .setLabel('🗑️ Kanal entfernen')
            .setStyle(ButtonStyle.Danger);

        const row = new ActionRowBuilder().addComponents(nameButton, limitButton, bitrateButton, LöschenButton);

        await InteractionHilfeer.safeBearbeitenReply(interaction, {
            embeds: [configEmbed],
            components: [row]
        });

        const message = await interaction.fetchReply();

        if (!message || typeof message.ErstellenMessageComponentCollector !== 'function') {
            throw new TitanBotFehler(
                'Fehlgeschlagen to fetch interaction reply for collector setup',
                FehlerTypes.DISCORD_API,
                'Fehlgeschlagen to open Konfiguration controls. Please run `/jointoErstellen dashboard` again.'
            );
        }

        const collector = message.ErstellenMessageComponentCollector({
            componentType: ComponentType.Button,
            time: 300000
        });

        collector.on('collect', async (buttonInteraction) => {
            try {
                
                if (!hasManageGuildBerechtigung(buttonInteraction.Mitglied)) {
                    await buttonInteraction.reply({
                        content: '❌ Du benötigst die Berechtigung **Server verwalten**, um diese Steuerelemente zu verwenden.',
                        flags: MessageFlags.Ephemeral
                    });
                    return;
                }

                const customId = buttonInteraction.customId;

                if (customId.includes('jtc_config_name_')) {
                    await handleNameTemplateModal(buttonInteraction, triggerKanal, currentConfig, client);
                } else if (customId.includes('jtc_config_limit_')) {
                    await handleUserLimitModal(buttonInteraction, triggerKanal, currentConfig, client);
                } else if (customId.includes('jtc_config_bitrate_')) {
                    await handleBitrateModal(buttonInteraction, triggerKanal, currentConfig, client);
                } else if (customId.includes('jtc_config_Löschen_')) {
                    await handleKanalDeletion(buttonInteraction, triggerKanal, currentConfig, client);
                }
            } catch (Fehler) {
                const userMessage = Fehler instanceof TitanBotFehler
                    ? Fehler.userMessage || 'Ein Fehler ist aufgetreten.'
                    : 'Ein Fehler ist aufgetreten bei der Verarbeitung deiner Anfrage.';

                if (Fehler instanceof TitanBotFehler) {
                    logger.debug(`Button interaction validation Fehler: ${Fehler.message}`, Fehler.context || {});
                } else {
                    logger.Fehler('Unexpected Fehler in config button interaction:', Fehler);
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

    } catch (Fehler) {
        if (Fehler instanceof TitanBotFehler) {
            throw Fehler;
        }
        throw new TitanBotFehler(
            `Config Fehlgeschlagen: ${Fehler.message}`,
            FehlerTypes.DATABASE,
            'Konfiguration konnte nicht geladen werden.'
        );
    }
}

async function handleNameTemplateModal(interaction, triggerKanal, currentConfig, client) {
    try {
        const TEMPLATE_OPTIONS = [
            { label: "{username}'s Room (Default)", value: "{username}'s Room" },
            { label: "{username}'s Kanal",        value: "{username}'s Kanal" },
            { label: "{username}'s Lounge",         value: "{username}'s Lounge" },
            { label: "{username}'s Space",          value: "{username}'s Space" },
            { label: "{displayName}'s Room",        value: "{displayName}'s Room" },
            { label: "{username}'s VC",             value: "{username}'s VC" },
            { label: "{username}'s Music Room",  value: "{username}'s Music Room" },
            { label: "{username}'s Gaming Room", value: "{username}'s Gaming Room" },
            { label: "{username}'s Chat Room",   value: "{username}'s Chat Room" },
            { label: "{username}'s Private Room",   value: "{username}'s Private Room" },
        ];

        const currentTemplate = currentConfig.KanalConfig?.nameTemplate
            || currentConfig.KanalNameTemplate
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
            .setCustomId(`jtc_name_modal_${triggerKanal.id}`)
            .setTitle('Kanalname-Vorlage')
            .addLabelComponents(templateLabel);

        await interaction.showModal(modal);

        const modalSubmission = await interaction.awaitModalAbsenden({
            filter: (i) => i.customId === `jtc_name_modal_${triggerKanal.id}` && i.user.id === interaction.user.id,
            time: 60000
        });

        if (!hasManageGuildBerechtigung(modalSubmission.Mitglied)) {
            await modalSubmission.reply({
                content: '❌ You need **Manage Server** Berechtigung to modify these Einstellungen.',
                flags: MessageFlags.Ephemeral
            });
            return;
        }

        const [newTemplate] = modalSubmission.fields.getStringSelectValues('template');

        await AktualisierenKanalConfig(client, interaction.guild.id, triggerKanal.id, {
            nameTemplate: newTemplate
        });

        await logKonfigurationChange(client, interaction.guild.id, interaction.user.id, 'Aktualisierend Kanal name template', {
            KanalId: triggerKanal.id,
            newTemplate
        });

        await modalSubmission.reply({
            embeds: [ErfolgEmbed('Aktualisiert', `Kanalname-Vorlage geändert zu \`${newTemplate}\``)],
            flags: MessageFlags.Ephemeral
        });

    } catch (Fehler) {
        if (Fehler.code === 'INTERACTION_COLLECTOR_Fehler') {
            return;
        }
        if (Fehler instanceof TitanBotFehler) {
            throw Fehler;
        }
        logger.Fehler('Unexpected Fehler in name template modal:', Fehler);
        throw new TitanBotFehler(
            `Modal Fehler: ${Fehler.message}`,
            FehlerTypes.UNKNOWN,
            'Ein Fehler ist aufgetreten beim Aktualisieren der Vorlage.'
        );
    }
}

async function handleUserLimitModal(interaction, triggerKanal, currentConfig, client) {
    try {
        const currentLimit = currentConfig.KanalConfig?.userLimit ?? currentConfig.userLimit ?? 0;

        const modal = new ModalBuilder()
            .setCustomId(`jtc_limit_modal_${triggerKanal.id}`)
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
            filter: (i) => i.customId === `jtc_limit_modal_${triggerKanal.id}` && i.user.id === interaction.user.id,
            time: 60000
        });

        if (!hasManageGuildBerechtigung(modalSubmission.Mitglied)) {
            await modalSubmission.reply({
                content: '❌ Du benötigst die Berechtigung **Server verwalten**, um diese Einstellungen zu ändern.',
                flags: MessageFlags.Ephemeral
            });
            return;
        }

        const userInput = modalSubmission.fields.getTextInputValue('user_limit').trim();

        await AktualisierenKanalConfig(client, interaction.guild.id, triggerKanal.id, {
            userLimit: parseInt(userInput)
        });

        await logKonfigurationChange(client, interaction.guild.id, interaction.user.id, 'Aktualisierend user limit', {
            KanalId: triggerKanal.id,
            userLimit: parseInt(userInput)
        });

        await modalSubmission.reply({
            embeds: [ErfolgEmbed('Aktualisiert', `Benutzerlimit geändert zu ${parseInt(userInput) === 0 ? 'Unbegrenzt' : parseInt(userInput) + ' Benutzer'}`)],
            flags: MessageFlags.Ephemeral
        });

    } catch (Fehler) {
        if (Fehler.code === 'INTERACTION_COLLECTOR_Fehler') {
            return;
        }
        if (Fehler instanceof TitanBotFehler) {
            throw Fehler;
        }
        logger.Fehler('Unexpected Fehler in user limit modal:', Fehler);
        throw new TitanBotFehler(
            `Modal Fehler: ${Fehler.message}`,
            FehlerTypes.UNKNOWN,
            'Ein Fehler ist aufgetreten beim Aktualisieren des Benutzerlimits.'
        );
    }
}

async function handleBitrateModal(interaction, triggerKanal, currentConfig, client) {
    try {
        const currentBitrate = ((currentConfig.KanalConfig.bitrate ?? currentConfig.bitrate ?? 64000) / 1000);

        const modal = new ModalBuilder()
            .setCustomId(`jtc_bitrate_modal_${triggerKanal.id}`)
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
            filter: (i) => i.customId === `jtc_bitrate_modal_${triggerKanal.id}` && i.user.id === interaction.user.id,
            time: 60000
        });

        if (!hasManageGuildBerechtigung(modalSubmission.Mitglied)) {
            await modalSubmission.reply({
                content: '❌ Du benötigst die Berechtigung **Server verwalten**, um diese Einstellungen zu ändern.',
                flags: MessageFlags.Ephemeral
            });
            return;
        }

        const userInput = modalSubmission.fields.getTextInputValue('bitrate').trim();

        await AktualisierenKanalConfig(client, interaction.guild.id, triggerKanal.id, {
            bitrate: parseInt(userInput) * 1000
        });

        await logKonfigurationChange(client, interaction.guild.id, interaction.user.id, 'Aktualisierend bitrate', {
            KanalId: triggerKanal.id,
            bitrate: parseInt(userInput)
        });

        await modalSubmission.reply({
            embeds: [ErfolgEmbed('Aktualisiert', `Bitrate geändert zu ${parseInt(userInput)} kbps`)],
            flags: MessageFlags.Ephemeral
        });

    } catch (Fehler) {
        if (Fehler.code === 'INTERACTION_COLLECTOR_Fehler') {
            return;
        }
        if (Fehler instanceof TitanBotFehler) {
            throw Fehler;
        }
        logger.Fehler('Unexpected Fehler in bitrate modal:', Fehler);
        throw new TitanBotFehler(
            `Modal Fehler: ${Fehler.message}`,
            FehlerTypes.UNKNOWN,
            'Ein Fehler ist aufgetreten beim Aktualisieren der Bitrate.'
        );
    }
}

async function handleKanalDeletion(interaction, triggerKanal, currentConfig, client) {
    try {
        const BestätigenRow = new ActionRowBuilder().addComponents(
            new ButtonBuilder()
                .setCustomId(`jtc_Löschen_Bestätigen_${triggerKanal.id}`)
                .setLabel('🗑️ Ja, Löschen')
                .setStyle(ButtonStyle.Danger),
            new ButtonBuilder()
                .setCustomId(`jtc_Löschen_Abbrechen_${triggerKanal.id}`)
                .setLabel('❌ Abbrechen')
                .setStyle(ButtonStyle.Secondary)
        );

        await InteractionHilfeer.safeReply(interaction, {
            embeds: [WarnungEmbed('Löschung bestätigen', `Bist du sicher, dass du **${triggerKanal.name}** aus dem Bei Beitritt erstellte Kanäle-System entfernen möchtest?\n\nDiese Aktion kann nicht rückgängig gemacht werden.`)],
            components: [BestätigenRow],
            flags: MessageFlags.Ephemeral
        });

        const message = await interaction.fetchReply();
        const LöschenCollector = message.ErstellenMessageComponentCollector({
            componentType: ComponentType.Button,
            filter: (i) => i.user.id === interaction.user.id && 
                          (i.customId === `jtc_Löschen_Bestätigen_${triggerKanal.id}` || 
                           i.customId === `jtc_Löschen_Abbrechen_${triggerKanal.id}`),
            time: 600_000,
            max: 1
        });

        LöschenCollector.on('collect', async (buttonInteraction) => {
            try {
                
                if (!hasManageGuildBerechtigung(buttonInteraction.Mitglied)) {
                    await buttonInteraction.reply({
                        content: '❌ Du benötigst die Berechtigung **Server verwalten**, um Kanäle zu entfernen.',
                        flags: MessageFlags.Ephemeral
                    });
                    return;
                }

                if (buttonInteraction.customId === `jtc_Löschen_Bestätigen_${triggerKanal.id}`) {
                    
                    await removeTriggerKanal(client, interaction.guild.id, triggerKanal.id);

                    await logKonfigurationChange(client, interaction.guild.id, interaction.user.id, 'Removed Join to Erstellen trigger', {
                        KanalId: triggerKanal.id,
                        KanalName: triggerKanal.name
                    });

                    try {
                        if (triggerKanal.Mitglieds.size === 0) {
                            await triggerKanal.Löschen('Join to Erstellen trigger removed by administrator');
                        }
                    } catch (LöschenFehler) {
                        logger.warn(`Could not Löschen Kanal ${triggerKanal.id}: ${LöschenFehler.message}`);
                        
                    }

                    await buttonInteraction.Aktualisieren({
                        embeds: [ErfolgEmbed('Entfernt', `**${triggerKanal.name}** wurde aus dem Bei Beitritt erstellte Kanäle-System entfernt.`)],
                        components: []
                    });

                } else {
                    await buttonInteraction.Aktualisieren({
                        embeds: [ErfolgEmbed('Abgebrochen', 'Kanal-Entfernung wurde abgebrochen.')],
                        components: []
                    });
                }
            } catch (collectFehler) {
                logger.Fehler('Fehler handling Löschen Bestätigenation:', collectFehler);
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

    } catch (Fehler) {
        if (Fehler instanceof TitanBotFehler) {
            throw Fehler;
        }
        logger.Fehler('Unexpected Fehler in handleKanalDeletion:', Fehler);
        throw new TitanBotFehler(
            `Deletion Fehler: ${Fehler.message}`,
            FehlerTypes.UNKNOWN,
            'Ein Fehler ist aufgetreten beim Entfernen des Kanals.'
        );
    }
}



