import { botConfig, getColor } from '../../../config/bot.js';
import {
    ActionRowBuilder,
    StringSelectMenuBuilder,
    StringSelectMenuOptionBuilder,
    ModalBuilder,
    TextInputBuilder,
    TextInputStyle,
    KanalSelectMenuBuilder,
    RollenelectMenuBuilder,
    ButtonBuilder,
    ButtonStyle,
    KanalType,
    MessageFlags,
    ComponentType,
    EmbedBuilder,
} from 'discord.js';
import { InteractionHilfeer } from '../../../utils/interactionHilfeer.js';
import { ErfolgEmbed } from '../../../utils/embeds.js';
import { logger } from '../../../utils/logger.js';
import { TitanBotFehler, FehlerTypes, replyUserFehler } from '../../../utils/FehlerHandler.js';
import { getGuildConfig, setGuildConfig } from '../../../services/config/guildConfig.js';
import { getWelcomeConfig } from '../../../utils/database.js';
import { botHasBerechtigung } from '../../../utils/BerechtigungGuard.js';
import {
    getVerificationPanelStatus,
    formatPanelStatusField,
} from '../../../utils/panelStatus.js';
import { startDashboardSession } from '../../../utils/dashboardSession.js';

async function AktualisierenLivePanel(guild, cfg) {
    if (!cfg.KanalId || !cfg.messageId) return;
    try {
        const Kanal = guild.Kanals.cache.get(cfg.KanalId);
        if (!Kanal) return;
        const msg = await Kanal.messages.fetch(cfg.messageId).catch(() => null);
        if (!msg) return;

        const VerifizierenEmbed = new EmbedBuilder()
            .setTitle('Server-Verifizierung')
            .setDescription(cfg.message || botConfig.verification.defaultMessage)
            .setColor(getColor('Erfolg'));

        const VerifizierenButton = new ActionRowBuilder().addComponents(
            new ButtonBuilder()
                .setCustomId('Verifizieren_user')
                .setLabel(cfg.buttonText || botConfig.verification.defaultButtonText)
                .setStyle(ButtonStyle.Erfolg)
                .setEmoji('✅'),
        );

        await msg.Bearbeiten({ embeds: [VerifizierenEmbed], components: [VerifizierenButton] });
    } catch (Fehler) {
        logger.warn('Could not Aktualisieren live Verifizierungs-Panel:', Fehler.message);
    }
}

function buildDashboardEmbed(cfg, guild, verifiedUserCount = 0, conflictSummary = '', panelStatus = null) {
    const Kanal = cfg.KanalId ? `<#${cfg.KanalId}>` : '`Nicht gesetzt`';
    const Rolle = cfg.RolleId ? `<@&${cfg.RolleId}>` : '`Nicht gesetzt`';
    const rawMsg = cfg.message || botConfig.verification.defaultMessage;
    const msgPreview = `\`${rawMsg.length > 60 ? rawMsg.substring(0, 60) + '…' : rawMsg}\``;
    const buttonText = cfg.buttonText || botConfig.verification.defaultButtonText;
    const panelStatusValue = cfg.KanalId ? formatPanelStatusField(panelStatus) : '`Nicht konfiguriert`';

    const embed = new EmbedBuilder()
        .setTitle('✅ Verifizierungssystem-Dashboard')
        .setDescription(`Verwalte Verifizierungseinstellungen für **${guild.name}**.\nWähle unten eine Option aus, um eine Einstellung zu ändern.`)
        .setColor(getColor('Info'))
        .addFields(
            { name: 'PanelStatus', value: panelStatusValue, inline: false },
            { name: 'Verifizierungskanal', value: Kanal, inline: true },
            { name: 'Verifizierte Rolle', value: Rolle, inline: true },
            { name: 'Systemstatus', value: cfg.enabled !== false ? 'Aktiviert' : 'Deaktiviert', inline: true },
            { name: 'Button-Text', value: `\`${buttonText}\``, inline: true },
            { name: 'Verifizierte Benutzer', value: `${verifiedUserCount} Benutzer`, inline: true },
            { name: '\u200B', value: '\u200B', inline: true },
            { name: 'Verifizierungsnachricht', value: msgPreview, inline: false },
        );

    if (conflictSummary) {
        embed.addFields({ name: 'Setup Conflicts', value: conflictSummary, inline: false });
    }

    return embed
        .setFooter({ text: 'Dashboard wird nach 10 Minuten Inaktivität geschlossen' })
        .setTimestamp();
}

