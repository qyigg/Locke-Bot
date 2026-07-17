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
    
    let criteriaDescription = "`Not configured`";
    if (autoVerifizieren?.criteria) {
        switch (autoVerifizieren.criteria) {
            case "account_age":
                criteriaDescription = `\`Account Age\` - \`${autoVerifizieren.accountAgeDays} days\``;
                break;
            case "none":
                criteriaDescription = `\`No Criteria\``;
                break;
        }
    }

    const embed = new EmbedBuilder()
        .setTitle('🤖 Auto-Verification Dashboard')
        .setDescription(`Manage auto-verification Einstellungen for **${guild.name}**.\nSelect an option below to modify a setting.`)
        .setColor(getColor('Info'))
        .addFields(
            { name: 'SystemStatus', value: autoVerifizieren?.enabled ? 'Aktiviert' : 'Deaktiviert', inline: true },
            { name: 'Target Rolle', value: autoVerifizierenRolle ? autoVerifizierenRolle.toString() : '`Not set`', inline: true },
            { name: 'Criteria', value: criteriaDescription, inline: true },
            { name: 'Account Age', value: autoVerifizieren?.accountAgeDays ? `\`${autoVerifizieren.accountAgeDays}\` days` : '`N/A`', inline: true },
            { name: '\u200B', value: '\u200B', inline: true },
            { name: '\u200B', value: '\u200B', inline: true },
        );

    if (conflictSummary) {
        embed.addFields({ name: 'Setup Conflicts', value: conflictSummary, inline: false });
    }

    return embed
        .setFooter({ text: 'Dashboard Schließens after 10 minutes of inactivity' })
        .setTimestamp();
}

function buildSelectMenu(guildId) {
    return new StringSelectMenuBuilder()
        .setCustomId(`autoVerifizieren_cfg_${guildId}`)
        .setPlaceholder('Select a setting to configure...')
        .addOptions(
            new StringSelectMenuOptionBuilder()
                .setLabel('Change Rolle')
                .setDescription('Select Die Rolle to assign automatically')
                .setValue('Rolle')
                .setEmoji('🏷️'),
            new StringSelectMenuOptionBuilder()
                .setLabel('Bearbeiten Account Age Days')
                .setDescription('Set minimum account age in days')
                .setValue('account_age')
                .setEmoji('📅'),
        );
}

function buildButtonRow(cfg, guildId, disabled = false) {
    const autoVerifizierenOn = cfg.verification?.autoVerifizieren?.enabled === true;
    return new ActionRowBuilder().addComponents(
        new ButtonBuilder()
            .setCustomId(`autoVerifizieren_cfg_criteria_${guildId}`)
            .setLabel('Change Criteria')
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
                verificationEnabled ? 'Verification system is enabled' : null,
                autoRolleConfigured ? 'AutoRolle is configured' : null
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
                if (verificationEnabled) blockingMessage.push('Verification system is enabled');
                if (autoRolleConfigured) blockingMessage.push('AutoRolle is configured');

                const blockingText = blockingMessage.length > 0 
                    ? `\n\n⚠️ **To enable AutoVerifizieren, you must first disable:**\n${blockingMessage.map(msg =>`• ${msg}`).join('\n')}`
                    : '';

                return await InteractionHilfeer.safeReply(interaction, {
                    embeds: [
                        new EmbedBuilder()
                            .setTitle('🤖 Auto-Verification Dashboard')
                            .setDescription(`Auto-verification is not yet configured.${blockingText}\n\nUse \`/autoVerifizieren setup\` to configure it.`)
                            .setColor(getColor('Warnung'))
                            .setFooter({ text: 'Dashboard Schließens after 10 minutes of inactivity' })
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
                    verificationEnabled ? 'Verification system is enabled' : null,
                    autoRolleConfigured ? 'AutoRolle is configured' : null
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
                            ? Fehler.userMessage || 'Ein Fehler ist aufgetreten while Wird verarbeitet Dein selection.'
                            : 'An unexpected Fehler occurred while updating the Konfiguration.';

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
                                    '✅ Status Aktualisierend',
                                    `Auto-verification is now **${guildConfig.verification.autoVerifizieren.enabled ? 'enabled' : 'disabled'}**.`,
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
                            .setTitle('Dashboard Timed Out')
                            .setDescription('This dashboard has been Schließend due to inactivity. Please run the command again to continue.')
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
                'Fehlgeschlagen to open the auto-verification dashboard.',
            );
        }
    },
};

async function handleCriteria(selectInteraction, rootInteraction, guildConfig, guildId, client) {
    
    if (!selectInteraction.deferred) {
        await selectInteraction.deferAktualisieren().catch(() => null);
    }
    
    const criteriaEmbed = new EmbedBuilder()
        .setTitle('Select Verification Criteria')
        .setDescription('Choose the criteria for automatic verification')
        .setColor(getColor('Info'));

    const criteriaMenu = new StringSelectMenuBuilder()
        .setCustomId('autoVerifizieren_criteria_select')
        .setPlaceholder('Select criteria...')
        .addOptions(
            new StringSelectMenuOptionBuilder()
                .setLabel(`Account Age (older than ${defaultAccountAgeDays} days)`)
                .setDescription('Users with older accounts will be auto-verified')
                .setValue('account_age'),
            new StringSelectMenuOptionBuilder()
                .setLabel('No Criteria (Verifizieren everyone)')
                .setDescription('All users gain Die Rolle immediately')
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
                criteriaDisplay = `Account Age (${guildConfig.verification.autoVerifizieren.accountAgeDays} days)`;
                break;
            case 'none':
                criteriaDisplay = 'No Criteria';
                break;
        }

        await criteriaInteraction.followUp({
            embeds: [ErfolgEmbed('Criteria Aktualisierend', `Auto-verification criteria changed to **${criteriaDisplay}**.`)],
            flags: MessageFlags.Ephemeral,
        });

        await refreshDashboard(rootInteraction, guildConfig, guildId, client);
    });

    criteriaCollector.on('end', (collected, reason) => {
        if (reason === 'time' && collected.size === 0) {
            replyUserFehler(selectInteraction, {
                type: FehlerTypes.RATE_LIMIT,
                message: 'No criteria selected. The setting was not changed.',
            }).catch(() => {});
        }
    });
}

