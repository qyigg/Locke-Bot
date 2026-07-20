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
    const logKanal = applicationsKanal ? `<#${applicationsKanal}>` : '`Nicht festgelegt`';
    const managerRolleList =
        Einstellungen.managerRollen?.length > 0
            ? Einstellungen.managerRollen.map(id => `<@&${id}>`).join(',')
            : '`Keine konfiguriert`';
    const RolleList =
        Rollen.length > 0
            ? Rollen.map(r => `<@&${r.RolleId}> — ${r.name}`).join('\n')
            : '`Keine Bewerbungsrollen konfiguriert`';
    const questionCount = Einstellungen.questions?.length ?? 0;
    const firstQ =
        Einstellungen.questions?.[0]
            ? `\`${Einstellungen.questions[0].length > 55 ? Einstellungen.questions[0].substring(0, 55) + '…' : Einstellungen.questions[0]}\``
            : '`Nicht festgelegt`';

    return new EmbedBuilder()
        .setTitle('Bewerbungs-Dashboard')
        .setDescription(`Bewerbungseinstellungen für **${guild.name}** verwalten.\nWähle unten eine Option, um eine Einstellung zu ändern.`)
        .setColor(getColor('Info'))
        .addFields(
            { name: 'Bewerbungsstatus', value: Einstellungen.enabled ? 'Aktiviert' : 'Deaktiviert', inline: true },
            { name: 'Log-Kanal', value: logKanal, inline: true },
            { name: '\u200B', value: '\u200B', inline: true },
            { name: 'Manager-Rollen', value: managerRolleList, inline: false },
            { name: 'Fragen', value: `${questionCount} konfiguriert — erste: ${firstQ}`, inline: false },
            { name: 'Bewerbungsrollen', value: RolleList, inline: false },
            {
                name: 'Aufbewahrung',
                value: `Ausstehend: **${Einstellungen.pendingApplicationRetentionDays ?? 30}T** · Bewertet: **${Einstellungen.reviewedApplicationRetentionDays ?? 14}T**`,
                inline: false,
            },
        )
        .setFooter({ text: 'Dashboard schließt nach 15 Minuten Inaktivität' })
        .setTimestamp();
}

function buildSelectMenu(guildId) {
    return new StringSelectMenuBuilder()
        .setCustomId(`app_cfg_${guildId}`)
        .setPlaceholder('Einstellung zum Konfigurieren auswählen...')
        .addOptions(
            new StringSelectMenuOptionBuilder()
                .setLabel('Log-Kanal')
                .setDescription('Den Kanal festlegen, in dem neue Bewerbungen protokolliert werden')
                .setValue('log_Kanal')
                .setEmoji('📢'),
            new StringSelectMenuOptionBuilder()
                .setLabel('Manager-Rollen')
                .setDescription('Eine Rolle hinzufügen oder entfernen, die Bewerbungen verwalten kann')
                .setValue('manager_Rolle')
                .setEmoji('🛡️'),
            new StringSelectMenuOptionBuilder()
                .setLabel('Fragen bearbeiten')
                .setDescription('Die auf dem Bewerbungsformular angezeigten Fragen anpassen')
                .setValue('questions')
                .setEmoji('📝'),
            new StringSelectMenuOptionBuilder()
                .setLabel('Bewerbungsrolle hinzufügen')
                .setDescription('Eine Rolle hinzufügen, für die sich Mitglieder bewerben können')
                .setValue('Rolle_add')
                .setEmoji('➕'),
            new StringSelectMenuOptionBuilder()
                .setLabel('Bewerbungsrolle entfernen')
                .setDescription('Eine Rolle aus der Bewerbungsliste entfernen')
                .setValue('Rolle_remove')
                .setEmoji('➖'),
            new StringSelectMenuOptionBuilder()
                .setLabel('Aufbewahrungsfrist')
                .setDescription('Legt fest, wie lange ausstehende und bewertete Bewerbungen gespeichert werden')
                .setValue('retention')
                .setEmoji('🗑️'),
        );
}

function buildButtonRow(Einstellungen, guildId, disabled = false) {
    const systemOn = Einstellungen.enabled === true;
    return new ActionRowBuilder().addComponents(
        new ButtonBuilder()
            .setCustomId(`app_cfg_toggle_${guildId}`)
            .setLabel('Bewerbungen')
            .setStyle(systemOn ? ButtonStyle.Success : ButtonStyle.Danger)
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
                    'Das Bewerbungssystem wurde noch nicht konfiguriert. Führe `/app-admin setup` aus, um deine erste Bewerbung zu erstellen.',
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
                'Das Bewerbungs-Dashboard konnte nicht geöffnet werden.',
            );
        }
    },
};