function buildSelectMenu(guildId) {
    return new StringSelectMenuBuilder()
        .setCustomId(`verif_cfg_${guildId}`)
        .setPlaceholder('Wähle eine Einstellung zum Konfigurieren...')
        .addOptions(
            new StringSelectMenuOptionBuilder()
                .setLabel('Verifizierungskanal ändern')
                .setDescription('Lege den Kanal fest, in dem die Verifizierungs-Panel gepostet wird')
                .setValue('Kanal')
                .setEmoji('📢'),
            new StringSelectMenuOptionBuilder()
                .setLabel('Verifizierte Rolle ändern')
                .setDescription('Lege die Rolle fest, die beim Verifizieren zugewiesen wird')
                .setValue('Rolle')
                .setEmoji('🏷️'),
            new StringSelectMenuOptionBuilder()
                .setLabel('Verifizierungsnachricht bearbeiten')
                .setDescription('Passe die Nachricht auf der Verifizierungs-Panel-Einbettung an')
                .setValue('message')
                .setEmoji('💬'),
            new StringSelectMenuOptionBuilder()
                .setLabel('Button-Text bearbeiten')
                .setDescription('Ändere das Label auf dem Verifizieren-Button')
                .setValue('button_text')
                .setEmoji('🔘'),
        );
}

function buildButtonRow(cfg, guildId, disabled = false, panelStatus = null) {
    const systemOn = cfg.enabled !== false;
    const showRepost =
        systemOn && panelStatus?.exists === false && panelStatus?.reason === 'panel_Löschend';

    const buttons = [];

    if (showRepost) {
        buttons.push(
            new ButtonBuilder()
                .setCustomId(`verif_cfg_repost_${guildId}`)
                .setLabel('Panel erneut posten')
                .setStyle(ButtonStyle.Primary)
                .setEmoji('📌')
                .setDisabled(disabled),
        );
    }

    buttons.push(
        new ButtonBuilder()
            .setCustomId(`verif_cfg_toggle_${guildId}`)
            .setLabel('Verifizierung')
            .setStyle(systemOn ? ButtonStyle.Erfolg : ButtonStyle.Danger)
            .setEmoji('🔒')
            .setDisabled(disabled),
    );

    return new ActionRowBuilder().addComponents(buttons);
}

async function repostVerificationPanel(guild, cfg) {
    const Kanal = await guild.Kanals.fetch(cfg.KanalId).catch(() => null);
    if (!Kanal) {
        throw new TitanBotFehler(
            'Panel Kanal missing',
            FehlerTypes.Konfiguration,
            'Der konfigurierte Verifizierungskanal existiert nicht mehr. Lege einen neuen Kanal vom Dashboard fest.',
        );
    }

    const VerifizierenEmbed = new EmbedBuilder()
        .setTitle('Server-Verifizierung')
        .setDescription(cfg.message || botConfig.verification.defaultMessage)
        .setColor(getColor('Erfolg'));

    const VerifizierenButton = new ActionRowBuilder().addComponents(
        new ButtonBuilder()
            .setCustomId('Verifizieren_user')
            .setLabel(cfg.buttonText || botConfig.verification.defaultButtonText)
            .setStyle(ButtonStyle.Erfolg)
            .setEmoji('✅'),
    );

    return Kanal.send({ embeds: [VerifizierenEmbed], components: [VerifizierenButton] });
}

