import { botConfig, getColor } from '../../../config/bot.js';
import {
    ActionRowBuilder,
    StringSelectMenuBuilder,
    StringSelectMenuOptionBuilder,
    ModalBuilder,
    TextInputBuilder,
    TextInputStyle,
    RoleSelectMenuBuilder,
    ButtonBuilder,
    ButtonStyle,
    MessageFlags,
    ComponentType,
    EmbedBuilder,
} from 'discord.js';
import { InteractionHelper } from '../../../utils/interactionHelper.js';
import { successEmbed } from '../../../utils/embeds.js';
import { logger } from '../../../utils/logger.js';
import { TitanBotFehler, FehlerTypes, replyUserFehler } from '../../../utils/errorHandler.js';
import { getGuildConfig, setGuildConfig } from '../../../services/config/guildConfig.js';
import { getWelcomeConfig } from '../../../utils/database.js';
import { validateAutoVerifizierenKriterien } from '../../../services/verificationService.js';
import { botHasPermission } from '../../../utils/permissionGuard.js';

const autoVerifizierenDefaults = botConfig.verification?.autoVerifizieren || {};
const minAccountAgeDays = autoVerifizierenDefaults.minAccountAge ?? 1;
const maxAccountAgeDays = autoVerifizierenDefaults.maxAccountAge ?? 365;
const defaultAccountAgeDays = autoVerifizierenDefaults.defaultAccountAgeDays ?? 7;

function buildDashboardEmbed(cfg, guild, conflictSummary = '') {
    const autoVerifizieren = cfg.verification?.autoVerifizieren;
    const autoVerifizierenRole = autoVerifizieren?.roleId ? guild.roles.cache.get(autoVerifizieren.roleId) : null;
    
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
        .setDescription(`Verwalte die Auto-Verifizierungs-Einstellungen für **${guild.name}**.\nWähle unten eine Option aus, um eine Einstellung zu ändern.`)
        .setColor(getColor('info'))
        .addFields(
            { name: 'Systemstatus', value: autoVerifizieren?.enabled ? 'Aktiviert' : 'Deaktiviert', inline: true },
            { name: 'Zielrolle', value: autoVerifizierenRole ? autoVerifizierenRole.toString() : '`Nicht gesetzt`', inline: true },
            { name: 'Kriterien', value: criteriaDescription, inline: true },
            { name: 'Kontoalter', value: autoVerifizieren?.accountAgeDays ? `\`${autoVerifizieren.accountAgeDays}\` Tage` : '`N/V`', inline: true },
            { name: '\u200B', value: '\u200B', inline: true },
            { name: '\u200B', value: '\u200B', inline: true },
        );

    if (conflictSummary) {
        embed.addFields({ name: 'Setupskonflikte', value: conflictSummary, inline: false });
    }

    return embed
        .setFooter({ text: 'Dashboard schließt nach 10 Minuten Inaktivität' })
        .setTimestamp();
}

function buildSelectMenu(guildId) {
    return new StringSelectMenuBuilder()
        .setCustomId(`autoverify_cfg_${guildId}`)
        .setPlaceholder('Wähle eine Einstellung zum Konfigurieren aus...')
        .addOptions(
            new StringSelectMenuOptionBuilder()
                .setLabel('Rolle ändern')
                .setDescription('Wähle die Rolle aus, die automatisch vergeben wird')
                .setValue('role')
                .setEmoji('🏷️'),
            new StringSelectMenuOptionBuilder()
                .setLabel('Tage für Kontoalter bearbeiten')
                .setDescription('Lege das Mindest-Kontoalter in Tagen fest')
                .setValue('account_age')
                .setEmoji('📅'),
        );
}

function buildButtonRow(cfg, guildId, disabled = false) {
    const autoVerifizierenAn = cfg.verification?.autoVerifizieren?.enabled === true;
    return new ActionRowBuilder().addComponents(
        new ButtonBuilder()
            .setCustomId(`autoverify_cfg_criteria_${guildId}`)
            .setLabel('Kriterien ändern')
            .setStyle(ButtonStyle.Primary)
            .setEmoji('🎯')
            .setDeaktiviert(disabled),
        new ButtonBuilder()
            .setCustomId(`autoverify_cfg_toggle_${guildId}`)
            .setLabel('Auto-Verifizierung')
            .setStyle(autoVerifizierenAn ? ButtonStyle.Erfolg : ButtonStyle.Danger)
            .setEmoji('🤖')
            .setDeaktiviert(disabled),
    );
}

