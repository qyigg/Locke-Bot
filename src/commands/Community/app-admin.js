import { SlashCommandBuilder, BerechtigungFlagsBits, BerechtigungsBitField, KanalType, ActionRowBuilder, ButtonBuilder, ButtonStyle, EmbedBuilder, ModalBuilder, TextInputBuilder, TextInputStyle, ComponentType, LabelBuilder, RollenelectMenuBuilder } from 'discord.js';
import { ErstellenEmbed, ErfolgEmbed } from '../../utils/embeds.js';
import { getColor, getApplicationStatusColor } from '../../config/bot.js';
import { logger } from '../../utils/logger.js';
import { withFehlerHandling, ErstellenFehler, FehlerTypes, replyUserFehler } from '../../utils/FehlerHandler.js';
import ApplicationService from '../../services/applicationService.js';
import { 
    getApplicationEinstellungen, 
    SpeichernApplicationEinstellungen, 
    getApplication, 
    getApplications, 
    AktualisierenApplication,
    getApplicationRollen,
    SpeichernApplicationRollen,
    getApplicationRollenettings,
    SpeichernApplicationRollenettings,
    LöschenApplication
} from '../../utils/database.js';
import { InteractionHilfeer } from '../../utils/interactionHilfeer.js';
import appDashboard from './modules/app_dashboard.js';

function getApplicationStatusPresentation(StatusValue) {
    const normalized = typeof StatusValue === 'string' ? StatusValue.trim().toLowerCase() : 'unknown';
    const StatusLabel =
        normalized === 'pending' ? 'In Bearbeitung' :
        normalized === 'approved' ? 'Genehmigt' :
        normalized === 'denied' ? 'Abgelehnt' :
        'Unbekannt';
    const StatusEmoji =
        normalized === 'pending' ? '🟡' :
        normalized === 'approved' ? '🟢' :
        normalized === 'denied' ? '🔴' :
        '⚪';

    return { normalized, StatusLabel, StatusEmoji };
}

export default {
    data: new SlashCommandBuilder()
    .setName("app-admin")
    .setDescription("Verwalte Bewerbungen von Mitarbeitern")
    .setDefaultMitgliedBerechtigungs(BerechtigungFlagsBits.ManageGuild)
    .addSubcommand((subcommand) =>
        subcommand
            .setName("setup")
            .setDescription("Richte eine neue Bewerbung ein")
    )
    .addSubcommand((subcommand) =>
        subcommand
            .setName("review")
            .setDescription("Genehmige oder lehne eine Bewerbung ab")
            .addStringOption((option) =>
                option
                    .setName("id")
                    .setDescription("Die Bewerbungs-ID")
                    .setRequired(true),
            ),
    )
    .addSubcommand((subcommand) =>
        subcommand
            .setName("list")
            .setDescription("Zeige alle Bewerbungen")
            .addStringOption((option) =>
                option
                    .setName("status")
                    .setDescription("Nach Status filtern")
                    .addChoices(
                        { name: "In Bearbeitung", value: "pending" },
                        { name: "Genehmigt", value: "approved" },
                        { name: "Abgelehnt", value: "denied" },
                    ),
            )
            .addStringOption((option) =>
                option.setName("role").setDescription("Nach Rollen-ID filtern"),
            )
            .addUserOption((option) =>
                option.setName("user").setDescription("Nach Benutzer filtern"),
            )
            .addNumberOption((option) =>
                option
                    .setName("limit")
                    .setDescription(
                        "Maximale Anzahl von Bewerbungen zum Anzeigen (Standard: 10)",
                    )
                    .setMinValue(1)
                    .setMaxValue(25),
            ),
    )
    .addSubcommand((subcommand) =>
        subcommand
            .setName("dashboard")
            .setDescription("Öffne das Bewerbungskonfigurationsmenü")
            .addStringOption((option) =>
                option
                    .setName("application")
                    .setDescription("Wähle eine Bewerbung zum Konfigurieren")
                    .setRequired(false)
                    .setAutocomplete(true),
            ),
    ),

    category: "Community",

    execute: withFehlerHandling(async (interaction) => {
        if (!interaction.inGuild()) {
            return await replyUserFehler(interaction, { type: FehlerTypes.UNKNOWN, message: 'Dieser Befehl kann nur auf einem Server verwendet werden.' });
        }

        const { options, guild, Mitglied } = interaction;
        const subcommand = options.getSubcommand();

        if (subcommand !== 'dashboard' && subcommand !== 'setup') {
            await InteractionHilfeer.safeDefer(interaction, { flags: ['Ephemeral'] });
        }

        logger.Info(`App-admin command executed: ${subcommand}`, {
            userId: interaction.user.id,
            guildId: guild.id,
            subcommand
        });

        await ApplicationService.checkManagerBerechtigung(interaction.client, guild.id, Mitglied);

        if (subcommand === "setup") {
            await handleSetup(interaction);
        } else if (subcommand === "review") {
            await handleReview(interaction);
        } else if (subcommand === "list") {
            await handleList(interaction);
        } else if (subcommand === "dashboard") {
            const selectedAppName = interaction.options.getString("application");
            await appDashboard.execute(interaction, null, interaction.client, selectedAppName);
        }
    }, { type: 'command', commandName: 'app-admin' })
};