async function showApplicationSelector(interaction, Rollen, Einstellungen, guildId, client) {
    const selectMenu = new StringSelectMenuBuilder()
        .setCustomId(`app_select_${guildId}`)
        .setPlaceholder('Bewerbung zum Konfigurieren auswählen...')
        .addOptions(
            Rollen.map(Rolle =>
                new StringSelectMenuOptionBuilder()
                    .setLabel(Rolle.name)
                    .setDescription(`Die ${Rolle.name}-Bewerbung konfigurieren`)
                    .setValue(Rolle.RolleId)
                    .setEmoji('📋'),
            ),
        );

    const embed = new EmbedBuilder()
        .setTitle('Bewerbung auswählen')
        .setDescription('Wähle die Bewerbungsrolle, die du konfigurieren möchtest.')
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
                message: 'Keine Auswahl getroffen. Das Dashboard wurde geschlossen.',
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
        : '`Globalen Log-Kanal übernehmen`';
    
    const questionsDisplay = questions.length > 0
        ? questions.map((q, i) => `${i + 1}. \`${q.length > 60 ? q.substring(0, 60) + '…' : q}\``).join('\n')
        : '`Globale Fragen übernehmen`';
    
    const managerRollenDisplay = Einstellungen.managerRollen && Einstellungen.managerRollen.length > 0
        ? Einstellungen.managerRollen.map(id => `<@&${id}>`).join(',')
        : '`Keine konfiguriert`';

    const embed = new EmbedBuilder()
        .setTitle('📋 Bewerbungs-Dashboard')
        .setDescription(`Konfiguration für **${selectedRolle.name}**`)
        .setColor(isEnabled ? getColor('Erfolg') : getColor('Fehler'))
        .addFields(
            { 
                name: 'Rolle', 
                value: RolleObj ? RolleObj.toString() : `<@&${selectedRolle.RolleId}>`, 
                inline: true 
            },
            { 
                name: 'Bewerbungsstatus', 
                value: isEnabled ? '✅ **Aktiviert**' : '❌ **Deaktiviert**', 
                inline: true 
            },
            { name: '\u200B', value: '\u200B', inline: true },
            { 
                name: 'Fragen', 
                value: questionsDisplay,
                inline: false 
            },
            { 
                name: 'Log-Kanal', 
                value: logKanalDisplay,
                inline: true 
            },
            { 
                name: 'Manager-Rollen',
                value: managerRollenDisplay,
                inline: true 
            },
            { 
                name: 'Aufbewahrungsfrist',
                value: `Ausstehend: **${Einstellungen.pendingApplicationRetentionDays ?? 30}T** · Bewertet: **${Einstellungen.reviewedApplicationRetentionDays ?? 14}T**`,
                inline: false 
            },
        )
        .setFooter({ text: 'Dashboard schließt nach 10 Minuten Inaktivität' })
        .setTimestamp();

    const configMenu = buildApplicationSelectMenu(guildId, selectedRolle.RolleId);

    const controlButtons = new ActionRowBuilder().addComponents(
        new ButtonBuilder()
            .setCustomId(`app_toggle_${selectedRolle.RolleId}`)
            .setLabel(isEnabled ? 'Bewerbung deaktivieren' : 'Bewerbung aktivieren')
            .setStyle(isEnabled ? ButtonStyle.Danger : ButtonStyle.Success),
        new ButtonBuilder()
            .setCustomId(`app_Löschen_${selectedRolle.RolleId}`)
            .setLabel('Bewerbung löschen')
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
                    ? Fehler.userMessage || 'Ein Fehler ist bei der Verarbeitung deiner Auswahl aufgetreten.'
                    : 'Ein unerwarteter Fehler ist beim Aktualisieren der Konfiguration aufgetreten.';

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
                .setTitle('⏰ Dashboard abgelaufen')
                .setDescription('Dieses Dashboard wurde aufgrund von Inaktivität geschlossen. Führe den Befehl erneut aus, um fortzufahren.')
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
                        wasEnabled ? '🔴 Bewerbungen deaktiviert' : '🟢 Bewerbungen aktiviert',
                        `Das Bewerbungssystem ist jetzt **${wasEnabled ? 'deaktiviert' : 'aktiviert'}**.\n\n${
                            wasEnabled 
                                ? 'Mitglieder können sich nicht mehr für Rollen bewerben.' 
                                : 'Mitglieder können sich jetzt für Rollen bewerben.'
                        }`,
                    )],
                    flags: MessageFlags.Ephemeral,
                });

            } catch (Fehler) {
                logger.Fehler('Fehler toggling global application Status:', Fehler);
                await replyUserFehler(toggleInteraction, {
                    type: FehlerTypes.UNKNOWN,
                    message: 'Ein Fehler ist beim Umschalten des Bewerbungsstatus aufgetreten.',
                });
            }
        });

        globalToggleCollector.on('end', async (collected, reason) => {
            if (reason === 'time') {
                const timeoutEmbed = new EmbedBuilder()
                    .setTitle('Konfiguration Timeout')
                    .setDescription('Diese Dashboard-Sitzung ist aufgrund von Inaktivität abgelaufen (10 Minuten).\n\nFühre den Befehl erneut aus, um die Bewerbungen weiter zu konfigurieren.')
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
                .setTitle('Bewerbungslöschung bestätigen');

            const LöschenWarnungText = new TextDisplayBuilder()
                .setContent(`⚠️ Du bist dabei, **${appNameForLöschen}** dauerhaft zu löschen. Alle gespeicherten Bewerbungen und Einstellungen für diese Rolle werden entfernt und können nicht wiederhergestellt werden.`);

            const LöschenCheckbox = new CheckboxBuilder()
                .setCustomId('Bestätigen_Löschen')
                .setDefault(false);

            const LöschenCheckboxLabel = new LabelBuilder()
                .setLabel('Ich bestätige — diese Aktion kann nicht rückgängig gemacht werden')
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
                    message: 'Das Bestätigungsdialogfeld konnte nicht geöffnet werden. Bitte versuche es später erneut.',
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
                        message: 'Bewerbungslöschung wurde abgebrochen.',
                    });
                    return;
                }

                const Bestätigened = BestätigenAbsenden.fields.getCheckbox('Bestätigen_Löschen');
                if (!Bestätigened) {
                    await replyUserFehler(BestätigenAbsenden, { type: FehlerTypes.VALIDATION, message: 'Du musst das Bestätigungskästchen ankreuzen, um die Bewerbung zu löschen.' });
                    return;
                }

                await handleLöschenApplication(BestätigenAbsenden, selectedRolleId, guildId, Rollen, client);
                collector.stop();
                btnCollector.stop();

            } catch (Fehler) {
                logger.Fehler('Fehler Bestätigening application deletion:', Fehler);
                await replyUserFehler(btnInteraction, {
                    type: FehlerTypes.UNKNOWN,
                    message: 'Ein Fehler ist beim Löschen der Bewerbung aufgetreten.',
                });
            }
        });

        btnCollector.on('end', async (collected, reason) => {
            if (reason === 'time') {
                const timeoutEmbed = new EmbedBuilder()
                    .setTitle('Konfiguration Timeout')
                    .setDescription('Diese Dashboard-Sitzung ist aufgrund von Inaktivität abgelaufen (10 Minuten).\n\nFühre den Befehl erneut aus, um die Bewerbungen weiter zu konfigurieren.')
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
                        wasEnabled ? '🔴 Bewerbung deaktiviert' : '🟢 Bewerbung aktiviert',
                        `Die Bewerbung **${AktualisierendRolle.name}** ist jetzt **${wasEnabled ? 'deaktiviert' : 'aktiviert'}**.\n\n${
                            wasEnabled 
                                ? 'Diese Bewerbung erscheint nicht mehr in den `/apply Absenden`-Optionen.' 
                                : 'Diese Bewerbung erscheint jetzt in den `/apply Absenden`-Optionen.'
                        }`,
                    )],
                    flags: MessageFlags.Ephemeral,
                });

            } catch (Fehler) {
                logger.Fehler('Fehler toggling application Status:', Fehler);
                await replyUserFehler(toggleInteraction, {
                    type: FehlerTypes.UNKNOWN,
                    message: 'Ein Fehler ist beim Umschalten des Bewerbungsstatus aufgetreten.',
                });
            }
        });

        toggleCollector.on('end', async (collected, reason) => {
            if (reason === 'time') {
                const timeoutEmbed = new EmbedBuilder()
                    .setTitle('Konfiguration Timeout')
                    .setDescription('Diese Dashboard-Sitzung ist aufgrund von Inaktivität abgelaufen (10 Minuten).\n\nFühre den Befehl erneut aus, um die Bewerbungen weiter zu konfigurieren.')
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
        .setPlaceholder('Einstellung auswählen...')
        .addOptions(
            new StringSelectMenuOptionBuilder()
                .setLabel('Log-Kanal')
                .setDescription('Den Kanal festlegen, in dem Bewerbungen protokolliert werden')
                .setValue('log_Kanal')
                .setEmoji('📢'),
            new StringSelectMenuOptionBuilder()
                .setLabel('Manager-Rollen')
                .setDescription('Eine Rolle hinzufügen oder entfernen, die Bewerbungen verwalten kann')
                .setValue('manager_Rolle')
                .setEmoji('🛡️'),
            new StringSelectMenuOptionBuilder()
                .setLabel('Fragen bearbeiten')
                .setDescription('Die auf dem Bewerbungsformular angezeigten Fragen anpassen')
                .setValue('questions')
                .setEmoji('📝'),
            new StringSelectMenuOptionBuilder()
                .setLabel('Aufbewahrungsfrist')
                .setDescription('Legt fest, wie lange ausstehende und bewertete Bewerbungen gespeichert werden')
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
        .setTitle('Log-Kanal konfigurieren');

    const KanalSelect = new KanalSelectMenuBuilder()
        .setCustomId('log_Kanal')
        .setPlaceholder('Einen Text-Kanal auswählen...')
        .setMinValues(1)
        .setMaxValues(1)
        .addKanalTypes(KanalType.GuildText, KanalType.GuildAnnouncement)
        .setRequired(true);

    const KanalLabel = new LabelBuilder()
        .setLabel('Log-Kanal')
        .setDescription('Kanal, in dem neue Bewerbungen protokolliert werden')
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
            embeds: [ErfolgEmbed('Log-Kanal aktualisiert', `Bewerbungsprotokolle werden jetzt gesendet an ${Kanal ?? `<#${KanalId}>`}.\nDu kannst dies auch über \`/logging dashboard\` verwalten.`)],
            flags: MessageFlags.Ephemeral,
        });

        await refreshDashboard(rootInteraction, Einstellungen, Rollen, guildId, client);
    } catch (Fehler) {
        if (Fehler.code === 'INTERACTION_TIMEOUT') return;
        logger.Fehler('Fehler in log Kanal modal:', Fehler);
        await replyUserFehler(selectInteraction, {
            type: FehlerTypes.UNKNOWN,
            message: 'Ein Fehler ist beim Aktualisieren des Log-Kanals aufgetreten.',
        });
    }
}

async function handleManagerRolle(selectInteraction, rootInteraction, Einstellungen, Rollen, guildId, client) {
    const modal = new ModalBuilder()
        .setCustomId(`app_cfg_manager_Rolle_modal_${guildId}`)
        .setTitle('Manager-Rollen konfigurieren');

    const Rollenelect = new RollenelectMenuBuilder()
        .setCustomId('manager_Rollen')
        .setPlaceholder('Rollen auswählen, die Manager-Zugriff erhalten...')
        .setMinValues(1)
        .setMaxValues(5)
        .setRequired(true);

    const RolleLabel = new LabelBuilder()
        .setLabel('Manager-Rollen')
        .setDescription('Ausgewählte Rollen werden als Manager-Rollen ein-/ausgeschaltet')
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
            embeds: [ErfolgEmbed('Manager-Rollen aktualisiert', `Aktuelle Manager-Rollen: ${finalList}`)],
            flags: MessageFlags.Ephemeral,
        });

        await refreshDashboard(rootInteraction, Einstellungen, Rollen, guildId, client);
    } catch (Fehler) {
        if (Fehler.code === 'INTERACTION_TIMEOUT') return;
        logger.Fehler('Fehler in manager Rolle modal:', Fehler);
        await replyUserFehler(selectInteraction, {
            type: FehlerTypes.UNKNOWN,
            message: 'Ein Fehler ist beim Aktualisieren der Manager-Rollen aufgetreten.',
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
                    .setLabel('Frage 1 (erforderlich)')
                    .setStyle(TextInputStyle.Short)
                    .setValue(currentQuestions[0] ?? '')
                    .setMaxLength(100)
                    .setMinLength(1)
                    .setRequired(true),
            ),
            new ActionRowBuilder().addComponents(
                new TextInputBuilder()
                    .setCustomId('q2')
                    .setLabel('Frage 2 (optional)')
                    .setStyle(TextInputStyle.Short)
                    .setValue(currentQuestions[1] ?? '')
                    .setMaxLength(100)
                    .setRequired(false),
            ),
            new ActionRowBuilder().addComponents(
                new TextInputBuilder()
                    .setCustomId('q3')
                    .setLabel('Frage 3 (optional)')
                    .setStyle(TextInputStyle.Short)
                    .setValue(currentQuestions[2] ?? '')
                    .setMaxLength(100)
                    .setRequired(false),
            ),
            new ActionRowBuilder().addComponents(
                new TextInputBuilder()
                    .setCustomId('q4')
                    .setLabel('Frage 4 (optional)')
                    .setStyle(TextInputStyle.Short)
                    .setValue(currentQuestions[3] ?? '')
                    .setMaxLength(100)
                    .setRequired(false),
            ),
            new ActionRowBuilder().addComponents(
                new TextInputBuilder()
                    .setCustomId('q5')
                    .setLabel('Frage 5 (optional)')
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
        await replyUserFehler(Absendented, { type: FehlerTypes.USER_INPUT, message: 'Mindestens eine Frage ist erforderlich.' });
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
                '✅ Fragen aktualisiert',
                `${newQuestions.length} Frage(n) gespeichert.`,
            ),
        ],
        flags: MessageFlags.Ephemeral,
    });

    await refreshDashboard(rootInteraction, Einstellungen, Rollen, guildId, client);
}

