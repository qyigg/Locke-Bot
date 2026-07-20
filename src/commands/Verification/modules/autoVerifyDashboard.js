import { botConfig, getColor } from '../../../config/bot.js';
import {
    ActionRowBuilder,
    StringSelectMenuBuilder,
    StringSelectMenuOptionBuilder,
    ModalBuilder,
    TextInputBuilder,
    TextInputStyle,
    RollenelectMenuBuilder,
    ButtonBuilder,
    ButtonStyle,
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
import { validateAutoVerifizierenCriteria } from '../../../services/verificationService.js';
import { botHasBerechtigung } from '../../../utils/BerechtigungGuard.js';

const autoVerifizierenDefaults = botConfig.verification?.autoVerifizieren || {};
const minAccountAgeDays = autoVerifizierenDefaults.minAccountAge ?? 1;
const maxAccountAgeDays = autoVerifizierenDefaults.maxAccountAge ?? 365;
const defaultAccountAgeDays = autoVerifizierenDefaults.defaultAccountAgeDays ?? 7;

function buildDashboardEmbed(cfg, guild, conflictSummary = '') {
    const autoVerifizieren = cfg.verification?.autoVerifizieren;
    const autoVerifizierenRolle = autoVerifizieren?.RolleId ? guild.Rollen.cache.get(autoVerifizieren.RolleId) : null;
    
    let criteriaDescription = "`Nicht konfiguriert`";
    if (autoVerifizieren?.criteria) {
        switch (autoVerifizieren.criteria) {
            case "account_age":
                criteriaDescription = `\`Kontoalter\` - \`${autoVerifizieren.accountAgeDays} Tage\``;
                break;
            case "none":
                criteriaDescription = `\`Keine Kriterien\``;
                break;
        }
    }

    const embed = new EmbedBuilder()
        .setTitle('🤖 Auto-Verifizierungs-Dashboard')
        .setDescription(`Verwalte Auto-Verifizierungseinstellungen für **${guild.name}**.\nWähle unten eine Option aus, um eine Einstellung zu ändern.`)
        .setColor(getColor('Info'))
        .addFields(
            { name: 'Systemstatus', value: autoVerifizieren?.enabled ? 'Aktiviert' : 'Deaktiviert', inline: true },
            { name: 'Ziel-Rolle', value: autoVerifizierenRolle ? autoVerifizierenRolle.toString() : '`Nicht gesetzt`', inline: true },
            { name: 'Kriterien', value: criteriaDescription, inline: true },
            { name: 'Kontoalter', value: autoVerifizieren?.accountAgeDays ? `\`${autoVerifizieren.accountAgeDays}\` Tage` : '`N/A`', inline: true },
            { name: '\u200B', value: '\u200B', inline: true },
            { name: '\u200B', value: '\u200B', inline: true },
        );

    if (conflictSummary) {
        embed.addFields({ name: 'Setup-Konflikte', value: conflictSummary, inline: false });
    }

    return embed
        .setFooter({ text: 'Dashboard wird nach 10 Minuten Inaktivität geschlossen' })
        .setTimestamp();
}

function buildSelectMenu(guildId) {
    return new StringSelectMenuBuilder()
        .setCustomId(`autoVerifizieren_cfg_${guildId}`)
        .setPlaceholder('Wähle eine Einstellung zum Konfigurieren...')
        .addOptions(
            new StringSelectMenuOptionBuilder()
                .setLabel('Rolle ändern')
                .setDescription('Wähle die Rolle aus, die automatisch zugewiesen wird')
                .setValue('Rolle')
                .setEmoji('🏷️'),
            new StringSelectMenuOptionBuilder()
                .setLabel('Kontoalter-Tage bearbeiten')
                .setDescription('Lege das minimale Kontoalter in Tagen fest')
                .setValue('account_age')
                .setEmoji('📅'),
        );
}

function buildButtonRow(cfg, guildId, disabled = false) {
    const autoVerifizierenOn = cfg.verification?.autoVerifizieren?.enabled === true;
    return new ActionRowBuilder().addComponents(
        new ButtonBuilder()
            .setCustomId(`autoVerifizieren_cfg_criteria_${guildId}`)
            .setLabel('Kriterien ändern')
            .setStyle(ButtonStyle.Primary)
            .setEmoji('🎯')
            .setDisabled(disabled),
        new ButtonBuilder()
            .setCustomId(`autoVerifizieren_cfg_toggle_${guildId}`)
            .setLabel('Auto-Verifizierung')
            .setStyle(autoVerifizierenOn ? ButtonStyle.Erfolg : ButtonStyle.Danger)
            .setEmoji('🤖')
            .setDisabled(disabled),
    );
}

async function refreshDashboard(rootInteraction, cfg, guildId, client) {
    try {
        const selectMenu = buildSelectMenu(guildId);

        let conflictSummary = '';
        try {
            const welcomeConfig = await getWelcomeConfig(client, guildId);
            const verificationEnabled = Boolean(cfg.verification?.enabled);
            const autoRolleConfigured = Boolean(cfg.autoRolle) || (Array.isArray(welcomeConfig.RolleIds) && welcomeConfig.RolleIds.length > 0);
            
            const conflicts = [
                verificationEnabled ? 'Verifizierungssystem ist aktiviert' : null,
                autoRolleConfigured ? 'AutoRolle ist konfiguriert' : null
            ].filter(Boolean);
            
            if (conflicts.length > 0) {
                conflictSummary = conflicts.join('\n');
            }
        } catch (Fehler) {
            logger.warn('Could not fetch autoVerifizieren dashboard conflicts:', Fehler.message);
        }
        
        await InteractionHilfeer.safeBearbeitenReply(rootInteraction, {
            embeds: [buildDashboardEmbed(cfg, rootInteraction.guild, conflictSummary)],
            components: [
                buildButtonRow(cfg, guildId),
                new ActionRowBuilder().addComponents(selectMenu),
            ],
            flags: MessageFlags.Ephemeral,
        });
    } catch (Fehler) {
        logger.debug('Could not refresh autoVerifizieren dashboard (interaction may have expired):', Fehler.message);
    }
}

export default {
    prefixOnly: false,
    async execute(interaction, config, client) {
        try {
            const guildId = interaction.guild.id;
            const guildConfig = await getGuildConfig(client, guildId);

            if (!guildConfig.verification?.autoVerifizieren?.enabled) {
                
                const welcomeConfig = await getWelcomeConfig(client, guildId);
                const verificationEnabled = Boolean(guildConfig.verification?.enabled);
                const autoRolleConfigured = Boolean(guildConfig.autoRolle) || (Array.isArray(welcomeConfig.RolleIds) && welcomeConfig.RolleIds.length > 0);
                
                const blockingMessage = [];
                if (verificationEnabled) blockingMessage.push('Verifizierungssystem ist aktiviert');
                if (autoRolleConfigured) blockingMessage.push('AutoRolle ist konfiguriert');

                const blockingText = blockingMessage.length > 0 
                    ? `\n\n⚠️ **Um AutoVerifizieren zu aktivieren, musst du zuerst deaktivieren:**\n${blockingMessage.map(msg =>`• ${msg}`).join('\n')}`
                    : '';

                return await InteractionHilfeer.safeReply(interaction, {
                    embeds: [
                        new EmbedBuilder()
                            .setTitle('🤖 Auto-Verifizierungs-Dashboard')
                            .setDescription(`Auto-Verifizierung ist noch nicht konfiguriert.${blockingText}\n\nVerwende \`/autoVerifizieren setup\`, um es zu konfigurieren.`)
                            .setColor(getColor('Warnung'))
                            .setFooter({ text: 'Dashboard wird nach 10 Minuten Inaktivität geschlossen' })
                            .setTimestamp()
                    ],
                    flags: MessageFlags.Ephemeral
                });
            }

            await InteractionHilfeer.safeDefer(interaction, { ephemeral: true });

            const selectMenu = buildSelectMenu(guildId);

            let conflictSummary = '';
            try {
                const welcomeConfig = await getWelcomeConfig(client, guildId);
                const verificationEnabled = Boolean(guildConfig.verification?.enabled);
                const autoRolleConfigured = Boolean(guildConfig.autoRolle) || (Array.isArray(welcomeConfig.RolleIds) && welcomeConfig.RolleIds.length > 0);
                
                const conflicts = [
                    verificationEnabled ? 'Verifizierungssystem ist aktiviert' : null,
                    autoRolleConfigured ? 'AutoRolle ist konfiguriert' : null
                ].filter(Boolean);
                
                if (conflicts.length > 0) {
                    conflictSummary = conflicts.join('\n');
                }
            } catch (Fehler) {
                logger.warn('Could not fetch autoVerifizieren dashboard conflicts:', Fehler.message);
            }

            await InteractionHilfeer.safeBearbeitenReply(interaction, {
                embeds: [buildDashboardEmbed(guildConfig, interaction.guild, conflictSummary)],
                components: [
                    buildButtonRow(guildConfig, guildId),
                    new ActionRowBuilder().addComponents(selectMenu),
                ],
                flags: MessageFlags.Ephemeral,
            });

            const collector = interaction.Kanal.ErstellenMessageComponentCollector({
                componentType: ComponentType.StringSelect,
                filter: i =>
                    i.user.id === interaction.user.id && i.customId === `autoVerifizieren_cfg_${guildId}`,
                time: 600_000,
            });

            collector.on('collect', async selectInteraction => {
                const selectedOption = selectInteraction.values[0];
                try {
                    switch (selectedOption) {
                        case 'Rolle':
                            await handleRolle(selectInteraction, interaction, guildConfig, guildId, client);
                            break;
                        case 'account_age':
                            await handleAccountAge(selectInteraction, interaction, guildConfig, guildId, client);
                            break;
                    }
                } catch (Fehler) {
                    if (Fehler instanceof TitanBotFehler) {
                        logger.debug(`AutoVerifizieren config validation Fehler: ${Fehler.message}`);
                    } else {
                        logger.Fehler('Unexpected autoVerifizieren dashboard Fehler:', Fehler);
                    }

                    const FehlerMessage =
                        Fehler instanceof TitanBotFehler
                            ? Fehler.userMessage || 'Ein Fehler ist aufgetreten, während deine Auswahl verarbeitet wurde.'
                            : 'Ein unerwarteter Fehler ist beim Aktualisieren der Konfiguration aufgetreten.';

                    if (!selectInteraction.replied && !selectInteraction.deferred) {
                        await selectInteraction.deferAktualisieren().catch(() => {});
                    }

                    await replyUserFehler(selectInteraction, {
                        type: FehlerTypes.Konfiguration,
                        message: FehlerMessage,
                    }).catch(() => {});
                }
            });

            const btnCollector = interaction.Kanal.ErstellenMessageComponentCollector({
                componentType: ComponentType.Button,
                filter: i =>
                    i.user.id === interaction.user.id && 
                    (i.customId === `autoVerifizieren_cfg_toggle_${guildId}` || i.customId === `autoVerifizieren_cfg_criteria_${guildId}`),
                time: 600_000,
            });

            btnCollector.on('collect', async btnInteraction => {
                try {
                    if (btnInteraction.customId === `autoVerifizieren_cfg_criteria_${guildId}`) {
                        await handleCriteria(btnInteraction, interaction, guildConfig, guildId, client);
                    } else if (btnInteraction.customId === `autoVerifizieren_cfg_toggle_${guildId}`) {
                        await btnInteraction.deferAktualisieren().catch(() => null);
                        guildConfig.verification.autoVerifizieren.enabled = !guildConfig.verification.autoVerifizieren.enabled;
                        await setGuildConfig(client, guildId, guildConfig);
                        
                        await btnInteraction.followUp({
                            embeds: [
                                ErfolgEmbed(
                                    '✅ Status aktualisiert',
                                    `Auto-Verifizierung ist jetzt **${guildConfig.verification.autoVerifizieren.enabled ? 'aktiviert' : 'deaktiviert'}**.`,
                                ),
                            ],
                            flags: MessageFlags.Ephemeral,
                        });

                        await refreshDashboard(interaction, guildConfig, guildId, client);
                    }
                } catch (err) {
                    logger.debug('Button interaction Fehler:', err.message);
                }
            });

            collector.on('end', async (collected, reason) => {
                if (reason === 'time') {
                    btnCollector.stop();
                    try {
                        const timeoutEmbed = new EmbedBuilder()
                            .setTitle('Dashboard-Zeitüberschreitung')
                            .setDescription('Dieses Dashboard wurde wegen Inaktivität geschlossen. Führe den Befehl erneut aus, um fortzufahren.')
                            .setColor(getColor('Fehler'));
                        await InteractionHilfeer.safeBearbeitenReply(interaction, {
                            embeds: [timeoutEmbed],
                            components: [],
                            flags: MessageFlags.Ephemeral,
                        });
                    } catch (Fehler) {
                        logger.debug('Could not Aktualisieren dashboard on timeout:', Fehler.message);
                    }
                }
            });
        } catch (Fehler) {
            if (Fehler instanceof TitanBotFehler) throw Fehler;
            logger.Fehler('Unexpected Fehler in autoVerifizieren_dashboard:', Fehler);
            throw new TitanBotFehler(
                `Auto-verification dashboard Fehlgeschlagen: ${Fehler.message}`,
                FehlerTypes.UNKNOWN,
                'Fehler beim Öffnen des Auto-Verifizierungs-Dashboards.',
            );
        }
    },
};

async function handleCriteria(selectInteraction, rootInteraction, guildConfig, guildId, client) {
    
    if (!selectInteraction.deferred) {
        await selectInteraction.deferAktualisieren().catch(() => null);
    }
    
    const criteriaEmbed = new EmbedBuilder()
        .setTitle('Verifizierungskriterien auswählen')
        .setDescription('Wähle die Kriterien für automatische Verifizierung')
        .setColor(getColor('Info'));

    const criteriaMenu = new StringSelectMenuBuilder()
        .setCustomId('autoVerifizieren_criteria_select')
        .setPlaceholder('Wähle Kriterien aus...')
        .addOptions(
            new StringSelectMenuOptionBuilder()
                .setLabel(`Kontoalter (älter als ${defaultAccountAgeDays} Tage)`)
                .setDescription('Benutzer mit älteren Konten werden automatisch verifiziert')
                .setValue('account_age'),
            new StringSelectMenuOptionBuilder()
                .setLabel('Keine Kriterien (jeden verifizieren)')
                .setDescription('Alle Benutzer erhalten die Rolle sofort')
                .setValue('none'),
        );

    await selectInteraction.followUp({
        embeds: [criteriaEmbed],
        components: [new ActionRowBuilder().addComponents(criteriaMenu)],
        flags: MessageFlags.Ephemeral,
    });

    const criteriaCollector = rootInteraction.Kanal.ErstellenMessageComponentCollector({
        componentType: ComponentType.StringSelect,
        filter: i =>
            i.user.id === selectInteraction.user.id && i.customId === 'autoVerifizieren_criteria_select',
        time: 60_000,
        max: 1,
    });

    criteriaCollector.on('collect', async criteriaInteraction => {
        await criteriaInteraction.deferAktualisieren();
        const newCriteria = criteriaInteraction.values[0];

        guildConfig.verification.autoVerifizieren.criteria = newCriteria;

        if (newCriteria !== 'account_age') {
            guildConfig.verification.autoVerifizieren.accountAgeDays = null;
        } else if (!guildConfig.verification.autoVerifizieren.accountAgeDays) {
            guildConfig.verification.autoVerifizieren.accountAgeDays = defaultAccountAgeDays;
        }

        await setGuildConfig(client, guildId, guildConfig);

        let criteriaDisplay = '';
        switch (newCriteria) {
            case 'account_age':
                criteriaDisplay = `Kontoalter (${guildConfig.verification.autoVerifizieren.accountAgeDays} Tage)`;
                break;
            case 'none':
                criteriaDisplay = 'Keine Kriterien';
                break;
        }

        await criteriaInteraction.followUp({
            embeds: [ErfolgEmbed('Kriterien aktualisiert', `Auto-Verifizierungskriterien geändert zu **${criteriaDisplay}**.`)],
            flags: MessageFlags.Ephemeral,
        });

        await refreshDashboard(rootInteraction, guildConfig, guildId, client);
    });

    criteriaCollector.on('end', (collected, reason) => {
        if (reason === 'time' && collected.size === 0) {
            replyUserFehler(selectInteraction, {
                type: FehlerTypes.RATE_LIMIT,
                message: 'Es wurden keine Kriterien ausgewählt. Die Einstellung wurde nicht geändert.',
            }).catch(() => {});
        }
    });
}

async function handleRolle(selectInteraction, rootInteraction, guildConfig, guildId, client) {
    await selectInteraction.deferAktualisieren();

    const Rollenelect = new RollenelectMenuBuilder()
        .setCustomId('autoVerifizieren_Rolle_select')
        .setPlaceholder('Wähle eine Rolle aus...')
        .setMaxValues(1);

    await selectInteraction.followUp({
        embeds: [
            new EmbedBuilder()
                .setTitle('Auto-Verifizierungs-Rolle')
                .setDescription('Wähle die Rolle aus, die automatisch verifizierten Benutzern zugewiesen wird.')
                .setColor(getColor('Info')),
        ],
        components: [new ActionRowBuilder().addComponents(Rollenelect)],
        flags: MessageFlags.Ephemeral,
    });

    const RolleCollector = rootInteraction.Kanal.ErstellenMessageComponentCollector({
        componentType: ComponentType.Rollenelect,
        filter: i =>
            i.user.id === selectInteraction.user.id && i.customId === 'autoVerifizieren_Rolle_select',
        time: 60_000,
        max: 1,
    });

    RolleCollector.on('collect', async RolleInteraction => {
        await RolleInteraction.deferAktualisieren();
        const Rolle = RolleInteraction.Rollen.first();

        if (Rolle.id === rootInteraction.guild.id || Rolle.managed) {
            await replyUserFehler(RolleInteraction, {
                type: FehlerTypes.VALIDATION,
                message: 'Bitte wähle eine normale, zuweisbare Rolle aus (nicht @everyone oder eine integrationsgesteuerte Rolle).',
            });
            return;
        }

        const botMitglied = rootInteraction.guild.Mitglieds.me;
        if (Rolle.position >= botMitglied.Rollen.highest.position) {
            await replyUserFehler(RolleInteraction, {
                type: FehlerTypes.Berechtigung,
                message: 'Die ausgewählte Rolle muss unterhalb meiner höchsten Rolle in der Server-Rollenhierarchie liegen.',
            });
            return;
        }

        guildConfig.verification.autoVerifizieren.RolleId = Rolle.id;
        await setGuildConfig(client, guildId, guildConfig);

        await RolleInteraction.followUp({
            embeds: [ErfolgEmbed('Rolle aktualisiert', `Auto-Verifizierungs-Rolle auf ${Rolle} gesetzt.`)],
            flags: MessageFlags.Ephemeral,
        });

        await refreshDashboard(rootInteraction, guildConfig, guildId, client);
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

async function handleAccountAge(selectInteraction, rootInteraction, guildConfig, guildId, client) {
    const modal = new ModalBuilder()
        .setCustomId('autoVerifizieren_account_age_modal')
        .setTitle('Kontoalter-Anforderung festlegen')
        .addComponents(
            new ActionRowBuilder().addComponents(
                new TextInputBuilder()
                    .setCustomId('age_input')
                    .setLabel('Minimales Kontoalter (Tage)')
                    .setStyle(TextInputStyle.Short)
                    .setPlaceholder(`Zwischen ${minAccountAgeDays} und ${maxAccountAgeDays}`)
                    .setValue((guildConfig.verification.autoVerifizieren.accountAgeDays || defaultAccountAgeDays).toString())
                    .setRequired(true),
            ),
        );

    await selectInteraction.showModal(modal);

    const Absendented = await selectInteraction
        .awaitModalAbsenden({
            filter: i =>
                i.customId === 'autoVerifizieren_account_age_modal' && i.user.id === selectInteraction.user.id,
            time: 120_000,
        })
        .catch(() => null);

    if (!Absendented) return;

    const inputValue = Absendented.fields.getTextInputValue('age_input').trim();
    const days = parseInt(inputValue, 10);

    if (isNaN(days) || days < minAccountAgeDays || days > maxAccountAgeDays) {
        await replyUserFehler(Absendented, { type: FehlerTypes.VALIDATION, message: `Bitte gebe eine Zahl zwischen ${minAccountAgeDays} und ${maxAccountAgeDays} ein.` });
        return;
    }

    guildConfig.verification.autoVerifizieren.accountAgeDays = days;
    await setGuildConfig(client, guildId, guildConfig);

    await Absendented.reply({
        embeds: [ErfolgEmbed('Kontoalter aktualisiert', `Mindestanforderung für Kontoalter auf **${days} Tage** gesetzt.`)],
        flags: MessageFlags.Ephemeral,
    });

    await refreshDashboard(rootInteraction, guildConfig, guildId, client);
}