async function refreshDashboard(rootInteraction, cfg, guildId, client) {
    try {
        const selectMenu = buildSelectMenu(guildId);

        let conflictSummary = '';
        try {
            const welcomeConfig = await getWelcomeConfig(client, guildId);
            const verificationAktiviert = Boolean(cfg.verification?.enabled);
            const autoRoleConfigured = Boolean(cfg.autoRole) || (Array.isArray(welcomeConfig.roleIds) && welcomeConfig.roleIds.length > 0);
            
            const conflicts = [
                verificationAktiviert ? 'Verifizierungssystem ist aktiviert' : null,
                autoRoleConfigured ? 'AutoRole ist konfiguriert' : null
            ].filter(Boolean);
            
            if (conflicts.length > 0) {
                conflictSummary = conflicts.join('\n');
            }
        } catch (error) {
            logger.warn('Konflikte für das AutoVerifizieren-Dashboard konnten nicht abgerufen werden:', error.message);
        }
        
        await InteractionHelper.safeEditReply(rootInteraction, {
            embeds: [buildDashboardEmbed(cfg, rootInteraction.guild, conflictSummary)],
            components: [
                buildButtonRow(cfg, guildId),
                new ActionRowBuilder().addComponents(selectMenu),
            ],
            flags: MessageFlags.Ephemeral,
        });
    } catch (error) {
        logger.debug('AutoVerifizieren-Dashboard konnte nicht aktualisiert werden (Interaction ist möglicherweise abgelaufen):', error.message);
    }
}