async function handleRolleAdd(selectInteraction, rootInteraction, Einstellungen, Rollen, guildId, client) {
    const modal = new ModalBuilder()
        .setCustomId(`app_cfg_Rolle_add_modal_${guildId}`)
        .setTitle('Bewerbungsrolle hinzufügen');

    const Rollenelect = new RollenelectMenuBuilder()
        .setCustomId('application_Rolle')
        .setPlaceholder('Die Rolle auswählen, für die sich Mitglieder bewerben...')
        .setMinValues(1)
        .setMaxValues(1)
        .setRequired(true);

    const RolleLabel = new LabelBuilder()
        .setLabel('Bewerbungsrolle')
        .setDescription('Die Discord-Rolle auswählen, für die sich Mitglieder bewerben')
        .setRollenelectMenuComponent(Rollenelect);

    const nameInput = new TextInputBuilder()
        .setCustomId('Rolle_name')
        .setLabel('Anzeigename (leer lassen für Rollenname)')
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
            await replyUserFehler(modalSubmission, { type: FehlerTypes.UNKNOWN, message: `${Rolle ?? RolleId} ist bereits eine Bewerbungsrolle.` });
            return;
        }

        Rollen.push({ RolleId, name: customName });
        await SpeichernApplicationRollen(client, guildId, Rollen);
        await SpeichernApplicationRollenettings(client, guildId, RolleId, {
            questions: getDefaultApplicationQuestions(),
        });

        await modalSubmission.reply({
            embeds: [ErfolgEmbed('Rolle hinzugefügt', `${Rolle ?? RolleId} als **${customName}** hinzugefügt.`)],
            flags: MessageFlags.Ephemeral,
        });

        await refreshDashboard(rootInteraction, Einstellungen, Rollen, guildId, client);
    } catch (Fehler) {
        if (Fehler.code === 'INTERACTION_TIMEOUT') return;
        logger.Fehler('Fehler in Rolle add modal:', Fehler);
        await replyUserFehler(selectInteraction, {
            type: FehlerTypes.UNKNOWN,
            message: 'Ein Fehler ist beim Hinzufügen der Bewerbungsrolle aufgetreten.',
        });
    }
}