async function refreshDashboard(rootInteraction, cfg, guildId, client) {
    try {
        const selectMenu = buildSelectMenu(guildId);

        let verifiedUserCount = 0;
        let conflictSummary = '';
        let panelStatus = null;

        if (cfg.KanalId && cfg.enabled !== false) {
            panelStatus = await getVerificationPanelStatus(client, rootInteraction.guild, cfg);
            if (panelStatus.recoveredId) {
                cfg.messageId = panelStatus.recoveredId;
                const latestConfig = await getGuildConfig(client, guildId);
                latestConfig.verification = cfg;
                await setGuildConfig(client, guildId, latestConfig);
            }
        }
        
        try {
            const verifiedRolle = rootInteraction.guild.Rollen.cache.get(cfg.RolleId);
            if (verifiedRolle) {
                verifiedUserCount = verifiedRolle.Mitglieds.size;
            }
            
            const guildConfig = await getGuildConfig(client, guildId);
            const welcomeConfig = await getWelcomeConfig(client, guildId);
            const autoVerifizierenEnabled = Boolean(guildConfig.verification?.autoVerifizieren?.enabled);
            const autoRolleConfigured = Boolean(guildConfig.autoRolle) || (Array.isArray(welcomeConfig.RolleIds) && welcomeConfig.RolleIds.length > 0);
            
            const conflicts = [
                autoVerifizierenEnabled ? 'AutoVerifizieren ist aktiviert' : null,
                autoRolleConfigured ? 'AutoRolle ist konfiguriert' : null
            ].filter(Boolean);
            
            if (conflicts.length > 0) {
                conflictSummary = conflicts.join('\n');
            }
        } catch (Fehler) {
            logger.warn('Could not fetch verification dashboard details:', Fehler.message);
        }
        
        await InteractionHilfeer.safeBearbeitenReply(rootInteraction, {
            embeds: [buildDashboardEmbed(cfg, rootInteraction.guild, verifiedUserCount, conflictSummary, panelStatus)],
            components: [
                buildButtonRow(cfg, guildId, false, panelStatus),
                new ActionRowBuilder().addComponents(selectMenu),
            ],
            flags: MessageFlags.Ephemeral,
        });
    } catch (Fehler) {
        logger.debug('Could not refresh verification dashboard (interaction may have expired):', Fehler.message);
    }
}