export default {
    prefixAnly: false,
    async execute(interaction, config, client) {
        try {
            const guildId = interaction.guild.id;
            const guildConfig = await getGuildConfig(client, guildId);

            if (!guildConfig.verification?.autoVerifizieren?.enabled) {
                
                const welcomeConfig = await getWelcomeConfig(client, guildId);
                const verificationAktiviert = Boolean(guildConfig.verification?.enabled);
                const autoRoleConfigured = Boolean(guildConfig.autoRole) || (Array.isArray(welcomeConfig.roleIds) && welcomeConfig.roleIds.length > 0);
                
                const blockingMessage = [];
                if (verificationAktiviert) blockingMessage.push('Verifizierungssystem ist aktiviert');
                if (autoRoleConfigured) blockingMessage.push('AutoRole ist konfiguriert');

                const blockingText = blockingMessage.length > 0 
                    ? `\n\n⚠️ **Um AutoVerifizieren zu aktivieren, musst du zuerst Folgendes deaktivieren:**\n${blockingMessage.map(msg =>`• ${msg}`).join('\n')}`
                    : '';

                return await InteractionHelper.safeReply(interaction, {
                    embeds: [
                        new EmbedBuilder()
                            .setTitle('🤖 Auto-Verifizierungs-Dashboard')
                            .setDescription(`Auto-Verifizierung ist noch nicht konfiguriert.${blockingText}\n\nVerwende \`/autoverify setup\`, um sie einzurichten.`)
                            .setColor(getColor('warning'))
                            .setFooter({ text: 'Dashboard schließt nach 10 Minuten Inaktivität' })
                            .setTimestamp()
                    ],
                    flags: MessageFlags.Ephemeral
                });
            }

            await InteractionHelper.safeDefer(interaction, { ephemeral: true });

            const selectMenu = buildSelectMenu(guildId);

            let conflictSummary = '';
            try {
                const welcomeConfig = await getWelcomeConfig(client, guildId);
                const verificationAktiviert = Boolean(guildConfig.verification?.enabled);
                const autoRoleConfigured = Boolean(guildConfig.autoRole) || (Array.isArray(welcomeConfig.roleIds) && welcomeConfig.roleIds.length > 0);
                
                const conflicts = [
                    verificationAktiviert ? 'Verifizierungssystem ist aktiviert' : null,
                    autoRoleConfigured ? 'AutoRole ist konfiguriert' : null
                ].filter(Boolean);
                
                if (conflicts.length > 0) {
                    conflictSummary = conflicts.join('\n');
                }
            } catch (error) {
                logger.warn('Konflikte für das AutoVerifizieren-Dashboard konnten nicht abgerufen werden:', error.message);
            }

            await InteractionHelper.safeEditReply(interaction, {
                embeds: [buildDashboardEmbed(guildConfig, interaction.guild, conflictSummary)],
                components: [
                    buildButtonRow(guildConfig, guildId),
                    new ActionRowBuilder().addComponents(selectMenu),
                ],
                flags: MessageFlags.Ephemeral,
            });

            const collector = interaction.channel.createMessageComponentCollector({
                componentType: ComponentType.StringSelect,
                filter: i =>
                    i.user.id === interaction.user.id && i.customId === `autoverify_cfg_${guildId}`,
                time: 600_000,
            });

            collector.on('collect', async selectInteraction => {
                const selectedOption = selectInteraction.values[0];
                try {
                    switch (selectedOption) {
                        case 'role':
                            await handleRole(selectInteraction, interaction, guildConfig, guildId, client);
                            break;
                        case 'account_age':
                            await handleAccountAge(selectInteraction, interaction, guildConfig, guildId, client);
                            break;
                    }
                } catch (error) {
                    if (error instanceof TitanBotFehler) {
                        logger.debug(`Autoverify-Konfigurations-Validierungsfehler: ${error.message}`);
                    } else {
                        logger.error('Unerwarteter AutoVerifizieren-Dashboard-Fehler:', error);
                    }

                    const errorMessage =
                        error instanceof TitanBotFehler
                            ? error.userMessage || 'Beim Verarbeiten deiner Auswahl ist ein Fehler aufgetreten.'
                            : 'Beim Aktualisieren der Konfiguration ist ein unerwarteter Fehler aufgetreten.';

                    if (!selectInteraction.replied && !selectInteraction.deferred) {
                        await selectInteraction.deferUpdate().catch(() => {});
                    }

                    await replyUserFehler(selectInteraction, {
                        type: FehlerTypes.CONFIGURATION,
                        message: errorMessage,
                    }).catch(() => {});
                }
            });

            const btnCollector = interaction.channel.createMessageComponentCollector({
                componentType: ComponentType.Button,
                filter: i =>
                    i.user.id === interaction.user.id && 
                    (i.customId === `autoverify_cfg_toggle_${guildId}` || i.customId === `autoverify_cfg_criteria_${guildId}`),
                time: 600_000,
            });

            btnCollector.on('collect', async btnInteraction => {
                try {
                    if (btnInteraction.customId === `autoverify_cfg_criteria_${guildId}`) {
                        await handleKriterien(btnInteraction, interaction, guildConfig, guildId, client);
                    } else if (btnInteraction.customId === `autoverify_cfg_toggle_${guildId}`) {
                        await btnInteraction.deferUpdate().catch(() => null);
                        guildConfig.verification.autoVerifizieren.enabled = !guildConfig.verification.autoVerifizieren.enabled;
                        await setGuildConfig(client, guildId, guildConfig);
                        
                        await btnInteraction.followUp({
                            embeds: [
                                successEmbed(
                                    '✅ Status aktualisiert',
                                    `Auto-Verifizierung ist jetzt **${guildConfig.verification.autoVerifizieren.enabled ? 'aktiviert' : 'deaktiviert'}**.`,
                                ),
                            ],
                            flags: MessageFlags.Ephemeral,
                        });

                        await refreshDashboard(interaction, guildConfig, guildId, client);
                    }
                } catch (err) {
                    logger.debug('Fehler bei der Button-Interaktion:', err.message);
                }
            });

            collector.on('end', async (collected, reason) => {
                if (reason === 'time') {
                    btnCollector.stop();
                    try {
                        const timeoutEmbed = new EmbedBuilder()
                            .setTitle('Dashboard-Zeitüberschreitung')
                            .setDescription('Dieses Dashboard wurde aufgrund von Inaktivität geschlossen. Bitte führe den Befehl erneut aus, um fortzufahren.')
                            .setColor(getColor('error'));
                        await InteractionHelper.safeEditReply(interaction, {
                            embeds: [timeoutEmbed],
                            components: [],
                            flags: MessageFlags.Ephemeral,
                        });
                    } catch (error) {
                        logger.debug('Dashboard konnte bei Zeitüberschreitung nicht aktualisiert werden:', error.message);
                    }
                }
            });
        } catch (error) {
            if (error instanceof TitanBotFehler) throw error;
            logger.error('Unerwarteter Fehler in autoverify_dashboard:', error);
            throw new TitanBotFehler(
                `Auto-Verifizierungs-Dashboard fehlgeschlagen: ${error.message}`,
                FehlerTypes.UNKNOWN,
                'Das Auto-Verifizierungs-Dashboard konnte nicht geöffnet werden.',
            );
        }
    },
};

