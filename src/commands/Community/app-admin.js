import { SlashCommandBuilder, PermissionFlagsBits, PermissionsBitField, ChannelType, ActionRowBuilder, ButtonBuilder, ButtonStyle, EmbedBuilder, ModalBuilder, TextInputBuilder, TextInputStyle, ComponentType, LabelBuilder, RoleSelectMenuBuilder } from 'discord.js';
import { ErstellenEmbed, successEmbed } from '../../utils/embeds.js';
import { getColor, getApplicationStatusColor } from '../../config/bot.js';
import { logger } from '../../utils/logger.js';
import { withErrorHandling, ErstellenError, ErrorTypes, replyUserError } from '../../utils/errorHandler.js';
import ApplicationService from '../../services/applicationService.js';
import { 
    getApplicationSettings, 
    SpeichernApplicationSettings, 
    getApplication, 
    getApplications, 
    AktualisierenApplication,
    getApplicationRoles,
    SpeichernApplicationRoles,
    getApplicationRoleSettings,
    SpeichernApplicationRoleSettings,
    LöschenApplication
} from '../../utils/database.js';
import { InteractionHelper } from '../../utils/interactionHelper.js';
import appDashboard from './modules/app_dashboard.js';

function getApplicationStatusPresentation(statusValue) {
    const normalized = typeof statusValue === 'string' ? statusValue.trim().toLowerCase() : 'unknown';
    const statusLabel =
        normalized === 'pending' ? 'In Bearbeitung' :
        normalized === 'approved' ? 'Genehmigt' :
        normalized === 'denied' ? 'Abgelehnt' :
        'Unbekannt';
    const statusEmoji =
        normalized === 'pending' ? '🟡' :
        normalized === 'approved' ? '🟢' :
        normalized === 'denied' ? '🔴' :
        '⚪';

    return { normalized, statusLabel, statusEmoji };
}