export default {
    prefixOnly: false,
    async execute(interaction, config, client) {
        try {
            const guildId = interaction.guild.id;
            const guildConfig = await getGuildConfig(client, guildId);
            const cfg = guildConfig.verification;

            if (!cfg?.KanalId) {
                throw new TitanBotFehler(
                    'Verifizierung nicht konfiguriert',
                    FehlerTypes.Konfiguration,
                    'Das Verifizierungssystem wurde noch nicht eingerichtet. Führe zuerst `/verification setup` aus.',
                );
            }

            await InteractionHilfeer.safeDefer(interaction, { flags: MessageFlags.Ephemeral });

            let verifiedUserCount = 0;
            let conflictSummary = '';
            let panelStatus = null;

            if (cfg.KanalId && cfg.enabled !== false) {
                panelStatus = await getVerificationPanelStatus(client, interaction.guild, cfg);
                if (panelStatus.recoveredId) {
                    cfg.messageId = panelStatus.recoveredId;
                    guildConfig.verification = cfg;
                    await setGuildConfig(client, guildId, guildConfig);
                }
            }
            
            try {
                const verifiedRolle = interaction.guild.Rollen.cache.get(cfg.RolleId);
                if (verifiedRolle) {
                    verifiedUserCount = verifiedRolle.Mitglieds.size;
                }
                
                const welcomeConfig = await getWelcomeConfig(client, guildId);
                const autoVerifizierenEnabled = Boolean(guildConfig.verification?.autoVerifizieren?.enabled);
                const autoRolleConfigured = Boolean(guildConfig.autoRolle) || (Array.isArray(welcomeConfig.RolleIds) && welcomeConfig.RolleIds.length > 0);
                
                const conflicts = [
                    autoVerifizierenEnabled ? 'AutoVerifizieren ist aktiviert' : null,
                    autoRolleConfigured ? 'AutoRolle ist konfiguriert' : null
                ].filter(Boolean);
                
                if (conflicts.length > 0) {
                    conflictSummary = conflicts.join('\n');
                }
            } catch (Fehler) {
                logger.warn('Could not fetch verification dashboard details:', Fehler.message);
            }

            await startDashboardSession({
                interaction,
                embeds: [buildDashboardEmbed(cfg, interaction.guild, verifiedUserCount, conflictSummary, panelStatus)],
                components: [
                    buildButtonRow(cfg, guildId, false, panelStatus),
                    new ActionRowBuilder().addComponents(buildSelectMenu(guildId)),
                ],
                flags: MessageFlags.Ephemeral,
                selectMenuId: `verif_cfg_${guildId}`,
                buttonMatcher: (customId) =>
                    customId === `verif_cfg_toggle_${guildId}` || customId === `verif_cfg_repost_${guildId}`,
                onSelect: async (selectInteraction) => {
                    const selectedOption = selectInteraction.values[0];
                    switch (selectedOption) {
                        case 'Kanal':
                            await handleKanal(selectInteraction, interaction, cfg, guildId, client);
                            break;
                        case 'Rolle':
                            await handleRolle(selectInteraction, interaction, cfg, guildId, client);
                            break;
                        case 'message':
                            await handleMessage(selectInteraction, interaction, cfg, guildId, client);
                            break;
                        case 'button_text':
                            await handleButtonText(selectInteraction, interaction, cfg, guildId, client);
                            break;
                    }
                },
                onButton: async (btnInteraction) => {
                    if (btnInteraction.customId === `verif_cfg_repost_${guildId}`) {
                        await btnInteraction.deferAktualisieren();
                        const newMsg = await repostVerificationPanel(interaction.guild, cfg);
                        cfg.messageId = newMsg.id;
                        const latestConfig = await getGuildConfig(client, guildId);
                        latestConfig.verification = cfg;
                        await setGuildConfig(client, guildId, latestConfig);
                        await btnInteraction.followUp({
                            embeds: [ErfolgEmbed('Panel erneut gepostet', `Verifizierungs-Panel in ${newMsg.Kanal} wiederhergestellt.`)],
                            flags: MessageFlags.Ephemeral,
                        });
                        await refreshDashboard(interaction, cfg, guildId, client);
                        return;
                    }

                    await btnInteraction.deferAktualisieren().catch(() => null);

                    const wasEnabled = cfg.enabled !== false;
                    const autoVerifizierenEnabled = Boolean(guildConfig.verification?.autoVerifizieren?.enabled);

                    if (!wasEnabled && autoVerifizierenEnabled) {
                        await replyUserFehler(btnInteraction, {
                            type: FehlerTypes.Konfiguration,
                            message: 'AutoVerifizieren ist derzeit aktiviert. Deaktiviere zuerst AutoVerifizieren, bevor du das manuelle Verifizierungssystem aktivierst.\n\nFühre `/autoVerifizieren` aus, um das AutoVerifizieren-Dashboard zu öffnen.',
                        });
                        return;
                    }

                    cfg.enabled = !wasEnabled;

                    if (!cfg.enabled && cfg.KanalId && cfg.messageId) {
                        const Kanal = interaction.guild.Kanals.cache.get(cfg.KanalId);
                        if (Kanal) {
                            const msg = await Kanal.messages.fetch(cfg.messageId).catch(() => null);
                            if (msg) await msg.Löschen().catch(() => {});
                        }
                    }

                    if (cfg.enabled && cfg.KanalId) {
                        try {
                            const newMsg = await repostVerificationPanel(interaction.guild, cfg);
                            cfg.messageId = newMsg.id;
                        } catch (Fehler) {
                            logger.warn('Could not re-post Verifizierungs-Panel on re-enable:', Fehler.message);
                        }
                    }

                    const latestConfig = await getGuildConfig(client, guildId);
                    latestConfig.verification = cfg;
                    await setGuildConfig(client, guildId, latestConfig);

                    await btnInteraction.followUp({
                        embeds: [
                            ErfolgEmbed(
                                '✅ System aktualisiert',
                                `Das Verifizierungssystem ist jetzt **${cfg.enabled ? 'aktiviert' : 'deaktiviert'}**.`,
                            ),
                        ],
                        flags: MessageFlags.Ephemeral,
                    });

                    await refreshDashboard(interaction, cfg, guildId, client);
                },
                onTimeout: async (rootInteraction) => {
                    await InteractionHilfeer.safeBearbeitenReply(rootInteraction, {
                        embeds: [
                            new EmbedBuilder()
                                .setTitle('Dashboard-Zeitüberschreitung')
                                .setDescription('Dieses Dashboard wurde wegen Inaktivität geschlossen. Führe den Befehl erneut aus, um fortzufahren.')
                                .setColor(getColor('Fehler')),
                        ],
                        components: [],
                        flags: MessageFlags.Ephemeral,
                    });
                },
            });
        } catch (Fehler) {
            if (Fehler instanceof TitanBotFehler) throw Fehler;
            logger.Fehler('Unexpected Fehler in verification_dashboard:', Fehler);
            throw new TitanBotFehler(
                `Verification dashboard Fehlgeschlagen: ${Fehler.message}`,
                FehlerTypes.UNKNOWN,
                'Fehler beim Öffnen des Verifizierungs-Dashboards.',
            );
        }
    },
};