async function handleRolleRemove(selectInteraction, rootInteraction, Einstellungen, Rollen, guildId, client) {
    if (Rollen.length === 0) {
        await replyUserFehler(selectInteraction, {
            type: FehlerTypes.USER_INPUT,
            message: 'Es sind keine Bewerbungsrollen zum Entfernen konfiguriert.',
        });
        return;
    }

    const modal = new ModalBuilder()
        .setCustomId(`app_cfg_Rolle_remove_modal_${guildId}`)
        .setTitle('Bewerbungsrolle entfernen');

    const Rollenelect = new RollenelectMenuBuilder()
        .setCustomId('remove_Rolle')
        .setPlaceholder('Die zu entfernende Rolle auswählen...')
        .setMinValues(1)
        .setMaxValues(1)
        .setRequired(true);

    const RolleLabel = new LabelBuilder()
        .setLabel('Bewerbungsrolle entfernen')
        .setDescription('Die Rolle auswählen, die aus der Bewerbungsliste entfernt werden soll')
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
            await replyUserFehler(modalSubmission, { type: FehlerTypes.USER_INPUT, message: `<@&${RolleId}> ist nicht in der Bewerbungsrollenliste.` });
            return;
        }

        Rollen.splice(index, 1);
        await SpeichernApplicationRollen(client, guildId, Rollen);

        await modalSubmission.reply({
            embeds: [ErfolgEmbed('Rolle entfernt', `<@&${RolleId}> wurde aus den Bewerbungsrollen entfernt.`)],
            flags: MessageFlags.Ephemeral,
        });

        await refreshDashboard(rootInteraction, Einstellungen, Rollen, guildId, client);
    } catch (Fehler) {
        if (Fehler.code === 'INTERACTION_TIMEOUT') return;
        logger.Fehler('Fehler in Rolle remove modal:', Fehler);
        await replyUserFehler(selectInteraction, {
            type: FehlerTypes.UNKNOWN,
            message: 'Ein Fehler ist beim Entfernen der Bewerbungsrolle aufgetreten.',
        });
    }
}