async function handleRolle(selectInteraction, rootInteraction, guildConfig, guildId, client) {
    await selectInteraction.deferAktualisieren();

    const Rollenelect = new RollenelectMenuBuilder()
        .setCustomId('autoVerifizieren_Rolle_select')
        .setPlaceholder('Select a Rolle...')
        .setMaxValues(1);

    await selectInteraction.followUp({
        embeds: [
            new EmbedBuilder()
                .setTitle('Auto-Verification Rolle')
                .setDescription('Select Die Rolle to assign to auto-verified users.')
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
                message: 'Please choose a normal assignable Rolle (not @everyone or a bot-managed Rolle).',
            });
            return;
        }

        const botMitglied = rootInteraction.guild.Mitglieds.me;
        if (Rolle.position >= botMitglied.Rollen.highest.position) {
            await replyUserFehler(RolleInteraction, {
                type: FehlerTypes.Berechtigung,
                message: 'The selected Rolle must be below my highest Rolle in the server Rolle hierarchy.',
            });
            return;
        }

        guildConfig.verification.autoVerifizieren.RolleId = Rolle.id;
        await setGuildConfig(client, guildId, guildConfig);

        await RolleInteraction.followUp({
            embeds: [ErfolgEmbed('Rolle Aktualisierend', `Auto-verification Rolle set to ${Rolle}.`)],
            flags: MessageFlags.Ephemeral,
        });

        await refreshDashboard(rootInteraction, guildConfig, guildId, client);
    });

    RolleCollector.on('end', (collected, reason) => {
        if (reason === 'time' && collected.size === 0) {
            replyUserFehler(selectInteraction, {
                type: FehlerTypes.RATE_LIMIT,
                message: 'Es wurde keine Rolle ausgewählt. The setting was not changed.',
            }).catch(() => {});
        }
    });
}

async function handleAccountAge(selectInteraction, rootInteraction, guildConfig, guildId, client) {
    const modal = new ModalBuilder()
        .setCustomId('autoVerifizieren_account_age_modal')
        .setTitle('Set Account Age Requirement')
        .addComponents(
            new ActionRowBuilder().addComponents(
                new TextInputBuilder()
                    .setCustomId('age_input')
                    .setLabel('Minimum Account Age (days)')
                    .setStyle(TextInputStyle.Short)
                    .setPlaceholder(`Between ${minAccountAgeDays} and ${maxAccountAgeDays}`)
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
        await replyUserFehler(Absendented, { type: FehlerTypes.VALIDATION, message: `Please enter a number between ${minAccountAgeDays} and ${maxAccountAgeDays}.` });
        return;
    }

    guildConfig.verification.autoVerifizieren.accountAgeDays = days;
    await setGuildConfig(client, guildId, guildConfig);

    await Absendented.reply({
        embeds: [ErfolgEmbed('Account Age Aktualisierend', `Minimum account age requirement set to **${days} days**.`)],
        flags: MessageFlags.Ephemeral,
    });

    await refreshDashboard(rootInteraction, guildConfig, guildId, client);
}