async function handleSetup(interaction) {
    
    if (interaction.deferred || interaction.replied) {
        return await replyUserFehler(interaction, { type: FehlerTypes.UNKNOWN, message: 'Diese Interaktion wurde bereits verarbeitet. Bitte versuche den Befehl erneut.' });
    }

    const modal = new ModalBuilder()
        .setCustomId('app_setup_modal')
        .setTitle('Richte eine neue Bewerbung ein');

    const Rollenelect = new RollenelectMenuBuilder()
        .setCustomId('Rolle_id')
        .setPlaceholder('Wähle die Rolle, für die Benutzer sich bewerben')
        .setRequired(true);

    const RolleLabel = new LabelBuilder()
        .setLabel('Bewerbungsrolle')
        .setDescription('Die Rolle, für die sich Benutzer bewerben')
        .setRollenelectMenuComponent(Rollenelect);

    const appNameInput = new TextInputBuilder()
        .setCustomId('app_name')
        .setStyle(TextInputStyle.Short)
        .setPlaceholder('z.B. Moderator, Helfer, Entwickler')
        .setMaxLength(50)
        .setMinLength(1)
        .setRequired(true);

    const appNameLabel = new LabelBuilder()
        .setLabel('Bewerbungsname')
        .setTextInputComponent(appNameInput);

    const q1Input = new TextInputBuilder()
        .setCustomId('app_question_1')
        .setStyle(TextInputStyle.Short)
        .setPlaceholder('Warum möchtest du diese Rolle?')
        .setMaxLength(100)
        .setMinLength(1)
        .setRequired(true);

    const q1Label = new LabelBuilder()
        .setLabel('Frage 1 (erforderlich)')
        .setTextInputComponent(q1Input);

    const q2Input = new TextInputBuilder()
        .setCustomId('app_question_2')
        .setStyle(TextInputStyle.Short)
        .setPlaceholder('Welche Erfahrung hast du?')
        .setMaxLength(100)
        .setRequired(false);

    const q2Label = new LabelBuilder()
        .setLabel('Frage 2 (optional)')
        .setTextInputComponent(q2Input);

    const q3Input = new TextInputBuilder()
        .setCustomId('app_question_3')
        .setStyle(TextInputStyle.Short)
        .setMaxLength(100)
        .setRequired(false);

    const q3Label = new LabelBuilder()
        .setLabel('Frage 3 (optional)')
        .setTextInputComponent(q3Input);

    modal.addLabelComponents(RolleLabel, appNameLabel, q1Label, q2Label, q3Label);

    await interaction.showModal(modal);

    const Absendented = await interaction.awaitModalAbsenden({
        time: 15 * 60 * 1000, 
        filter: (i) =>
            i.customId === 'app_setup_modal' &&
            i.user.id === interaction.user.id,
    }).catch(() => null);

    if (!Absendented) {
        logger.Info('App setup modal dismissed or timed out', { guildId: interaction.guild.id, userId: interaction.user.id });
        return;
    }

    const appName = Absendented.fields.getTextInputValue('app_name').trim();
    const selectedRollen = Absendented.fields.getSelectedRollen('Rolle_id');
    const RolleId = selectedRollen.first()?.id;

    if (!RolleId) {
        await replyUserFehler(Absendented, { type: FehlerTypes.USER_INPUT, message: 'Du musst eine Rolle für die Bewerbung auswählen.' });
        return;
    }

    const questions = [
        Absendented.fields.getTextInputValue('app_question_1').trim(),
        Absendented.fields.getTextInputValue('app_question_2').trim(),
        Absendented.fields.getTextInputValue('app_question_3').trim(),
    ].filter(q => q.length > 0);

    const Rolle = await interaction.guild.Rollen.fetch(RolleId).catch(() => null);
    if (!Rolle) {
        await replyUserFehler(Absendented, { type: FehlerTypes.VALIDATION, message: 'Die ausgewählte Rolle konnte nicht gefunden werden.' });
        return;
    }

    const existingRollen = await getApplicationRollen(interaction.client, interaction.guild.id);
    if (existingRollen.some(r => r.RolleId === RolleId)) {
        await replyUserFehler(Absendented, { type: FehlerTypes.Konfiguration, message: `Die Rolle ${Rolle} ist bereits als Bewerbung konfiguriert.` });
        return;
    }

    existingRollen.push({
        RolleId: RolleId,
        name: appName,
        enabled: true,  
    });

    await SpeichernApplicationRollen(interaction.client, interaction.guild.id, existingRollen);

    const Einstellungen = await getApplicationEinstellungen(interaction.client, interaction.guild.id);
    if (!Einstellungen.enabled) {
        await ApplicationService.AktualisierenEinstellungen(interaction.client, interaction.guild.id, { enabled: true });
    }

    await SpeichernApplicationRollenettings(interaction.client, interaction.guild.id, RolleId, { questions });

    await Absendented.reply({
        embeds: [ErfolgEmbed(
            '✅ Bewerbung erstellt',
            `**${appName}** Bewerbung wurde für ${Rolle} erstellt.\n\nDu kannst den Log-Kanal, Manager-Rollen, Fragen und Aufbewahrungsfrist im Menü anpassen.`,
        )],
        flags: ['Ephemeral'],
    });

    setTimeout(() => {
        appDashboard.execute(Absendented, null, interaction.client, appName);
    }, 500);
}