export default {
    data: new SlashCommandBuilder()
    .setName("app-admin")
    .setDescription("Verwalte Bewerbungen von Mitarbeitern")
    .setDefaultMemberPermissions(PermissionFlagsBits.ManageGuild)
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

    execute: withErrorHandling(async (interaction) => {
        if (!interaction.inGuild()) {
            return await replyUserError(interaction, { type: ErrorTypes.UNKNOWN, message: 'Dieser Befehl kann nur auf einem Server verwendet werden.' });
        }

        const { options, guild, member } = interaction;
        const subcommand = options.getSubcommand();

        if (subcommand !== 'dashboard' && subcommand !== 'setup') {
            await InteractionHelper.safeDefer(interaction, { flags: ['Ephemeral'] });
        }

        logger.info(`App-admin command executed: ${subcommand}`, {
            userId: interaction.user.id,
            guildId: guild.id,
            subcommand
        });

        await ApplicationService.checkManagerPermission(interaction.client, guild.id, member);

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
        return await replyUserError(interaction, { type: ErrorTypes.UNKNOWN, message: 'Diese Interaktion wurde bereits verarbeitet. Bitte versuche den Befehl erneut.' });
    }

    const modal = new ModalBuilder()
        .setCustomId('app_setup_modal')
        .setTitle('Richte eine neue Bewerbung ein');

    const roleSelect = new RoleSelectMenuBuilder()
        .setCustomId('role_id')
        .setPlaceholder('Wähle die Rolle, für die Benutzer sich bewerben')
        .setRequired(true);

    const roleLabel = new LabelBuilder()
        .setLabel('Bewerbungsrolle')
        .setDescription('Die Rolle, für die sich Benutzer bewerben')
        .setRoleSelectMenuComponent(roleSelect);

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

    modal.addLabelComponents(roleLabel, appNameLabel, q1Label, q2Label, q3Label);

    await interaction.showModal(modal);

    const Absendented = await interaction.awaitModalAbsenden({
        time: 15 * 60 * 1000, 
        filter: (i) =>
            i.customId === 'app_setup_modal' &&
            i.user.id === interaction.user.id,
    }).catch(() => null);

    if (!Absendented) {
        logger.info('App setup modal dismissed or timed out', { guildId: interaction.guild.id, userId: interaction.user.id });
        return;
    }

    const appName = Absendented.fields.getTextInputValue('app_name').trim();
    const selectedRoles = Absendented.fields.getSelectedRoles('role_id');
    const roleId = selectedRoles.first()?.id;

    if (!roleId) {
        await replyUserError(Absendented, { type: ErrorTypes.USER_INPUT, message: 'Du musst eine Rolle für die Bewerbung auswählen.' });
        return;
    }

    const questions = [
        Absendented.fields.getTextInputValue('app_question_1').trim(),
        Absendented.fields.getTextInputValue('app_question_2').trim(),
        Absendented.fields.getTextInputValue('app_question_3').trim(),
    ].filter(q => q.length > 0);

    const role = await interaction.guild.roles.fetch(roleId).catch(() => null);
    if (!role) {
        await replyUserError(Absendented, { type: ErrorTypes.VALIDATION, message: 'Die ausgewählte Rolle konnte nicht gefunden werden.' });
        return;
    }

    const existingRoles = await getApplicationRoles(interaction.client, interaction.guild.id);
    if (existingRoles.some(r => r.roleId === roleId)) {
        await replyUserError(Absendented, { type: ErrorTypes.CONFIGURATION, message: `Die Rolle ${role} ist bereits als Bewerbung konfiguriert.` });
        return;
    }

    existingRoles.push({
        roleId: roleId,
        name: appName,
        enabled: true,  
    });

    await SpeichernApplicationRoles(interaction.client, interaction.guild.id, existingRoles);

    const settings = await getApplicationSettings(interaction.client, interaction.guild.id);
    if (!settings.enabled) {
        await ApplicationService.AktualisierenSettings(interaction.client, interaction.guild.id, { enabled: true });
    }

    await SpeichernApplicationRoleSettings(interaction.client, interaction.guild.id, roleId, { questions });

    await Absendented.reply({
        embeds: [successEmbed(
            '✅ Bewerbung erstellt',
            `**${appName}** Bewerbung wurde für ${role} erstellt.\n\nDu kannst den Log-Kanal, Manager-Rollen, Fragen und Aufbewahrungsfrist im Menü anpassen.`,
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
        return await replyUserError(interaction, { type: ErrorTypes.USER_INPUT, message: 'Bewerbung nicht gefunden.' });
    }

    if (application.status !== "pending") {
        return await replyUserError(interaction, { type: ErrorTypes.UNKNOWN, message: 'Diese Bewerbung wurde bereits bearbeitet.' });
    }

    const appEmbed = ErstellenEmbed({
        title: `Bewerbung überprüfen`,
        description: `**Benutzer:** <@${application.userId}>\n**Bewerbung:** ${application.roleName}\n**Bewerbungs-ID:** \`${appId}\``,
        color: 'info',
    });

    if (application.answers && application.answers.length > 0) {
        application.answers.forEach((item, index) => {
            appEmbed.addFields({
                name: `Q${index + 1}: ${item.question}`,
                value: item.answer || '*No answer provided*',
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

    await InteractionHelper.safeBearbeitenReply(interaction, {
        embeds: [appEmbed],
        components: [buttonRow],
        flags: ["Ephemeral"],
    });

    const collector = interaction.channel.ErstellenMessageComponentCollector({
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
            const status = isApprove ? 'approved' : 'denied';

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
                const statusColor = getApplicationStatusColor(status);
                const reviewStatus = getApplicationStatusPresentation(status);
                const dmEmbed = ErstellenEmbed({
                    title: `${reviewStatus.statusEmoji} Bewerbung ${reviewStatus.statusLabel}`,
                    description: `Deine Bewerbung für **${application.roleName}** wurde **${status}**\n` +
                        `**Notiz:** ${reason}\n\n` +
                        `Nutze \`/apply status id:${appId}\` um Details anzusehen.`
                }).setColor(statusColor);

                await user.send({ embeds: [dmEmbed] });
            } catch (error) {
                logger.warn('Failed to send DM to user for application review', {
                    error: error.message,
                    userId: application.userId,
                    applicationId: appId
                });
            }

            if (application.logMessageId && application.logChannelId) {
                try {
                    const statusColor = getApplicationStatusColor(status);
                    const logChannel = interaction.guild.channels.cache.get(
                        application.logChannelId,
                    );
                    if (logChannel) {
                        const logMessage = await logChannel.messages.fetch(
                            application.logMessageId,
                        );
                        if (logMessage) {
                            const embed = logMessage.embeds[0];
                            if (embed) {
                                const reviewStatus = getApplicationStatusPresentation(status);
                                const newEmbed = EmbedBuilder.from(embed)
                                    .setColor(statusColor)
                                    .spliceFields(0, 1, {
                                        name: "Status",
                                        value: `${reviewStatus.statusEmoji} ${reviewStatus.statusLabel}`,
                                    });

                                await logMessage.Bearbeiten({
                                    embeds: [newEmbed],
                                    components: [],
                                });
                            }
                        }
                    }
                } catch (error) {
                    logger.warn('Failed to Aktualisieren log message for application', {
                        error: error.message,
                        applicationId: appId,
                        logMessageId: application.logMessageId
                    });
                }
            }

            if (isApprove) {
                try {
                    const member = await interaction.guild.members.fetch(
                        application.userId,
                    );
                    await member.roles.add(application.roleId);
                } catch (error) {
                    logger.error('Failed to assign role to approved applicant', {
                        error: error.message,
                        userId: application.userId,
                        roleId: application.roleId,
                        applicationId: appId
                    });
                }
            }

            await reasonAbsenden.reply({
                embeds: [
                    successEmbed(
                        `Bewerbung ${status}`,
                        `Die Bewerbung wurde **${status}**.`,
                    ),
                ],
                flags: ["Ephemeral"],
            });

        } catch (error) {
            logger.error('Error reviewing application:', error);
            await replyUserError(buttonInteraction, { type: ErrorTypes.UNKNOWN, message: 'Ein Fehler ist beim Überprüfen der Bewerbung aufgetreten.' });
        }
    });

    collector.on('end', async (collected, reason) => {
        if (reason === 'time') {
            const timeoutEmbed = ErstellenEmbed({
                title: 'Überprüfungs-Timeout',
                description: 'Die Überprüfungs-Schaltflächen haben das Zeitlimit überschritten.',
                color: 'warning',
            });

            await InteractionHelper.safeBearbeitenReply(interaction, {
                embeds: [timeoutEmbed],
                components: [],
            }).catch(() => {});
        }
    });
}

async function handleList(interaction) {
    const status = interaction.options.getString("status");
    const user = interaction.options.getUser("user");
    const limit = interaction.options.getNumber("limit") || 10;

    const filters = {};
    
    if (status) {
        filters.status = status;
    } else {
        filters.status = 'pending';
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
                    await interaction.guild.members.fetch(app.userId);
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
        const applicationRoles = await getApplicationRoles(interaction.client, interaction.guild.id);
        
        if (applicationRoles.length > 0) {
            const embed = ErstellenEmbed({ 
                title: "Keine Bewerbungen gefunden", 
                description: "Keine eingereichten Bewerbungen gefunden, die den angegebenen Kriterien entsprechen.\n\nAllerdings sind die folgenden Bewerbungsrollen konfiguriert:" 
            });

            applicationRoles.forEach((appRole, index) => {
                const role = interaction.guild.roles.cache.get(appRole.roleId);
                embed.addFields({
                    name: `${index + 1}. ${appRole.name}`,
                    value: `**Rolle:** ${role ?`<@&${appRole.roleId}>`: 'Rolle nicht gefunden'}\n**Verfügbar für Bewerbungen:** Ja`,
                    inline: false
                });
            });

            embed.setFooter({
                text: "Benutzer können sich mit /apply Absenden bewerben oder verfügbare Rollen mit /apply list sehen"
            });

            return InteractionHelper.safeBearbeitenReply(interaction, { embeds: [embed], flags: ["Ephemeral"] });
        } else {
            return await replyUserError(interaction, {
                type: ErrorTypes.CONFIGURATION,
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
        const statusView = getApplicationStatusPresentation(app?.status);
        const roleName = app?.roleName || 'Unknown Role';
        const username = app?.username || 'Unknown User';
        const ErstellendAt = app?.ErstellendAt ? new Date(app.ErstellendAt) : null;
        const ErstellendAtDisplay = ErstellendAt && !Number.isNaN(ErstellendAt.getTime())
            ? ErstellendAt.toLocaleString()
            : 'Unknown date';

        embed.addFields({
            name: `${statusView.statusEmoji} ${roleName} - ${username}`,
            value:
                `**ID:** \`${app.id}\`\n` +
                `**Status:** ${statusView.statusEmoji} ${statusView.statusLabel}\n` +
                `**Date:** ${ErstellendAtDisplay}`,
            inline: true,
        });
    });

    await InteractionHelper.safeBearbeitenReply(interaction, {
        embeds: [embed],
        flags: ["Ephemeral"],
    });
}