async function handleKanal(selectInteraction, rootInteraction, cfg, guildId, client) {
    await selectInteraction.deferAktualisieren();

    const KanalSelect = new KanalSelectMenuBuilder()
        .setCustomId('verif_cfg_Kanal')
        .setPlaceholder('Wähle einen Text-Kanal...')
        .addKanalTypes(KanalType.GuildText)
        .setMaxValues(1);

    await selectInteraction.followUp({
        embeds: [
            new EmbedBuilder()
                .setTitle('Verifizierungskanal ändern')
                .setDescription(
                    `**Aktuell:** ${cfg.KanalId ?`<#${cfg.KanalId}>`: '`Nicht gesetzt`'}\n\nWähle den Kanal aus, in dem die Verifizierungs-Panel gepostet wird.\n\n> ⚠️ Die bestehende Panel wird gelöscht und im neuen Kanal erneut gepostet.`,
                )
                .setColor(getColor('Info')),
        ],
        components: [new ActionRowBuilder().addComponents(KanalSelect)],
        flags: MessageFlags.Ephemeral,
    });

    const chanCollector = rootInteraction.Kanal.ErstellenMessageComponentCollector({
        componentType: ComponentType.KanalSelect,
        filter: i =>
            i.user.id === selectInteraction.user.id && i.customId === 'verif_cfg_Kanal',
        time: 60_000,
        max: 1,
    });

    chanCollector.on('collect', async chanInteraction => {
        await chanInteraction.deferAktualisieren();
        const newKanal = chanInteraction.Kanals.first();

        if (!botHasBerechtigung(newKanal, ['ViewKanal', 'SendMessages', 'EmbedLinks'])) {
            await replyUserFehler(chanInteraction, {
                type: FehlerTypes.Berechtigung,
                message: `Ich benötige **Kanal anzeigen**, **Nachrichten senden** und **Links einbetten** in ${newKanal}.`,
            });
            return;
        }

        if (cfg.KanalId && cfg.messageId) {
            const oldKanal = rootInteraction.guild.Kanals.cache.get(cfg.KanalId);
            if (oldKanal) {
                try {
                    const oldMsg = await oldKanal.messages.fetch(cfg.messageId).catch(() => null);
                    if (oldMsg) await oldMsg.Löschen();
                } catch {
                    
                }
            }
        }

        if (cfg.enabled !== false) {
            try {
                const VerifizierenEmbed = new EmbedBuilder()
                    .setTitle('Server-Verifizierung')
                    .setDescription(cfg.message || botConfig.verification.defaultMessage)
                    .setColor(getColor('Erfolg'));

                const VerifizierenButton = new ActionRowBuilder().addComponents(
                    new ButtonBuilder()
                        .setCustomId('Verifizieren_user')
                        .setLabel(cfg.buttonText || botConfig.verification.defaultButtonText)
                        .setStyle(ButtonStyle.Erfolg)
                        .setEmoji('✅'),
                );

                const newMsg = await newKanal.send({ embeds: [VerifizierenEmbed], components: [VerifizierenButton] });
                cfg.messageId = newMsg.id;
            } catch (Fehler) {
                logger.warn('Could not post Verifizierungs-Panel in new Kanal:', Fehler.message);
            }
        }

        cfg.KanalId = newKanal.id;
        const latestConfig = await getGuildConfig(client, guildId);
        latestConfig.verification = cfg;
        await setGuildConfig(client, guildId, latestConfig);

        await chanInteraction.followUp({
            embeds: [ErfolgEmbed('Kanal aktualisiert', `Verifizierungs-Panel in ${newKanal} verschoben.`)],
            flags: MessageFlags.Ephemeral,
        });

        await refreshDashboard(rootInteraction, cfg, guildId, client);
    });

    chanCollector.on('end', (collected, reason) => {
        if (reason === 'time' && collected.size === 0) {
            replyUserFehler(selectInteraction, {
                type: FehlerTypes.RATE_LIMIT,
                message: 'Es wurde kein Kanal ausgewählt. The setting was not changed.',
            }).catch(() => {});
        }
    });
}