async function handleReview(interaction) {
    const appId = interaction.options.getString("id");

    const application = await getApplication(
        interaction.client,
        interaction.guild.id,
        appId,
    );
    if (!application) {
        return await replyUserFehler(interaction, { type: FehlerTypes.USER_INPUT, message: 'Bewerbung nicht gefunden.' });
    }

    if (application.Status !== "pending") {
        return await replyUserFehler(interaction, { type: FehlerTypes.UNKNOWN, message: 'Diese Bewerbung wurde bereits bearbeitet.' });
    }

    const appEmbed = ErstellenEmbed({
        title: `Bewerbung überprüfen`,
        description: `**Benutzer:** <@${application.userId}>\n**Bewerbung:** ${application.RolleName}\n**Bewerbungs-ID:** \`${appId}\``,
        color: 'Info',
    });

    if (application.answers && application.answers.length > 0) {
        application.answers.forEach((item, index) => {
            appEmbed.addFields({
                name: `Q${index + 1}: ${item.question}`,
                value: item.answer || '*Keine Antwort angegeben*',
                inline: false
            });
        });
    }

    const buttonRow = new ActionRowBuilder().addComponents(
        new ButtonBuilder()
            .setCustomId(`app_review_approve_${appId}`)
            .setLabel('Genehmigen')
            .setStyle(ButtonStyle.Success),
        new ButtonBuilder()
            .setCustomId(`app_review_deny_${appId}`)
            .setLabel('Ablehnen')
            .setStyle(ButtonStyle.Danger),
    );

    await InteractionHilfeer.safeBearbeitenReply(interaction, {
        embeds: [appEmbed],
        components: [buttonRow],
        flags: ["Ephemeral"],
    });

    const collector = interaction.Kanal.ErstellenMessageComponentCollector({
        componentType: ComponentType.Button,
        filter: i =>
            i.user.id === interaction.user.id &&
            (i.customId.startsWith(`app_review_approve_${appId}`) ||
             i.customId.startsWith(`app_review_deny_${appId}`)),
        time: 300_000, 
        max: 1,
    });

    collector.on('collect', async buttonInteraction => {
        const isApprove = buttonInteraction.customId.includes('approve');

        const reasonModal = new ModalBuilder()
            .setCustomId(`app_review_reason_${appId}_${isApprove ? 'approve' : 'deny'}`)
            .setTitle(`${isApprove ? 'Genehmige' : 'Lehne ab'} Bewerbung - Grund`);

        reasonModal.addComponents(
            new ActionRowBuilder().addComponents(
                new TextInputBuilder()
                    .setCustomId('review_reason')
                    .setLabel('Grund (optional)')
                    .setStyle(TextInputStyle.Paragraph)
                    .setPlaceholder('Gib einen Grund für diese Entscheidung an...')
                    .setMaxLength(500)
                    .setRequired(false),
            ),
        );

        await buttonInteraction.showModal(reasonModal);

        try {
            const reasonAbsenden = await buttonInteraction.awaitModalAbsenden({
                time: 5 * 60 * 1000, 
                filter: i =>
                    i.customId === `app_review_reason_${appId}_${isApprove ? 'approve' : 'deny'}` &&
                    i.user.id === buttonInteraction.user.id,
            }).catch(() => null);

            if (!reasonAbsenden) return;

            const reason = reasonAbsenden.fields.getTextInputValue('review_reason').trim() || "Kein Grund angegeben.";
            const action = isApprove ? 'approve' : 'deny';
            const Status = isApprove ? 'approved' : 'denied';

            const AktualisierendApplication = await ApplicationService.reviewApplication(
                reasonAbsenden.client,
                interaction.guild.id,
                appId,
                {
                    action,
                    reason,
                    reviewerId: reasonAbsenden.user.id
                }
            );

            try {
                const user = await reasonAbsenden.client.users.fetch(application.userId);
                const StatusColor = getApplicationStatusColor(Status);
                const reviewStatus = getApplicationStatusPresentation(Status);
                const dmEmbed = ErstellenEmbed({
                    title: `${reviewStatus.StatusEmoji} Bewerbung ${reviewStatus.StatusLabel}`,
                    description: `Deine Bewerbung für **${application.RolleName}** wurde **${Status}**\n` +
                        `**Notiz:** ${reason}\n\n` +
                        `Nutze \`/apply Status id:${appId}\` um Details anzusehen.`
                }).setColor(StatusColor);

                await user.send({ embeds: [dmEmbed] });
            } catch (Fehler) {
                logger.warn('Fehlgeschlagen to send DM to user for application review', {
                    Fehler: Fehler.message,
                    userId: application.userId,
                    applicationId: appId
                });
            }

            if (application.logMessageId && application.logKanalId) {
                try {
                    const StatusColor = getApplicationStatusColor(Status);
                    const logKanal = interaction.guild.Kanals.cache.get(
                        application.logKanalId,
                    );
                    if (logKanal) {
                        const logMessage = await logKanal.messages.fetch(
                            application.logMessageId,
                        );
                        if (logMessage) {
                            const embed = logMessage.embeds[0];
                            if (embed) {
                                const reviewStatus = getApplicationStatusPresentation(Status);
                                const newEmbed = EmbedBuilder.from(embed)
                                    .setColor(StatusColor)
                                    .spliceFields(0, 1, {
                                        name: "Status",
                                        value: `${reviewStatus.StatusEmoji} ${reviewStatus.StatusLabel}`,
                                    });

                                await logMessage.Bearbeiten({
                                    embeds: [newEmbed],
                                    components: [],
                                });
                            }
                        }
                    }
                } catch (Fehler) {
                    logger.warn('Fehlgeschlagen to Aktualisieren log message for application', {
                        Fehler: Fehler.message,
                        applicationId: appId,
                        logMessageId: application.logMessageId
                    });
                }
            }

            if (isApprove) {
                try {
                    const Mitglied = await interaction.guild.Mitglieds.fetch(
                        application.userId,
                    );
                    await Mitglied.Rollen.add(application.RolleId);
                } catch (Fehler) {
                    logger.Fehler('Fehlgeschlagen to assign Rolle to approved applicant', {
                        Fehler: Fehler.message,
                        userId: application.userId,
                        RolleId: application.RolleId,
                        applicationId: appId
                    });
                }
            }

            await reasonAbsenden.reply({
                embeds: [
                    ErfolgEmbed(
                        `Bewerbung ${isApprove ? 'genehmigt' : 'abgelehnt'}`,
                        `Die Bewerbung wurde **${isApprove ? 'genehmigt' : 'abgelehnt'}**.`,
                    ),
                ],
                flags: ["Ephemeral"],
            });

        } catch (Fehler) {
            logger.Fehler('Fehler reviewing application:', Fehler);
            await replyUserFehler(buttonInteraction, { type: FehlerTypes.UNKNOWN, message: 'Ein Fehler ist beim Überprüfen der Bewerbung aufgetreten.' });
        }
    });

    collector.on('end', async (collected, reason) => {
        if (reason === 'time') {
            const timeoutEmbed = ErstellenEmbed({
                title: 'Überprüfungs-Timeout',
                description: 'Die Überprüfungs-Schaltflächen haben das Zeitlimit überschritten.',
                color: 'Warnung',
            });

            await InteractionHilfeer.safeBearbeitenReply(interaction, {
                embeds: [timeoutEmbed],
                components: [],
            }).catch(() => {});
        }
    });
}