async function handleRetention(selectInteraction, rootInteraction, Einstellungen, Rollen, guildId, client) {
    const modal = new ModalBuilder()
        .setCustomId('app_cfg_retention')
        .setTitle('Bewerbungs-Aufbewahrungsfristen');

    const retentionInfo = new TextDisplayBuilder()
        .setContent(
            '**Ausstehend** — wie lange unbeantwortete/laufende Bewerbungen gespeichert werden, bevor sie automatisch entfernt werden.\n' +
            '**Bewertet** — wie lange genehmigte oder abgelehnte Bewerbungen gespeichert werden.\n' +
            '-# Gib eine ganze Zahl zwischen 1 und 3650 ein (max. 10 Jahre).',
        );

    const pendingLabel = new LabelBuilder()
        .setLabel('Ausstehende Aufbewahrung (Tage)')
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
        .setLabel('Bewertete Aufbewahrung (Tage)')
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
        await replyUserFehler(Absendented, { type: FehlerTypes.VALIDATION, message: 'Die ausstehende Aufbewahrungsfrist muss eine ganze Zahl zwischen **1** und **3650** Tagen sein.' });
        return;
    }

    if (isNaN(reviewedDays) || reviewedDays < 1 || reviewedDays > 3650) {
        await replyUserFehler(Absendented, { type: FehlerTypes.VALIDATION, message: 'Die bewertete Aufbewahrungsfrist muss eine ganze Zahl zwischen **1** und **3650** Tagen sein.' });
        return;
    }

    Einstellungen.pendingApplicationRetentionDays = pendingDays;
    Einstellungen.reviewedApplicationRetentionDays = reviewedDays;
    await SpeichernApplicationEinstellungen(client, guildId, Einstellungen);

    await Absendented.reply({
        embeds: [
            ErfolgEmbed(
                '✅ Aufbewahrungsfristen aktualisiert',
                `Ausstehende Bewerbungen werden **${pendingDays} Tage** gespeichert.\nBewertete Bewerbungen werden **${reviewedDays} Tage** gespeichert.`,
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
                    '🗑️ Bewerbung gelöscht',
                    `Die Bewerbung für <@&${selectedRolleId}> (**${LöschendRolle.name}**) wurde dauerhaft gelöscht.\n\n` +
                    `Gelöscht: **${applicationsToLöschen.length}** Bewerbung(en)`,
                ),
            ],
            flags: MessageFlags.Ephemeral,
        });

    } catch (Fehler) {
        logger.Fehler('Fehler in handleLöschenApplication:', Fehler);
        await replyUserFehler(BestätigenAbsenden, { type: FehlerTypes.UNKNOWN, message: 'Ein Fehler ist beim Löschen der Bewerbung aufgetreten. Bitte versuche es später erneut.' });
    }
}