async function handleKriterien(selectInteraction, rootInteraction, guildConfig, guildId, client) {
    
    if (!selectInteraction.deferred) {
        await selectInteraction.deferUpdate().catch(() => null);
    }
    
    const criteriaEmbed = new EmbedBuilder()
        .setTitle('Verifizierungskriterien auswählen')
        .setDescription('Wähle die Kriterien für die automatische Verifizierung')
        .setColor(getColor('info'));

    const criteriaMenu = new StringSelectMenuBuilder()
        .setCustomId('autoverify_criteria_select')
        .setPlaceholder('Kriterien auswählen...')
        .addOptions(
            new StringSelectMenuOptionBuilder()
                .setLabel(`Kontoalter (älter als ${defaultAccountAgeDays} Tage)`)
                .setDescription('Benutzer mit älteren Konten werden automatisch verifiziert')
                .setValue('account_age'),
            new StringSelectMenuOptionBuilder()
                .setLabel('Keine Kriterien (alle verifizieren)')
                .setDescription('Alle Benutzer erhalten die Rolle sofort')
                .setValue('none'),
        );

    await selectInteraction.followUp({
        embeds: [criteriaEmbed],
        components: [new ActionRowBuilder().addComponents(criteriaMenu)],
        flags: MessageFlags.Ephemeral,
    });

    const criteriaCollector = rootInteraction.channel.createMessageComponentCollector({
        componentType: ComponentType.StringSelect,
        filter: i =>
            i.user.id === selectInteraction.user.id && i.customId === 'autoverify_criteria_select',
        time: 60_000,
        max: 1,
    });

    criteriaCollector.on('collect', async criteriaInteraction => {
        await criteriaInteraction.deferUpdate();
        const newKriterien = criteriaInteraction.values[0];

        guildConfig.verification.autoVerifizieren.criteria = newKriterien;

        if (newKriterien !== 'account_age') {
            guildConfig.verification.autoVerifizieren.accountAgeDays = null;
        } else if (!guildConfig.verification.autoVerifizieren.accountAgeDays) {
            guildConfig.verification.autoVerifizieren.accountAgeDays = defaultAccountAgeDays;
        }

        await setGuildConfig(client, guildId, guildConfig);

        let criteriaDisplay = '';
        switch (newKriterien) {
            case 'account_age':
                criteriaDisplay = `Kontoalter (${guildConfig.verification.autoVerifizieren.accountAgeDays} Tage)`;
                break;
            case 'none':
                criteriaDisplay = 'Keine Kriterien';
                break;
        }

        await criteriaInteraction.followUp({
            embeds: [successEmbed('Kriterien aktualisiert', `Die Auto-Verifizierungs-Kriterien wurden zu **${criteriaDisplay}** geändert.`)],
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

async function handleRole(selectInteraction, rootInteraction, guildConfig, guildId, client) {
    await selectInteraction.deferUpdate();

    const roleSelect = new RoleSelectMenuBuilder()
        .setCustomId('autoverify_role_select')
        .setPlaceholder('Wähle eine Rolle aus...')
        .setMaxValues(1);

    await selectInteraction.followUp({
        embeds: [
            new EmbedBuilder()
                .setTitle('Auto-Verifizierungsrolle')
                .setDescription('Wähle die Rolle aus, die automatisch verifizierten Benutzern zugewiesen wird.')
                .setColor(getColor('info')),
        ],
        components: [new ActionRowBuilder().addComponents(roleSelect)],
        flags: MessageFlags.Ephemeral,
    });

    const roleCollector = rootInteraction.channel.createMessageComponentCollector({
        componentType: ComponentType.RoleSelect,
        filter: i =>
            i.user.id === selectInteraction.user.id && i.customId === 'autoverify_role_select',
        time: 60_000,
        max: 1,
    });

    roleCollector.on('collect', async roleInteraction => {
        await roleInteraction.deferUpdate();
        const role = roleInteraction.roles.first();

        if (Rolle zu bekommen.id === rootInteraction.guild.id || Rolle zu bekommen.managed) {
            await replyUserFehler(roleInteraction, {
                type: FehlerTypes.VALIDATION,
                message: 'Bitte wähle eine normale zuweisbare Rolle aus (nicht @everyone und keine vom Bot verwaltete Rolle).',
            });
            return;
        }

        const botMember = rootInteraction.guild.members.me;
        if (Rolle zu bekommen.position >= botMember.roles.highest.position) {
            await replyUserFehler(roleInteraction, {
                type: FehlerTypes.PERMISSION,
                message: 'Die ausgewählte Rolle muss in der Server-Rollenhierarchie unter meiner höchsten Rolle liegen.',
            });
            return;
        }

        guildConfig.verification.autoVerifizieren.roleId = Rolle zu bekommen.id;
        await setGuildConfig(client, guildId, guildConfig);

        await roleInteraction.followUp({
            embeds: [successEmbed('Rolle aktualisiert', `Auto-Verifizierungsrolle wurde auf ${role} gesetzt.`)],
            flags: MessageFlags.Ephemeral,
        });

        await refreshDashboard(rootInteraction, guildConfig, guildId, client);
    });

    roleCollector.on('end', (collected, reason) => {
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
        .setCustomId('autoverify_account_age_modal')
        .setTitle('Anforderung für Kontoalter festlegen')
        .addComponents(
            new ActionRowBuilder().addComponents(
                new TextInputBuilder()
                    .setCustomId('age_input')
                    .setLabel('Minimales Kontoalter (Tage)')
                    .setStyle(TextInputStyle.Short)
                    .setPlaceholder(`Zwischen ${minAccountAgeDays} und ${maxAccountAgeDays}`)
                    .setValue((guildConfig.verification.autoVerifizieren.accountAgeDays || defaultAccountAgeDays).toString())
                    .setErforderlich(true),
            ),
        );

    await selectInteraction.showModal(modal);

    const submitted = await selectInteraction
        .awaitModalAbsenden({
            filter: i =>
                i.customId === 'autoverify_account_age_modal' && i.user.id === selectInteraction.user.id,
            time: 120_000,
        })
        .catch(() => null);

    if (!submitted) return;

    const inputValue = submitted.fields.getTextInputValue('age_input').trim();
    const days = parseInt(inputValue, 10);

    if (isNaN(days) || days < minAccountAgeDays || days > maxAccountAgeDays) {
        await replyUserFehler(submitted, { type: FehlerTypes.VALIDATION, message: `Bitte gib eine Zahl zwischen ${minAccountAgeDays} und ${maxAccountAgeDays} ein.` });
        return;
    }

    guildConfig.verification.autoVerifizieren.accountAgeDays = days;
    await setGuildConfig(client, guildId, guildConfig);

    await submitted.reply({
        embeds: [successEmbed('Kontoalter aktualisiert', `Die Mindestanforderung für das Kontoalter wurde auf **${days} Tage** gesetzt.`)],
        flags: MessageFlags.Ephemeral,
    });

    await refreshDashboard(rootInteraction, guildConfig, guildId, client);
}
