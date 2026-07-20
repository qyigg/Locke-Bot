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
                `${triggerKanal} ist kein konfigurierter Bei-Beitritt-erstellen-Auslöser-Kanal.`
            );
        }

        const embed = new EmbedBuilder()
            .setTitle('Bei Beitritt erstellen — Konfiguration')
            .setDescription(`Einstellungen für ${triggerKanal}`)
            .setColor(getColor('Info'))
            .addFields(
                {
                    name: 'Aktuelle Kanalname-Vorlage',
                    value: `\`${currentConfig.KanalOptions?.[triggerKanal.id]?.nameTemplate || currentConfig.KanalNameTemplate}\``,
                    inline: false
                },
                {
                    name: 'Aktuelles Benutzerlimit',
                    value: `${currentConfig.KanalOptions?.[triggerKanal.id]?.userLimit || currentConfig.userLimit === 0 ? 'Kein Limit' : currentConfig.userLimit + ' Benutzer'}`,
                    inline: true
                },
                {
                    name: 'Aktuelle Bitrate',
                    value: `${(currentConfig.KanalOptions?.[triggerKanal.id]?.bitrate || currentConfig.bitrate) / 1000} kbps`,
                    inline: true
                }
            )
            .setFooter({ text: 'Wähle unten eine Option zum Konfigurieren' })
            .setTimestamp();

        const selectMenu = new StringSelectMenuBuilder()
            .setCustomId(`jointoErstellen_config_${triggerKanal.id}`)
            .setPlaceholder('Konfigurationsoption auswählen')
            .addOptions(
                new StringSelectMenuOptionBuilder()
                    .setLabel('Kanalname-Vorlage ändern')
                    .setDescription('Vorlage für temporäre Kanalnamen anpassen')
                    .setValue('name_template'),
                new StringSelectMenuOptionBuilder()
                    .setLabel('Benutzerlimit ändern')
                    .setDescription('Maximale Benutzer pro temporärem Kanal festlegen')
                    .setValue('user_limit'),
                new StringSelectMenuOptionBuilder()
                    .setLabel('Bitrate ändern')
                    .setDescription('Audioqualität für temporäre Kanäle anpassen')
                    .setValue('bitrate'),
                new StringSelectMenuOptionBuilder()
                    .setLabel('Diesen Auslöser-Kanal entfernen')
                    .setDescription('Diesen Kanal aus dem Bei-Beitritt-erstellen-System entfernen')
                    .setValue('remove_trigger'),
                new StringSelectMenuOptionBuilder()
                    .setLabel('Aktuelle Einstellungen anzeigen')
                    .setDescription('Alle aktuellen Konfigurationsdetails anzeigen')
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
        .setTitle('Kanalname-Vorlage konfigurieren')
        .setDescription('Bitte gib die neue Kanalname-Vorlage ein.')
        .addFields(
            {
                name: 'Verfügbare Variablen',
                value: '• `{username}` – Benutzername\n• `{display_name}` – Anzeigename\n• `{user_tag}` – Tag (User#1234)\n• `{guild_name}` – Servername',
                inline: false
            },
            {
                name: 'Aktuelle Vorlage',
                value: `\`${currentConfig.KanalOptions?.[triggerKanal.id]?.nameTemplate || currentConfig.KanalNameTemplate}\``,
                inline: false
            }
        )
        .setColor(getColor('Info'))
        .setFooter({ text: 'Gib deine neue Vorlage im Chat ein' });

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
                    message: 'Die Vorlage muss zwischen 1 und 100 Zeichen lang sein.'
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
                embeds: [ErfolgEmbed('Vorlage aktualisiert', `Kanalname-Vorlage geändert zu \`${newTemplate}\``)],
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
                ? Fehler.userMessage || 'Die Kanalname-Vorlage konnte nicht aktualisiert werden.'
                : 'Die Kanalname-Vorlage konnte nicht aktualisiert werden.';
                
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
                message: 'Keine Antwort erhalten. Vorlage-Aktualisierung abgebrochen.'
            }).catch(() => {});
        }
    });
}

async function handleUserLimitChange(interaction, triggerKanal, currentConfig, client) {
    const embed = new EmbedBuilder()
        .setTitle('Benutzerlimit konfigurieren')
        .setDescription('Bitte gib das neue Benutzerlimit ein (0–99, wobei 0 = kein Limit).')
        .addFields(
            {
                name: 'Aktuelles Limit',
                value: `${currentConfig.KanalOptions?.[triggerKanal.id]?.userLimit || currentConfig.userLimit === 0 ? 'Kein Limit' : currentConfig.userLimit + ' Benutzer'}`,
                inline: false
            }
        )
        .setColor(getColor('Info'))
        .setFooter({ text: 'Gib das neue Limit im Chat ein' });

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
                    message: 'Das Benutzerlimit muss zwischen 0 und 99 liegen.'
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
                embeds: [ErfolgEmbed('Limit aktualisiert', `Benutzerlimit geändert zu ${newLimit === 0 ? 'Kein Limit' : newLimit + ' Benutzer'}`)],
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
                ? Fehler.userMessage || 'Das Benutzerlimit konnte nicht aktualisiert werden.'
                : 'Das Benutzerlimit konnte nicht aktualisiert werden.';
                
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
                message: 'Keine gültige Antwort erhalten. Aktualisierung abgebrochen.'
            }).catch(() => {});
        }
    });
}

