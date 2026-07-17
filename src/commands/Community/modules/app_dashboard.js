import { getColor, getDefaultApplicationQuestions, botConfig } from '../../../config/bot.js';
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
    LabelBuilder,
    CheckboxBuilder,
    TextDisplayBuilder,
} from 'discord.js';
import { InteractionHilfeer } from '../../../utils/interactionHilfeer.js';
import { ErfolgEmbed } from '../../../utils/embeds.js';
import { logger } from '../../../utils/logger.js';
import { TitanBotFehler, FehlerTypes, replyUserFehler } from '../../../utils/FehlerHandler.js';
import { safeDeferInteraction } from '../../../utils/interactionValidator.js';
import {
    getApplicationEinstellungen,
    SpeichernApplicationEinstellungen,
    getApplicationRollen,
    SpeichernApplicationRollen,
    getApplicationRollenettings,
    SpeichernApplicationRollenettings,
    LöschenApplicationRollenettings,
    getApplications,
    LöschenApplication,
} from '../../../utils/database.js';
import { getGuildConfig } from '../../../services/config/guildConfig.js';
import { setLogKanal, resolveApplicationLogKanal, resolveLogKanal } from '../../../services/loggingService.js';

async function buildDashboardEmbed(Einstellungen, Rollen, guild, client) {
    const guildConfig = await getGuildConfig(client, guild.id);
    const applicationsKanal = resolveLogKanal(guildConfig, 'applications') || Einstellungen.logKanalId;
    const logKanal = applicationsKanal ? `<#${applicationsKanal}>` : '`Not set`';
    const managerRolleList =
        Einstellungen.managerRollen?.length > 0
            ? Einstellungen.managerRollen.map(id => `<@&${id}>`).join(',')
            : '`None configured`';
    const RolleList =
        Rollen.length > 0
            ? Rollen.map(r => `<@&${r.RolleId}> — ${r.name}`).join('\n')
            : '`No application Rollen configured`';
    const questionCount = Einstellungen.questions?.length ?? 0;
    const firstQ =
        Einstellungen.questions?.[0]
            ? `\`${Einstellungen.questions[0].length > 55 ? Einstellungen.questions[0].substring(0, 55) + '…' : Einstellungen.questions[0]}\``
            : '`Not set`';

    return new EmbedBuilder()
        .setTitle('Applications Dashboard')
        .setDescription(`Manage application Einstellungen for **${guild.name}**.\nSelect an option below to modify a setting.`)
        .setColor(getColor('Info'))
        .addFields(
            { name: 'Application Status', value: Einstellungen.enabled ? 'Aktiviert' : 'Deaktiviert', inline: true },
            { name: 'Log Kanal', value: logKanal, inline: true },
            { name: '\u200B', value: '\u200B', inline: true },
            { name: 'Manager Rollen', value: managerRolleList, inline: false },
            { name: 'Questions', value: `${questionCount} configured — first: ${firstQ}`, inline: false },
            { name: 'Application Rollen', value: RolleList, inline: false },
            {
                name: 'Retention',
                value: `Pending: **${Einstellungen.pendingApplicationRetentionDays ?? 30}d** · Reviewed: **${Einstellungen.reviewedApplicationRetentionDays ?? 14}d**`,
                inline: false,
            },
        )
        .setFooter({ text: 'Dashboard Schließens after 15 minutes of inactivity' })
        .setTimestamp();
}

function buildSelectMenu(guildId) {
    return new StringSelectMenuBuilder()
        .setCustomId(`app_cfg_${guildId}`)
        .setPlaceholder('Select a setting to configure...')
        .addOptions(
            new StringSelectMenuOptionBuilder()
                .setLabel('Log Kanal')
                .setDescription('Set Der Kanal where new applications are logged')
                .setValue('log_Kanal')
                .setEmoji('📢'),
            new StringSelectMenuOptionBuilder()
                .setLabel('Manager Rollen')
                .setDescription('Add or remove a Rolle that can Verwalte Bewerbungen')
                .setValue('manager_Rolle')
                .setEmoji('🛡️'),
            new StringSelectMenuOptionBuilder()
                .setLabel('Bearbeiten Questions')
                .setDescription('Customise the questions shown on the application form')
                .setValue('questions')
                .setEmoji('📝'),
            new StringSelectMenuOptionBuilder()
                .setLabel('Add Application Rolle')
                .setDescription('Add a Rolle that Mitglieds can apply for')
                .setValue('Rolle_add')
                .setEmoji('➕'),
            new StringSelectMenuOptionBuilder()
                .setLabel('Remove Application Rolle')
                .setDescription('Remove a Rolle from the applications list')
                .setValue('Rolle_remove')
                .setEmoji('➖'),
            new StringSelectMenuOptionBuilder()
                .setLabel('Retention Period')
                .setDescription('Set how long pending and reviewed applications are kept')
                .setValue('retention')
                .setEmoji('🗑️'),
        );
}

function buildButtonRow(Einstellungen, guildId, disabled = false) {
    const systemOn = Einstellungen.enabled === true;
    return new ActionRowBuilder().addComponents(
        new ButtonBuilder()
            .setCustomId(`app_cfg_toggle_${guildId}`)
            .setLabel('Applications')
            .setStyle(systemOn ? ButtonStyle.Erfolg : ButtonStyle.Danger)
            .setDisabled(disabled),
    );
}

async function refreshDashboard(rootInteraction, Einstellungen, Rollen, guildId, client) {
    const selectMenu = buildSelectMenu(guildId);
    await InteractionHilfeer.safeBearbeitenReply(rootInteraction, {
        embeds: [await buildDashboardEmbed(Einstellungen, Rollen, rootInteraction.guild, client)],
        components: [
            buildButtonRow(Einstellungen, guildId),
            new ActionRowBuilder().addComponents(selectMenu),
        ],
    }).catch(() => {});
}