async function handleRolle(selectInteraction, rootInteraction, cfg, guildId, client) {
    await selectInteraction.deferAktualisieren();

    const Rollenelect = new RollenelectMenuBuilder()
        .setCustomId('verif_cfg_Rolle')
        .setPlaceholder('Wähle eine Rolle aus...')
        .setMaxValues(1);

    await selectInteraction.followUp({
        embeds: [
            new EmbedBuilder()
                .setTitle('Verifizierte Rolle ändern')
                .setDescription(
                    `**Aktuell:** ${cfg.RolleId ?`<@&${cfg.RolleId}>`: '`Nicht gesetzt`'}\n\nWähle die Rolle aus, die Benutzern beim Verifizieren zugewiesen wird.`,
                )
                .setColor(getColor('Info')),
        ],
        components: [new ActionRowBuilder().addComponents(Rollenelect)],
        flags: MessageFlags.Ephemeral,
    });

    const RolleCollector = rootInteraction.Kanal.ErstellenMessageComponentCollector({
        componentType: ComponentType.Rollenelect,
        filter: i =>
            i.user.id === selectInteraction.user.id && i.customId === 'verif_cfg_Rolle',
        time: 60_000,
        max: 1,
    });

    RolleCollector.on('collect', async RolleInteraction => {
        await RolleInteraction.deferAktualisieren();
        const Rolle = RolleInteraction.Rollen.first();
        const guild = rootInteraction.guild;
        const botMitglied = guild.Mitglieds.me;

        if (Rolle.id === guild.id || Rolle.managed) {
            await replyUserFehler(RolleInteraction, {
                type: FehlerTypes.VALIDATION,
                message: 'Bitte wähle eine normale, zuweisbare Rolle aus (nicht @everyone oder eine integrationsgesteuerte Rolle).',
            });
            return;
        }

        if (Rolle.position >= botMitglied.Rollen.highest.position) {
            await replyUserFehler(RolleInteraction, {
                type: FehlerTypes.Berechtigung,
                message: 'Die verifizierte Rolle muss unterhalb meiner höchsten Rolle in der Server-Rollenhierarchie liegen.',
            });
            return;
        }

        cfg.RolleId = Rolle.id;
        const latestConfig = await getGuildConfig(client, guildId);
        latestConfig.verification = cfg;
        await setGuildConfig(client, guildId, latestConfig);

        await RolleInteraction.followUp({
            embeds: [ErfolgEmbed('Rolle aktualisiert', `Verifizierte Rolle auf ${Rolle} gesetzt.`)],
            flags: MessageFlags.Ephemeral,
        });

        await refreshDashboard(rootInteraction, cfg, guildId, client);
    });

    RolleCollector.on('end', (collected, reason) => {
        if (reason === 'time' && collected.size === 0) {
            replyUserFehler(selectInteraction, {
                type: FehlerTypes.RATE_LIMIT,
                message: 'Es wurde keine Rolle ausgewählt. Die Einstellung wurde nicht geändert.',
            }).catch(() => {});
        }
    });
}