async function handleBitrateChange(interaction, triggerKanal, currentConfig, client) {
    const embed = new EmbedBuilder()
        .setTitle('Bitrate konfigurieren')
        .setDescription('Bitte gib die neue Bitrate in kbps ein (8–384).')
        .addFields(
            {
                name: 'Aktuelle Bitrate',
                value: `${(currentConfig.KanalOptions?.[triggerKanal.id]?.bitrate || currentConfig.bitrate) / 1000} kbps`,
                inline: false
            },
            {
                name: 'Häufige Werte',
                value: '• 64 kbps – Normale Qualität\n• 96 kbps – Gute Qualität\n• 128 kbps – Hohe Qualität\n• 256 kbps – Sehr hohe Qualität',
                inline: false
            }
        )
        .setColor(getColor('Info'))
        .setFooter({ text: 'Gib die neue Bitrate im Chat ein' });

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
                    message: 'Die Bitrate muss zwischen 8 und 384 kbps liegen.'
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
                embeds: [ErfolgEmbed('Bitrate aktualisiert', `Bitrate geändert zu ${newBitrate} kbps`)],
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
                ? Fehler.userMessage || 'Die Bitrate konnte nicht aktualisiert werden.'
                : 'Die Bitrate konnte nicht aktualisiert werden.';
                
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
                message: 'Keine gültige Antwort erhalten. Aktualisierung abgebrochen.'
            }).catch(() => {});
        }
    });
}

async function handleRemoveTrigger(interaction, triggerKanal, currentConfig, client) {
    const embed = new EmbedBuilder()
        .setTitle('Auslöser-Kanal entfernen')
        .setDescription(`Bist du sicher, dass du ${triggerKanal} aus dem Bei-Beitritt-erstellen-System entfernen möchtest?`)
        .setColor('#ff6600')
        .setFooter({ text: 'Diese Aktion kann nicht rückgängig gemacht werden' });

    const row = new ActionRowBuilder().addComponents(
        new ButtonBuilder()
            .setCustomId(`Bestätigen_remove_${triggerKanal.id}`)
            .setLabel('Kanal entfernen')
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
                        embeds: [ErfolgEmbed('Kanal entfernt', `${triggerKanal} wurde aus dem Bei-Beitritt-erstellen-System entfernt.`)],
                        flags: MessageFlags.Ephemeral,
                    });
                } else {
                    await replyUserFehler(buttonInteraction, {
                        type: FehlerTypes.Konfiguration,
                        message: 'Der Auslöser-Kanal konnte nicht entfernt werden.'
                    });
                }
            } catch (Fehler) {
                if (Fehler instanceof TitanBotFehler) {
                    logger.debug(`Trigger removal validation Fehler: ${Fehler.message}`);
                } else {
                    logger.Fehler('Remove trigger Fehler:', Fehler);
                }
                
                const FehlerMessage = Fehler instanceof TitanBotFehler
                    ? Fehler.userMessage || 'Ein Fehler ist aufgetreten beim Entfernen des Auslöser-Kanals.'
                    : 'Ein Fehler ist aufgetreten beim Entfernen des Auslöser-Kanals.';
                    
                await replyUserFehler(buttonInteraction, {
                    type: FehlerTypes.Konfiguration,
                    message: FehlerMessage
                }).catch(() => {});
            }
        } else {
            await buttonInteraction.followUp({
                embeds: [ErfolgEmbed('Abgebrochen', 'Kanal-Entfernung wurde abgebrochen.')],
                flags: MessageFlags.Ephemeral,
            });
        }
    });

    collector.on('end', (collected, reason) => {
        if (reason === 'time') {
            replyUserFehler(interaction, {
                type: FehlerTypes.RATE_LIMIT,
                message: 'Keine Antwort erhalten. Entfernung abgebrochen.'
            }).catch(() => {});
        }
    });
}

async function handleViewEinstellungen(interaction, triggerKanal, currentConfig, client) {
    const KanalConfig = currentConfig.KanalOptions?.[triggerKanal.id] || {};
    
    const embed = new EmbedBuilder()
        .setTitle('Aktuelle Einstellungen')
        .setDescription(`Konfiguration für ${triggerKanal}`)
        .setColor(getColor('Info'))
        .addFields(
            {
                name: 'Auslöser-Kanal',
                value: `${triggerKanal} (${triggerKanal.id})`,
                inline: false
            },
            {
                name: 'Kanalname-Vorlage',
                value: `\`${KanalConfig.nameTemplate || currentConfig.KanalNameTemplate}\``,
                inline: false
            },
            {
                name: 'Benutzerlimit',
                value: `${KanalConfig.userLimit || currentConfig.userLimit === 0 ? 'Kein Limit' : (KanalConfig.userLimit || currentConfig.userLimit) + ' Benutzer'}`,
                inline: true
            },
            {
                name: 'Bitrate',
                value: `${(KanalConfig.bitrate || currentConfig.bitrate) / 1000} kbps`,
                inline: true
            },
            {
                name: 'Kategorie',
                value: currentConfig.categoryId ? `<#${currentConfig.categoryId}>` : 'Nicht festgelegt',
                inline: true
            },
            {
                name: 'Systemstatus',
                value: currentConfig.enabled ? '✅ Aktiv' : '❌ Deaktiviert',
                inline: true
            },
            {
                name: 'Aktive temporäre Kanäle',
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