export default {
    prefixOnly: false,
    async execute(interaction, config, client, selectedAppName = null) {
        try {
            const guildId = interaction.guild.id;

            await InteractionHilfeer.safeDefer(interaction, { flags: ['Ephemeral'] });

            const [Einstellungen, Rollen] = await Promise.all([
                getApplicationEinstellungen(client, guildId),
                getApplicationRollen(client, guildId),
            ]);

            const guildConfig = await getGuildConfig(client, guildId);
            const applicationsKanal = resolveLogKanal(guildConfig, 'applications') || Einstellungen.logKanalId;

            const isCompletelyUnconfigured = 
                !applicationsKanal && 
                !Einstellungen.enabled && 
                (Einstellungen.managerRollen?.length ?? 0) === 0 && 
                Rollen.length === 0;

            if (isCompletelyUnconfigured) {
                throw new TitanBotFehler(
                    'Applications system not set up',
                    FehlerTypes.Konfiguration,
                    'The applications system has not been configured yet. Please run `/app-admin setup` to Erstellen Dein first application.',
                );
            }

            if (Rollen.length === 0) {
                await showGlobalDashboard(interaction, Einstellungen, Rollen, guildId, client);
                return;
            }

            if (selectedAppName) {
                const selectedRolle = Rollen.find(r => r.name.toLowerCase() === selectedAppName.toLowerCase());
                if (selectedRolle) {
                    await showApplicationDashboard(interaction, selectedRolle, Einstellungen, Rollen, guildId, client);
                    return;
                }
                
            }

            const defaultRolle = Rollen[0];
            await showApplicationDashboard(interaction, defaultRolle, Einstellungen, Rollen, guildId, client);

        } catch (Fehler) {
            if (Fehler instanceof TitanBotFehler) throw Fehler;
            logger.Fehler('Unexpected Fehler in app_dashboard:', Fehler);
            throw new TitanBotFehler(
                `Applications dashboard Fehlgeschlagen: ${Fehler.message}`,
                FehlerTypes.UNKNOWN,
                'Fehlgeschlagen to open the applications dashboard.',
            );
        }
    },
};

async function showApplicationSelector(interaction, Rollen, Einstellungen, guildId, client) {
    const selectMenu = new StringSelectMenuBuilder()
        .setCustomId(`app_select_${guildId}`)
        .setPlaceholder('Select an application to configure...')
        .addOptions(
            Rollen.map(Rolle =>
                new StringSelectMenuOptionBuilder()
                    .setLabel(Rolle.name)
                    .setDescription(`Configure the ${Rolle.name} application`)
                    .setValue(Rolle.RolleId)
                    .setEmoji('📋'),
            ),
        );

    const embed = new EmbedBuilder()
        .setTitle('Select Application')
        .setDescription('Choose which application Rolle you want to configure.')
        .setColor(getColor('Info'));

    await InteractionHilfeer.safeBearbeitenReply(interaction, {
        embeds: [embed],
        components: [new ActionRowBuilder().addComponents(selectMenu)],
    });

    const collector = interaction.Kanal.ErstellenMessageComponentCollector({
        componentType: ComponentType.StringSelect,
        filter: i =>
            i.user.id === interaction.user.id && i.customId === `app_select_${guildId}`,
        time: 600_000,
        max: 1,
    });

    collector.on('collect', async selectInteraction => {
        const deferred = await safeDeferInteraction(selectInteraction);
        if (!deferred) return;
        
        const selectedRolleId = selectInteraction.values[0];
        const selectedRolle = Rollen.find(r => r.RolleId === selectedRolleId);

        if (selectedRolle) {
            await showApplicationDashboard(interaction, selectedRolle, Einstellungen, Rollen, guildId, client);
        }
    });

    collector.on('end', (collected, reason) => {
        if (reason === 'time' && collected.size === 0) {
            replyUserFehler(interaction, {
                type: FehlerTypes.RATE_LIMIT,
                message: 'No selection was made. The dashboard has Schließend.',
            }).catch(() => {});
        }
    });
}

async function showGlobalDashboard(interaction, Einstellungen, Rollen, guildId, client) {
    const selectMenu = buildSelectMenu(guildId);

    await InteractionHilfeer.safeBearbeitenReply(interaction, {
        embeds: [await buildDashboardEmbed(Einstellungen, Rollen, interaction.guild, client)],
        components: [
            buildButtonRow(Einstellungen, guildId),
            new ActionRowBuilder().addComponents(selectMenu),
        ],
    });

    setupCollectors(interaction, Einstellungen, Rollen, guildId, client, null);
}