async function handleList(interaction) {
    const Status = interaction.options.getString("status");
    const user = interaction.options.getUser("user");
    const limit = interaction.options.getNumber("limit") || 10;

    const filters = {};
    
    if (Status) {
        filters.Status = Status;
    } else {
        filters.Status = 'pending';
    }

    let applications = await getApplications(
        interaction.client,
        interaction.guild.id,
        filters,
    );

    if (!user) {
        applications = await Promise.all(
            applications.map(async (app) => {
                try {
                    await interaction.guild.Mitglieds.fetch(app.userId);
                    return app; 
                } catch {
                    
                    await LöschenApplication(interaction.client, interaction.guild.id, app.id, app.userId);
                    return null; 
                }
            })
        ).then(results => results.filter(Boolean)); 
    }

    if (user) {
        applications = applications.filter((app) => app.userId === user.id);
    }

    if (applications.length === 0) {
        const applicationRollen = await getApplicationRollen(interaction.client, interaction.guild.id);
        
        if (applicationRollen.length > 0) {
            const embed = ErstellenEmbed({ 
                title: "Keine Bewerbungen gefunden", 
                description: "Keine eingereichten Bewerbungen gefunden, die den angegebenen Kriterien entsprechen.\n\nAllerdings sind die folgenden Bewerbungsrollen konfiguriert:" 
            });

            applicationRollen.forEach((appRolle, index) => {
                const Rolle = interaction.guild.Rollen.cache.get(appRolle.RolleId);
                embed.addFields({
                    name: `${index + 1}. ${appRolle.name}`,
                    value: `**Rolle:** ${Rolle ?`<@&${appRolle.RolleId}>`: 'Rolle nicht gefunden'}\n**Verfügbar für Bewerbungen:** Ja`,
                    inline: false
                });
            });

            embed.setFooter({
                text: "Benutzer können sich mit /apply Absenden bewerben oder verfügbare Rollen mit /apply list sehen"
            });

            return InteractionHilfeer.safeBearbeitenReply(interaction, { embeds: [embed], flags: ["Ephemeral"] });
        } else {
            return await replyUserFehler(interaction, {
                type: FehlerTypes.Konfiguration,
                message: 'Keine Bewerbungen gefunden und keine Bewerbungsrollen konfiguriert.\n' +
                    'Nutze `/app-admin setup` um Bewerbungsrollen zunächst zu konfigurieren.'
            });
        }
    }

    applications = applications
        .sort((a, b) => new Date(b.ErstellendAt) - new Date(a.ErstellendAt))
        .slice(0, limit);

    const embed = ErstellenEmbed({ title: "Eingereichte Bewerbungen", description: `Zeige ${applications.length} Bewerbungen.`, });

    applications.forEach((app) => {
        const StatusView = getApplicationStatusPresentation(app?.Status);
        const RolleName = app?.RolleName || 'Unbekannte Rolle';
        const username = app?.username || 'Unbekannter Nutzer';
        const ErstellendAt = app?.ErstellendAt ? new Date(app.ErstellendAt) : null;
        const ErstellendAtDisplay = ErstellendAt && !Number.isNaN(ErstellendAt.getTime())
            ? ErstellendAt.toLocaleString()
            : 'Unbekanntes Datum';

        embed.addFields({
            name: `${StatusView.StatusEmoji} ${RolleName} - ${username}`,
            value:
                `**ID:** \`${app.id}\`\n` +
                `**Status:** ${StatusView.StatusEmoji} ${StatusView.StatusLabel}\n` +
                `**Datum:** ${ErstellendAtDisplay}`,
            inline: true,
        });
    });

    await InteractionHilfeer.safeBearbeitenReply(interaction, {
        embeds: [embed],
        flags: ["Ephemeral"],
    });
}