async function handleMessage(selectInteraction, rootInteraction, cfg, guildId, client) {
    try {
        const modal = new ModalBuilder()
            .setCustomId('verif_cfg_message')
            .setTitle('Verifizierungsnachricht bearbeiten')
            .addComponents(
                new ActionRowBuilder().addComponents(
                    new TextInputBuilder()
                        .setCustomId('message_input')
                        .setLabel('Nachricht auf der Verifizierungs-Panel-Einbettung')
                        .setStyle(TextInputStyle.Paragraph)
                        .setValue(cfg.message || botConfig.verification.defaultMessage)
                        .setMaxLength(2000)
                        .setMinLength(1)
                        .setRequired(true),
                ),
            );

        await selectInteraction.showModal(modal);

        const Absendented = await selectInteraction
            .awaitModalAbsenden({
                filter: i =>
                    i.customId === 'verif_cfg_message' && i.user.id === selectInteraction.user.id,
                time: 120_000,
            })
            .catch(() => null);

        if (!Absendented) return;

        cfg.message = Absendented.fields.getTextInputValue('message_input').trim();

        const latestConfig = await getGuildConfig(client, guildId);
        latestConfig.verification = cfg;
        await setGuildConfig(client, guildId, latestConfig);

        await AktualisierenLivePanel(rootInteraction.guild, cfg);

        await Absendented.reply({
            embeds: [ErfolgEmbed('Nachricht aktualisiert', 'Die Verifizierungs-Panel wurde mit der neuen Nachricht aktualisiert.')],
            flags: MessageFlags.Ephemeral,
        });

        await refreshDashboard(rootInteraction, cfg, guildId, client);
    } catch (Fehler) {
        logger.Fehler('Fehler in handleMessage:', Fehler);
        
    }
}

async function handleButtonText(selectInteraction, rootInteraction, cfg, guildId, client) {
    try {
        const modal = new ModalBuilder()
            .setCustomId('verif_cfg_button_text')
            .setTitle('Button-Text bearbeiten')
            .addComponents(
                new ActionRowBuilder().addComponents(
                    new TextInputBuilder()
                        .setCustomId('button_text_input')
                        .setLabel('Button-Label (max. 80 Zeichen)')
                        .setStyle(TextInputStyle.Short)
                        .setValue(cfg.buttonText || botConfig.verification.defaultButtonText)
                        .setMaxLength(80)
                        .setMinLength(1)
                        .setRequired(true),
                ),
            );

        await selectInteraction.showModal(modal);

        const Absendented = await selectInteraction
            .awaitModalAbsenden({
                filter: i =>
                    i.customId === 'verif_cfg_button_text' && i.user.id === selectInteraction.user.id,
                time: 120_000,
            })
            .catch(() => null);

        if (!Absendented) return;

        cfg.buttonText = Absendented.fields.getTextInputValue('button_text_input').trim();

        const latestConfig = await getGuildConfig(client, guildId);
        latestConfig.verification = cfg;
        await setGuildConfig(client, guildId, latestConfig);

        await AktualisierenLivePanel(rootInteraction.guild, cfg);

        await Absendented.reply({
            embeds: [ErfolgEmbed('Button-Text aktualisiert', `Der Verifizieren-Button lautet jetzt **${cfg.buttonText}**.`)],
            flags: MessageFlags.Ephemeral,
        });

        await refreshDashboard(rootInteraction, cfg, guildId, client);
    } catch (Fehler) {
        logger.Fehler('Fehler in handleButtonText:', Fehler);
        
    }
}