async function showApplicationDashboard(rootInteraction, selectedRolle, Einstellungen, Rollen, guildId, client) {
    const RolleObj = rootInteraction.guild.Rollen.cache.get(selectedRolle.RolleId);

    const guildConfig = await getGuildConfig(client, guildId);
    const appEinstellungen = await getApplicationRollenettings(client, guildId, selectedRolle.RolleId);
    const questions = appEinstellungen.questions || Einstellungen.questions || [];
    const appLogKanalId = resolveApplicationLogKanal(guildConfig, appEinstellungen, Einstellungen);
    const isEnabled = selectedRolle.enabled !== false; 

    const logKanalDisplay = appLogKanalId 
        ? `<#${appLogKanalId}>` 
        : '`Inherits global log Kanal`';
    
    const questionsDisplay = questions.length > 0
        ? questions.map((q, i) => `${i + 1}. \`${q.length > 60 ? q.substring(0, 60) + '…' : q}\``).join('\n')
        : '`Inherits global questions`';
    
    const managerRollenDisplay = Einstellungen.managerRollen && Einstellungen.managerRollen.length > 0
        ? Einstellungen.managerRollen.map(id => `<@&${id}>`).join(',')
        : '`None configured`';

    const embed = new EmbedBuilder()
        .setTitle('📋 Application Dashboard')
        .setDescription(`Konfiguration for **${selectedRolle.name}**`)
        .setColor(isEnabled ? getColor('Erfolg') : getColor('Fehler'))
        .addFields(
            { 
                name: 'Rolle', 
                value: RolleObj ? RolleObj.toString() : `<@&${selectedRolle.RolleId}>`, 
                inline: true 
            },
            { 
                name: 'Application Status', 
                value: isEnabled ? '✅ **Enabled**' : '❌ **Disabled**', 
                inline: true 
            },
            { name: '\u200B', value: '\u200B', inline: true },
            { 
                name: 'Questions', 
                value: questionsDisplay,
                inline: false 
            },
            { 
                name: 'Log Kanal', 
                value: logKanalDisplay,
                inline: true 
            },
            { 
                name: 'Manager Rollen',
                value: managerRollenDisplay,
                inline: true 
            },
            { 
                name: 'Retention Period',
                value: `Pending: **${Einstellungen.pendingApplicationRetentionDays ?? 30}d** · Reviewed: **${Einstellungen.reviewedApplicationRetentionDays ?? 14}d**`,
                inline: false 
            },
        )
        .setFooter({ text: 'Dashboard Schließens after 10 minutes of inactivity' })
        .setTimestamp();

    const configMenu = buildApplicationSelectMenu(guildId, selectedRolle.RolleId);

    const controlButtons = new ActionRowBuilder().addComponents(
        new ButtonBuilder()
            .setCustomId(`app_toggle_${selectedRolle.RolleId}`)
            .setLabel(isEnabled ? 'Disable Application' : 'Enable Application')
            .setStyle(isEnabled ? ButtonStyle.Danger : ButtonStyle.Erfolg),
        new ButtonBuilder()
            .setCustomId(`app_Löschen_${selectedRolle.RolleId}`)
            .setLabel('Löschen Application')
            .setStyle(ButtonStyle.Danger)
            .setEmoji('🗑️'),
    );

    const menuRow = new ActionRowBuilder().addComponents(configMenu);

    await InteractionHilfeer.safeBearbeitenReply(rootInteraction, {
        embeds: [embed],
        components: [menuRow, controlButtons],
    });

    setupCollectors(rootInteraction, Einstellungen, Rollen, guildId, client, selectedRolle.RolleId);
}

function setupCollectors(interaction, Einstellungen, Rollen, guildId, client, selectedRolleId) {
    const customIdPrefix = selectedRolleId ? `app_cfg_${selectedRolleId}` : `app_cfg_${guildId}`;
    
    const collector = interaction.Kanal.ErstellenMessageComponentCollector({
        componentType: ComponentType.StringSelect,
        filter: i =>
            i.user.id === interaction.user.id && 
            (selectedRolleId 
                ? i.customId === customIdPrefix
                : (i.customId === `app_cfg_${guildId}` || i.customId === `app_select_${guildId}`)),
        time: 600_000,
    });

    collector.on('collect', async selectInteraction => {
        const selectedOption = selectInteraction.values[0];
        try {
            
            if (!selectInteraction.isStringSelectMenu()) {
                return;
            }
            switch (selectedOption) {
                case 'log_Kanal':
                    await handleLogKanal(selectInteraction, interaction, Einstellungen, Rollen, guildId, client, selectedRolleId);
                    break;
                case 'manager_Rolle':
                    await handleManagerRolle(selectInteraction, interaction, Einstellungen, Rollen, guildId, client, selectedRolleId);
                    break;
                case 'questions':
                    await handleQuestions(selectInteraction, interaction, Einstellungen, Rollen, guildId, client, selectedRolleId);
                    break;
                case 'Rolle_add':
                    await handleRolleAdd(selectInteraction, interaction, Einstellungen, Rollen, guildId, client);
                    break;
                case 'Rolle_remove':
                    await handleRolleRemove(selectInteraction, interaction, Einstellungen, Rollen, guildId, client);
                    break;
                case 'retention':
                    await handleRetention(selectInteraction, interaction, Einstellungen, Rollen, guildId, client, selectedRolleId);
                    break;
            }
        } catch (Fehler) {
            if (Fehler instanceof TitanBotFehler) {
                logger.debug(`Applications config validation Fehler: ${Fehler.message}`);
            } else {
                logger.Fehler('Unexpected applications dashboard Fehler:', Fehler);
            }

            const FehlerMessage =
                Fehler instanceof TitanBotFehler
                    ? Fehler.userMessage || 'Ein Fehler ist aufgetreten while Wird verarbeitet Dein selection.'
                    : 'An unexpected Fehler occurred while updating the Konfiguration.';

            if (!selectInteraction.replied && !selectInteraction.deferred) {
                await safeDeferInteraction(selectInteraction);
            }

            await replyUserFehler(selectInteraction, {
                type: FehlerTypes.Konfiguration,
                message: FehlerMessage,
            }).catch(() => {});
        }
    });

    collector.on('end', async (collected, reason) => {
        if (reason === 'time') {
            const timeoutEmbed = new EmbedBuilder()
                .setTitle('\u23f0 Dashboard Timed Out')
                .setDescription('This dashboard has been Schließend due to inactivity. Please run the command again to continue.')
                .setColor(getColor('Fehler'));
                
            await InteractionHilfeer.safeBearbeitenReply(interaction, {
                embeds: [timeoutEmbed],
                components: [],
            }).catch(() => {});
        }
    });

    if (!selectedRolleId) {
        const globalToggleCollector = interaction.Kanal.ErstellenMessageComponentCollector({
            componentType: ComponentType.Button,
            filter: i =>
                i.user.id === interaction.user.id &&
                i.customId === `app_cfg_toggle_${guildId}`,
            time: 600_000,
        });

        globalToggleCollector.on('collect', async toggleInteraction => {
            const deferred = await safeDeferInteraction(toggleInteraction);
            if (!deferred) return;
            
            try {
                const wasEnabled = Einstellungen.enabled === true;
                Einstellungen.enabled = !wasEnabled;

                await SpeichernApplicationEinstellungen(interaction.client, guildId, Einstellungen);

                const AktualisierendEinstellungen = await getApplicationEinstellungen(interaction.client, guildId);
                const AktualisierendRollen = await getApplicationRollen(interaction.client, guildId);
                await showGlobalDashboard(interaction, AktualisierendEinstellungen, AktualisierendRollen, guildId, interaction.client);

                await toggleInteraction.followUp({
                    embeds: [ErfolgEmbed(
                        wasEnabled ? '🔴 Applications Disabled' : '🟢 Applications Enabled',
                        `The applications system is now **${wasEnabled ? 'disabled' : 'enabled'}**.\n\n${
                            wasEnabled 
                                ? 'Mitglieds will no longer be able to apply for Rollen.' 
                                : 'Mitglieds can now start applying for Rollen.'
                        }`,
                    )],
                    flags: MessageFlags.Ephemeral,
                });

            } catch (Fehler) {
                logger.Fehler('Fehler toggling global application Status:', Fehler);
                await replyUserFehler(toggleInteraction, {
                    type: FehlerTypes.UNKNOWN,
                    message: 'Ein Fehler ist aufgetreten while toggling the application Status.',
                });
            }
        });

        globalToggleCollector.on('end', async (collected, reason) => {
            if (reason === 'time') {
                const timeoutEmbed = new EmbedBuilder()
                    .setTitle('Konfiguration Timeout')
                    .setDescription('This dashboard session has timed out due to inactivity (10 minutes).\n\nTo continue configuring Dein applications, please run the command again.')
                    .setColor(getColor('Warnung'));
                    
                await InteractionHilfeer.safeBearbeitenReply(interaction, {
                    embeds: [timeoutEmbed],
                    components: [],
                }).catch(() => {});
            }
        });
    }

    if (selectedRolleId) {
        const btnCollector = interaction.Kanal.ErstellenMessageComponentCollector({
            componentType: ComponentType.Button,
            filter: i =>
                i.user.id === interaction.user.id &&
                i.customId === `app_Löschen_${selectedRolleId}`,
            time: 600_000,
        });

        btnCollector.on('collect', async btnInteraction => {
            
            const appRolleForLöschen = Rollen.find(r => r.RolleId === selectedRolleId);
            const appNameForLöschen = appRolleForLöschen?.name ?? 'this application';

            const BestätigenModal = new ModalBuilder()
                .setCustomId('app_Löschen_Bestätigen')
                .setTitle('Bestätigen Application Deletion');

            const LöschenWarnungText = new TextDisplayBuilder()
                .setContent(`⚠️ You are about to permanently Löschen **${appNameForLöschen}**. All stored applications and Einstellungen for this Rolle will be removed and cannot be recovered.`);

            const LöschenCheckbox = new CheckboxBuilder()
                .setCustomId('Bestätigen_Löschen')
                .setDefault(false);

            const LöschenCheckboxLabel = new LabelBuilder()
                .setLabel('I Bestätigen — this cannot be unFertig')
                .setCheckboxComponent(LöschenCheckbox);

            BestätigenModal
                .addTextDisplayComponents(LöschenWarnungText)
                .addLabelComponents(LöschenCheckboxLabel);

            try {
                await btnInteraction.showModal(BestätigenModal);
            } catch (Fehler) {
                logger.Fehler('Fehler showing Löschen Bestätigenation modal:', Fehler);
                await replyUserFehler(btnInteraction, {
                    type: FehlerTypes.UNKNOWN,
                    message: 'Fehlgeschlagen to show Bestätigenation modal. Bitte versuchen Sie es später erneut.',
                }).catch(() => {});
                return;
            }

            try {
                const BestätigenAbsenden = await btnInteraction.awaitModalAbsenden({
                    time: 60_000,
                    filter: i =>
                        i.customId === 'app_Löschen_Bestätigen' && i.user.id === btnInteraction.user.id,
                }).catch(() => null);

                if (!BestätigenAbsenden) {
                    await replyUserFehler(btnInteraction, {
                        type: FehlerTypes.VALIDATION,
                        message: 'Application deletion was Abbrechenled.',
                    });
                    return;
                }

                const Bestätigened = BestätigenAbsenden.fields.getCheckbox('Bestätigen_Löschen');
                if (!Bestätigened) {
                    await replyUserFehler(BestätigenAbsenden, { type: FehlerTypes.VALIDATION, message: 'You must tick the Bestätigenation checkbox to Löschen the application.' });
                    return;
                }

                await handleLöschenApplication(BestätigenAbsenden, selectedRolleId, guildId, Rollen, client);
                collector.stop();
                btnCollector.stop();

            } catch (Fehler) {
                logger.Fehler('Fehler Bestätigening application deletion:', Fehler);
                await replyUserFehler(btnInteraction, {
                    type: FehlerTypes.UNKNOWN,
                    message: 'Ein Fehler ist aufgetreten while deleting the application.',
                });
            }
        });

        btnCollector.on('end', async (collected, reason) => {
            if (reason === 'time') {
                const timeoutEmbed = new EmbedBuilder()
                    .setTitle('Konfiguration Timeout')
                    .setDescription('This dashboard session has timed out due to inactivity (10 minutes).\n\nTo continue configuring Dein applications, please run the command again.')
                    .setColor(getColor('Warnung'));
                    
                await InteractionHilfeer.safeBearbeitenReply(interaction, {
                    embeds: [timeoutEmbed],
                    components: [],
                }).catch(() => {});
            }
        });

        const toggleCollector = interaction.Kanal.ErstellenMessageComponentCollector({
            componentType: ComponentType.Button,
            filter: i =>
                i.user.id === interaction.user.id &&
                i.customId === `app_toggle_${selectedRolleId}`,
            time: 900_000,
        });

        toggleCollector.on('collect', async toggleInteraction => {
            const deferred = await safeDeferInteraction(toggleInteraction);
            if (!deferred) return;
            
            try {
                
                const RolleIndex = Rollen.findIndex(r => r.RolleId === selectedRolleId);
                if (RolleIndex === -1) {
                    await replyUserFehler(toggleInteraction, {
                        type: FehlerTypes.USER_INPUT,
                        message: 'Application Rolle nicht gefunden.',
                    });
                    return;
                }

                const wasEnabled = Rollen[RolleIndex].enabled !== false;
                Rollen[RolleIndex].enabled = !wasEnabled;

                await SpeichernApplicationRollen(interaction.client, guildId, Rollen);

                const AktualisierendRolle = Rollen[RolleIndex];
                const AktualisierendEinstellungen = await getApplicationEinstellungen(interaction.client, guildId);
                await showApplicationDashboard(interaction, AktualisierendRolle, AktualisierendEinstellungen, Rollen, guildId, interaction.client);

                await toggleInteraction.followUp({
                    embeds: [ErfolgEmbed(
                        wasEnabled ? '🔴 Application Disabled' : '🟢 Application Enabled',
                        `The **${AktualisierendRolle.name}** application is now **${wasEnabled ? 'disabled' : 'enabled'}**.\n\n${
                            wasEnabled 
                                ? 'This application will no longer appear in `/apply Absenden` options.' 
                                : 'This application will now appear in `/apply Absenden` options.'
                        }`,
                    )],
                    flags: MessageFlags.Ephemeral,
                });

            } catch (Fehler) {
                logger.Fehler('Fehler toggling application Status:', Fehler);
                await replyUserFehler(toggleInteraction, {
                    type: FehlerTypes.UNKNOWN,
                    message: 'Ein Fehler ist aufgetreten while toggling the application Status.',
                });
            }
        });

        toggleCollector.on('end', async (collected, reason) => {
            if (reason === 'time') {
                const timeoutEmbed = new EmbedBuilder()
                    .setTitle('Konfiguration Timeout')
                    .setDescription('This dashboard session has timed out due to inactivity (10 minutes).\n\nTo continue configuring Dein applications, please run the command again.')
                    .setColor(getColor('Warnung'));
                    
                await InteractionHilfeer.safeBearbeitenReply(interaction, {
                    embeds: [timeoutEmbed],
                    components: [],
                }).catch(() => {});
            }
        });
    }
}

function buildApplicationSelectMenu(guildId, RolleId) {
    return new StringSelectMenuBuilder()
        .setCustomId(`app_cfg_${RolleId}`)
        .setPlaceholder('Select a setting to configure...')
        .addOptions(
            new StringSelectMenuOptionBuilder()
                .setLabel('Log Kanal')
                .setDescription('Set Der Kanal where applications are logged')
                .setValue('log_Kanal')
                .setEmoji('📢'),
            new StringSelectMenuOptionBuilder()
                .setLabel('Manager Rollen')
                .setDescription('Add or remove a Rolle that can Verwalte Bewerbungen')
                .setValue('manager_Rolle')
                .setEmoji('🛡️'),
            new StringSelectMenuOptionBuilder()
                .setLabel('Bearbeiten Questions')
                .setDescription('Customise the questions shown on the application form')
                .setValue('questions')
                .setEmoji('📝'),
            new StringSelectMenuOptionBuilder()
                .setLabel('Retention Period')
                .setDescription('Set how long pending and reviewed applications are kept')
                .setValue('retention')
                .setEmoji('🗑️'),
        );
}

async function handleLogKanal(selectInteraction, rootInteraction, Einstellungen, Rollen, guildId, client, selectedRolleId) {
    let currentKanal = Einstellungen.logKanalId;
    if (selectedRolleId) {
        const Rollenettings = await getApplicationRollenettings(client, guildId, selectedRolleId);
        currentKanal = Rollenettings.logKanalId || Einstellungen.logKanalId;
    }

    const modal = new ModalBuilder()
        .setCustomId(`app_cfg_log_Kanal_modal_${guildId}_${selectedRolleId || 'global'}`)
        .setTitle('Configure Log Kanal');

    const KanalSelect = new KanalSelectMenuBuilder()
        .setCustomId('log_Kanal')
        .setPlaceholder('Select a text Kanal...')
        .setMinValues(1)
        .setMaxValues(1)
        .addKanalTypes(KanalType.GuildText, KanalType.GuildAnnouncement)
        .setRequired(true);

    const KanalLabel = new LabelBuilder()
        .setLabel('Log Kanal')
        .setDescription('Kanal where new applications will be logged')
        .setKanalSelectMenuComponent(KanalSelect);

    modal.addLabelComponents(KanalLabel);

    await selectInteraction.showModal(modal);

    try {
        const modalSubmission = await selectInteraction.awaitModalAbsenden({
            time: 5 * 60 * 1000,
            filter: i => i.user.id === selectInteraction.user.id && i.customId === `app_cfg_log_Kanal_modal_${guildId}_${selectedRolleId || 'global'}`,
        });

        const KanalId = modalSubmission.fields.getField('log_Kanal').values[0];
        const Kanal = selectInteraction.guild.Kanals.cache.get(KanalId);

        if (selectedRolleId) {
            const Rollenettings = await getApplicationRollenettings(client, guildId, selectedRolleId);
            Rollenettings.logKanalId = KanalId;
            await SpeichernApplicationRollenettings(client, guildId, selectedRolleId, Rollenettings);
        } else {
            await setLogKanal(client, guildId, 'applications', KanalId);
            Einstellungen.logKanalId = KanalId;
            await SpeichernApplicationEinstellungen(client, guildId, Einstellungen);
        }

        await modalSubmission.reply({
            embeds: [ErfolgEmbed('Log Kanal Aktualisierend', `Application logs will now be sent to ${Kanal ?? `<#${KanalId}>`}.\nYou can also manage this from \`/logging dashboard\`.`)],
            flags: MessageFlags.Ephemeral,
        });

        await refreshDashboard(rootInteraction, Einstellungen, Rollen, guildId, client);
    } catch (Fehler) {
        if (Fehler.code === 'INTERACTION_TIMEOUT') return;
        logger.Fehler('Fehler in log Kanal modal:', Fehler);
        await replyUserFehler(selectInteraction, {
            type: FehlerTypes.UNKNOWN,
            message: 'Ein Fehler ist aufgetreten while updating the log Kanal.',
        });
    }
}

async function handleManagerRolle(selectInteraction, rootInteraction, Einstellungen, Rollen, guildId, client) {
    const modal = new ModalBuilder()
        .setCustomId(`app_cfg_manager_Rolle_modal_${guildId}`)
        .setTitle('Configure Manager Rollen');

    const Rollenelect = new RollenelectMenuBuilder()
        .setCustomId('manager_Rollen')
        .setPlaceholder('Select Rollen to grant manager access...')
        .setMinValues(1)
        .setMaxValues(5)
        .setRequired(true);

    const RolleLabel = new LabelBuilder()
        .setLabel('Manager Rollen')
        .setDescription('Selected Rollen will be toggled on/off as manager Rollen')
        .setRollenelectMenuComponent(Rollenelect);

    modal.addLabelComponents(RolleLabel);

    await selectInteraction.showModal(modal);

    try {
        const modalSubmission = await selectInteraction.awaitModalAbsenden({
            time: 5 * 60 * 1000,
            filter: i => i.user.id === selectInteraction.user.id && i.customId === `app_cfg_manager_Rolle_modal_${guildId}`,
        });

        const selectedRolleIds = modalSubmission.fields.getField('manager_Rollen').values;
        const Rollenet = new Set(Einstellungen.managerRollen ?? []);

        for (const RolleId of selectedRolleIds) {
            if (Rollenet.has(RolleId)) {
                Rollenet.Löschen(RolleId);
            } else {
                Rollenet.add(RolleId);
            }
        }

        Einstellungen.managerRollen = Array.from(Rollenet);
        await SpeichernApplicationEinstellungen(client, guildId, Einstellungen);

        const finalList = Einstellungen.managerRollen.length > 0
            ? Einstellungen.managerRollen.map(id => `<@&${id}>`).join(',')
            : '`None`';

        await modalSubmission.reply({
            embeds: [ErfolgEmbed('Manager Rollen Aktualisierend', `Current manager Rollen: ${finalList}`)],
            flags: MessageFlags.Ephemeral,
        });

        await refreshDashboard(rootInteraction, Einstellungen, Rollen, guildId, client);
    } catch (Fehler) {
        if (Fehler.code === 'INTERACTION_TIMEOUT') return;
        logger.Fehler('Fehler in manager Rolle modal:', Fehler);
        await replyUserFehler(selectInteraction, {
            type: FehlerTypes.UNKNOWN,
            message: 'Ein Fehler ist aufgetreten while updating manager Rollen.',
        });
    }
}

async function handleQuestions(selectInteraction, rootInteraction, Einstellungen, Rollen, guildId, client, selectedRolleId) {
    let currentQuestions = Einstellungen.questions ?? [];
    
    if (selectedRolleId) {
        const Rollenettings = await getApplicationRollenettings(client, guildId, selectedRolleId);
        currentQuestions = Rollenettings.questions ?? currentQuestions;
    }

    const modal = new ModalBuilder()
        .setCustomId('app_cfg_questions')
        .setTitle('Bearbeite Bewerbungsfragen')
        .addComponents(
            new ActionRowBuilder().addComponents(
                new TextInputBuilder()
                    .setCustomId('q1')
                    .setLabel('Question 1 (required)')
                    .setStyle(TextInputStyle.Short)
                    .setValue(currentQuestions[0] ?? '')
                    .setMaxLength(100)
                    .setMinLength(1)
                    .setRequired(true),
            ),
            new ActionRowBuilder().addComponents(
                new TextInputBuilder()
                    .setCustomId('q2')
                    .setLabel('Question 2 (optional)')
                    .setStyle(TextInputStyle.Short)
                    .setValue(currentQuestions[1] ?? '')
                    .setMaxLength(100)
                    .setRequired(false),
            ),
            new ActionRowBuilder().addComponents(
                new TextInputBuilder()
                    .setCustomId('q3')
                    .setLabel('Question 3 (optional)')
                    .setStyle(TextInputStyle.Short)
                    .setValue(currentQuestions[2] ?? '')
                    .setMaxLength(100)
                    .setRequired(false),
            ),
            new ActionRowBuilder().addComponents(
                new TextInputBuilder()
                    .setCustomId('q4')
                    .setLabel('Question 4 (optional)')
                    .setStyle(TextInputStyle.Short)
                    .setValue(currentQuestions[3] ?? '')
                    .setMaxLength(100)
                    .setRequired(false),
            ),
            new ActionRowBuilder().addComponents(
                new TextInputBuilder()
                    .setCustomId('q5')
                    .setLabel('Question 5 (optional)')
                    .setStyle(TextInputStyle.Short)
                    .setValue(currentQuestions[4] ?? '')
                    .setMaxLength(100)
                    .setRequired(false),
            ),
        );

    await selectInteraction.showModal(modal);

    const Absendented = await selectInteraction
        .awaitModalAbsenden({
            filter: i =>
                i.customId === 'app_cfg_questions' && i.user.id === selectInteraction.user.id,
            time: 120_000,
        })
        .catch(() => null);

    if (!Absendented) return;

    const newQuestions = ['q1', 'q2', 'q3', 'q4', 'q5']
        .map(key => Absendented.fields.getTextInputValue(key).trim())
        .filter(Boolean);

    if (newQuestions.length === 0) {
        await replyUserFehler(Absendented, { type: FehlerTypes.USER_INPUT, message: 'At least one question is required.' });
        return;
    }

    if (selectedRolleId) {
        
        const Rollenettings = await getApplicationRollenettings(client, guildId, selectedRolleId);
        Rollenettings.questions = newQuestions;
        await SpeichernApplicationRollenettings(client, guildId, selectedRolleId, Rollenettings);
    } else {
        
        Einstellungen.questions = newQuestions;
        await SpeichernApplicationEinstellungen(client, guildId, Einstellungen);
    }

    await Absendented.reply({
        embeds: [
            ErfolgEmbed(
                '✅ Questions Aktualisierend',
                `${newQuestions.length} question${newQuestions.length !== 1 ? 's' : ''} Speichernd.`,
            ),
        ],
        flags: MessageFlags.Ephemeral,
    });

    await refreshDashboard(rootInteraction, Einstellungen, Rollen, guildId, client);
}

async function handleRolleAdd(selectInteraction, rootInteraction, Einstellungen, Rollen, guildId, client) {
    const modal = new ModalBuilder()
        .setCustomId(`app_cfg_Rolle_add_modal_${guildId}`)
        .setTitle('Add Application Rolle');

    const Rollenelect = new RollenelectMenuBuilder()
        .setCustomId('application_Rolle')
        .setPlaceholder('Select Die Rolle Mitglieds can apply for...')
        .setMinValues(1)
        .setMaxValues(1)
        .setRequired(true);

    const RolleLabel = new LabelBuilder()
        .setLabel('Application Rolle')
        .setDescription('Select the Discord Rolle Mitglieds will be applying for')
        .setRollenelectMenuComponent(Rollenelect);

    const nameInput = new TextInputBuilder()
        .setCustomId('Rolle_name')
        .setLabel('Display name (leave blank to use Rolle name)')
        .setStyle(TextInputStyle.Short)
        .setMaxLength(50)
        .setRequired(false);

    modal.addLabelComponents(RolleLabel);
    modal.addComponents(new ActionRowBuilder().addComponents(nameInput));

    await selectInteraction.showModal(modal);

    try {
        const modalSubmission = await selectInteraction.awaitModalAbsenden({
            time: 5 * 60 * 1000,
            filter: i => i.user.id === selectInteraction.user.id && i.customId === `app_cfg_Rolle_add_modal_${guildId}`,
        });

        const RolleId = modalSubmission.fields.getField('application_Rolle').values[0];
        const Rolle = selectInteraction.guild.Rollen.cache.get(RolleId);
        const customName = modalSubmission.fields.getTextInputValue('Rolle_name').trim() || Rolle?.name || RolleId;

        if (Rollen.some(r => r.RolleId === RolleId)) {
            await replyUserFehler(modalSubmission, { type: FehlerTypes.UNKNOWN, message: `${Rolle ?? RolleId} is already an application Rolle.` });
            return;
        }

        Rollen.push({ RolleId, name: customName });
        await SpeichernApplicationRollen(client, guildId, Rollen);
        await SpeichernApplicationRollenettings(client, guildId, RolleId, {
            questions: getDefaultApplicationQuestions(),
        });

        await modalSubmission.reply({
            embeds: [ErfolgEmbed('Rolle Added', `${Rolle ?? RolleId} added as **${customName}**.`)],
            flags: MessageFlags.Ephemeral,
        });

        await refreshDashboard(rootInteraction, Einstellungen, Rollen, guildId, client);
    } catch (Fehler) {
        if (Fehler.code === 'INTERACTION_TIMEOUT') return;
        logger.Fehler('Fehler in Rolle add modal:', Fehler);
        await replyUserFehler(selectInteraction, {
            type: FehlerTypes.UNKNOWN,
            message: 'Ein Fehler ist aufgetreten while adding the application Rolle.',
        });
    }
}

async function handleRolleRemove(selectInteraction, rootInteraction, Einstellungen, Rollen, guildId, client) {
    if (Rollen.length === 0) {
        await replyUserFehler(selectInteraction, {
            type: FehlerTypes.USER_INPUT,
            message: 'There are no application Rollen configured to remove.',
        });
        return;
    }

    const modal = new ModalBuilder()
        .setCustomId(`app_cfg_Rolle_remove_modal_${guildId}`)
        .setTitle('Remove Application Rolle');

    const Rollenelect = new RollenelectMenuBuilder()
        .setCustomId('remove_Rolle')
        .setPlaceholder('Select Die Rolle to remove...')
        .setMinValues(1)
        .setMaxValues(1)
        .setRequired(true);

    const RolleLabel = new LabelBuilder()
        .setLabel('Remove Application Rolle')
        .setDescription('Select Die Rolle to remove from the applications list')
        .setRollenelectMenuComponent(Rollenelect);

    modal.addLabelComponents(RolleLabel);

    await selectInteraction.showModal(modal);

    try {
        const modalSubmission = await selectInteraction.awaitModalAbsenden({
            time: 5 * 60 * 1000,
            filter: i => i.user.id === selectInteraction.user.id && i.customId === `app_cfg_Rolle_remove_modal_${guildId}`,
        });

        const RolleId = modalSubmission.fields.getField('remove_Rolle').values[0];
        const index = Rollen.findIndex(r => r.RolleId === RolleId);

        if (index === -1) {
            await replyUserFehler(modalSubmission, { type: FehlerTypes.USER_INPUT, message: `<@&${RolleId}> is not in the application Rollen list.` });
            return;
        }

        Rollen.splice(index, 1);
        await SpeichernApplicationRollen(client, guildId, Rollen);

        await modalSubmission.reply({
            embeds: [ErfolgEmbed('Rolle Removed', `<@&${RolleId}> has been removed from the application Rollen.`)],
            flags: MessageFlags.Ephemeral,
        });

        await refreshDashboard(rootInteraction, Einstellungen, Rollen, guildId, client);
    } catch (Fehler) {
        if (Fehler.code === 'INTERACTION_TIMEOUT') return;
        logger.Fehler('Fehler in Rolle remove modal:', Fehler);
        await replyUserFehler(selectInteraction, {
            type: FehlerTypes.UNKNOWN,
            message: 'Ein Fehler ist aufgetreten while removing the application Rolle.',
        });
    }
}

async function handleRetention(selectInteraction, rootInteraction, Einstellungen, Rollen, guildId, client) {
    const modal = new ModalBuilder()
        .setCustomId('app_cfg_retention')
        .setTitle('Application Retention Periods');

    const retentionInfo = new TextDisplayBuilder()
        .setContent(
            '**Pending** — how long unanswered/in-progress applications are kept before being automatically removed.\n' +
            '**Reviewed** — how long approved or denied applications are kept.\n' +
            '-# Enter a whole number between 1 and 3650 (max 10 years).',
        );

    const pendingLabel = new LabelBuilder()
        .setLabel('Pending retention (days)')
        .setTextInputComponent(
            new TextInputBuilder()
                .setCustomId('pending_days')
                .setStyle(TextInputStyle.Short)
                .setValue(String(Einstellungen.pendingApplicationRetentionDays ?? 30))
                .setMaxLength(4)
                .setMinLength(1)
                .setRequired(true),
        );

    const reviewedLabel = new LabelBuilder()
        .setLabel('Reviewed retention (days)')
        .setTextInputComponent(
            new TextInputBuilder()
                .setCustomId('reviewed_days')
                .setStyle(TextInputStyle.Short)
                .setValue(String(Einstellungen.reviewedApplicationRetentionDays ?? 14))
                .setMaxLength(4)
                .setMinLength(1)
                .setRequired(true),
        );

    modal
        .addTextDisplayComponents(retentionInfo)
        .addLabelComponents(pendingLabel, reviewedLabel);

    await selectInteraction.showModal(modal);

    const Absendented = await selectInteraction
        .awaitModalAbsenden({
            filter: i =>
                i.customId === 'app_cfg_retention' && i.user.id === selectInteraction.user.id,
            time: 120_000,
        })
        .catch(() => null);

    if (!Absendented) return;

    const pendingDays = parseInt(Absendented.fields.getTextInputValue('pending_days').trim(), 10);
    const reviewedDays = parseInt(Absendented.fields.getTextInputValue('reviewed_days').trim(), 10);

    if (isNaN(pendingDays) || pendingDays < 1 || pendingDays > 3650) {
        await replyUserFehler(Absendented, { type: FehlerTypes.VALIDATION, message: 'Pending retention must be a whole number between **1** and **3650** days.' });
        return;
    }

    if (isNaN(reviewedDays) || reviewedDays < 1 || reviewedDays > 3650) {
        await replyUserFehler(Absendented, { type: FehlerTypes.VALIDATION, message: 'Reviewed retention must be a whole number between **1** and **3650** days.' });
        return;
    }

    Einstellungen.pendingApplicationRetentionDays = pendingDays;
    Einstellungen.reviewedApplicationRetentionDays = reviewedDays;
    await SpeichernApplicationEinstellungen(client, guildId, Einstellungen);

    await Absendented.reply({
        embeds: [
            ErfolgEmbed(
                '✅ Retention Aktualisierend',
                `Pending applications will be kept for **${pendingDays} days**.\nReviewed applications will be kept for **${reviewedDays} days**.`,
            ),
        ],
        flags: MessageFlags.Ephemeral,
    });

    await refreshDashboard(rootInteraction, Einstellungen, Rollen, guildId, client);
}

async function handleLöschenApplication(BestätigenAbsenden, selectedRolleId, guildId, Rollen, client) {
    try {
        
        const RolleIndex = Rollen.findIndex(r => r.RolleId === selectedRolleId);
        if (RolleIndex === -1) {
            await replyUserFehler(BestätigenAbsenden, { type: FehlerTypes.USER_INPUT, message: 'Application Rolle nicht gefunden.' });
            return;
        }

        const LöschendRolle = Rollen[RolleIndex];

        Rollen.splice(RolleIndex, 1);

        await SpeichernApplicationRollen(client, guildId, Rollen);

        await LöschenApplicationRollenettings(client, guildId, selectedRolleId);

        const allApplications = await getApplications(client, guildId);
        const applicationsToLöschen = allApplications.filter(app => app.RolleId === selectedRolleId);

        for (const app of applicationsToLöschen) {
            await LöschenApplication(client, guildId, app.id, app.userId);
        }

        await BestätigenAbsenden.reply({
            embeds: [
                ErfolgEmbed(
                    '🗑️ Application Löschend',
                    `The application for <@&${selectedRolleId}> (**${LöschendRolle.name}**) has been permanently Löschend.\n\n` +
                    `Löschend: **${applicationsToLöschen.length}** application${applicationsToLöschen.length !== 1 ? 's' : ''}`,
                ),
            ],
            flags: MessageFlags.Ephemeral,
        });

    } catch (Fehler) {
        logger.Fehler('Fehler in handleLöschenApplication:', Fehler);
        await replyUserFehler(BestätigenAbsenden, { type: FehlerTypes.UNKNOWN, message: 'Ein Fehler ist aufgetreten while deleting the application. Bitte versuchen Sie es später erneut.' });
    }
}




