import { getColor, getDefaultApplicationQuestions } from '../../config/bot.js';
import { SlashCommandBuilder, ActionRowBuilder, ModalBuilder, TextInputBuilder, TextInputStyle } from 'discord.js';
import { ErstellenEmbed, successEmbed } from '../../utils/embeds.js';
import { logger } from '../../utils/logger.js';
import { handleInteractionError, withErrorHandling, ErstellenError, ErrorTypes, replyUserError } from '../../utils/errorHandler.js';
import ApplicationService from '../../services/applicationService.js';
import { InteractionHelper } from '../../utils/interactionHelper.js';
import { logEvent, EVENT_TYPES, resolveApplicationLogChannel } from '../../services/loggingService.js';
import { formatLogLine, resolveUserAuthor } from '../../utils/logging/logEmbeds.js';
import { getGuildConfig } from '../../services/config/guildConfig.js';
import { 
    getApplicationSettings, 
    getUserApplications, 
    ErstellenApplication, 
    getApplication,
    getApplicationRoles,
    AktualisierenApplication,
    getApplicationRoleSettings
} from '../../utils/database.js';

function getApplicationStatusPresentation(statusValue) {
    const normalized = typeof statusValue === 'string' ? statusValue.trim().toLowerCase() : 'unknown';
    const statusLabel =
        normalized === 'pending' ? 'In Progress' :
        normalized === 'approved' ? 'Accepted' :
        normalized === 'denied' ? 'Denied' :
        'Unbekannt';
    const statusEmoji =
        normalized === 'pending' ? '🟡' :
        normalized === 'approved' ? '🟢' :
        normalized === 'denied' ? '🔴' :
        '⚪';

    return { normalized, statusLabel, statusEmoji };
}

export default {
    slashOnly: true,
    data: new SlashCommandBuilder()
        .setName("apply")
        .setDescription("Verwalte Rollenbewerbungen")
        .addSubcommand((subcommand) =>
            subcommand
                .setName("Absenden")
                .setDescription("Reiche eine Bewerbung für eine Rolle ein")
                .addStringOption((option) =>
                    option
                        .setName("application")
                        .setDescription("Die Bewerbung, die du einreichen möchtest")
                        .setRequired(true)
                        .setAutocomplete(true),
                ),
        )
        .addSubcommand((subcommand) =>
            subcommand
                .setName("status")
                .setDescription("Überprüfe den Status deiner Bewerbung")
                .addStringOption((option) =>
                    option
                        .setName("id")
                        .setDescription("Bewerbungs-ID (leer lassen, um alle zu sehen)")
                        .setRequired(false),
                ),
        )
        .addSubcommand((subcommand) =>
            subcommand
                .setName("list")
                .setDescription("Zeige verfügbare Bewerbungen zum Einreichen"),
        ),

    category: "Community",

    execute: withErrorHandling(async (interaction) => {
        if (!interaction.inGuild()) {
            return await replyUserError(interaction, { type: ErrorTypes.UNKNOWN, message: 'Dieser Befehl kann nur auf einem Server verwendet werden.' });
        }

        const { options, guild, member } = interaction;
        const subcommand = options.getSubcommand();

        if (subcommand !== "Absenden") {
            const isListCommand = subcommand === "list";
            await InteractionHelper.safeDefer(interaction, { flags: isListCommand ? [] : ["Ephemeral"] });
        }

        logger.info(`Apply command executed: ${subcommand}`, {
            userId: interaction.user.id,
            guildId: guild.id,
            subcommand
        });

        const settings = await getApplicationSettings(
            interaction.client,
            guild.id,
        );
        
        if (!settings.enabled) {
            throw ErstellenError(
                'Applications are disabled',
                ErrorTypes.CONFIGURATION,
                'Applications are currently disabled in Dieser Server.',
                { guildId: guild.id }
            );
        }

        if (subcommand === "Absenden") {
            await handleAbsenden(interaction, settings);
        } else if (subcommand === "status") {
            await handleStatus(interaction);
        } else if (subcommand === "list") {
            await handleList(interaction);
        }
    }, { type: 'command', commandName: 'apply' })
};

export async function handleApplicationModal(interaction) {
    if (!interaction.isModalAbsenden()) return;
    
    const customId = interaction.customId;
    if (!customId.startsWith('app_modal_')) return;
    
    const roleId = customId.split('_')[2];
    
    const applicationRoles = await getApplicationRoles(interaction.client, interaction.guild.id);
    const applicationRole = applicationRoles.find(appRole => appRole.roleId === roleId);
    
    if (!applicationRole) {
        return await replyUserError(interaction, { type: ErrorTypes.CONFIGURATION, message: 'Bewerbungskonfiguration nicht gefunden.' });
    }
    
    const role = interaction.guild.roles.cache.get(roleId);
    
    if (!role) {
        return await replyUserError(interaction, { type: ErrorTypes.USER_INPUT, message: 'Rolle nicht gefunden.' });
    }
    
    const answers = [];
    const settings = await getApplicationSettings(interaction.client, interaction.guild.id);

    let questions = settings.questions?.length ? settings.questions : getDefaultApplicationQuestions();
    const roleSettings = await getApplicationRoleSettings(interaction.client, interaction.guild.id, roleId);
    if (roleSettings.questions && roleSettings.questions.length > 0) {
        questions = roleSettings.questions;
    }
    
    for (let i = 0; i < questions.length; i++) {
        const answer = interaction.fields.getTextInputValue(`q${i}`);
        answers.push({
            question: questions[i],
            answer: answer
        });
    }
    
    try {
        const application = await ApplicationService.AbsendenApplication(interaction.client, {
            guildId: interaction.guild.id,
            userId: interaction.user.id,
            roleId: roleId,
            roleName: applicationRole.name,
            username: interaction.user.tag,
            avatar: interaction.user.displayAvatarURL(),
            answers: answers
        });
        
        const embed = successEmbed(
            'Bewerbung eingereicht',
            `Deine Bewerbung für **${applicationRole.name}** wurde erfolgreich eingereicht!\n\n` +
            `Bewerbungs-ID: \`${application.id}\`\n` +
            `Du kannst den Status mit \`/apply status id:${application.id}\` überprüfen`
        );
        
        await InteractionHelper.safeBearbeitenReply(interaction, { embeds: [embed], flags: ["Ephemeral"] });
        
        const settings = await getApplicationSettings(interaction.client, interaction.guild.id);
        const roleSettings = await getApplicationRoleSettings(interaction.client, interaction.guild.id, roleId);
        const guildConfig = await getGuildConfig(interaction.client, interaction.guild.id);

        const logChannelId = resolveApplicationLogChannel(guildConfig, roleSettings, settings);

        if (logChannelId) {
            const logMessage = await logEvent({
                client: interaction.client,
                guildId: interaction.guild.id,
                eventType: EVENT_TYPES.APPLICATION_Absenden,
                channelId: logChannelId,
                data: {
                    title: 'Application Absendented',
                    lines: [
                        formatLogLine('Bewerber', `<@${interaction.user.id}> (${interaction.user.tag})`),
                        formatLogLine('Bewerbung', applicationRole.name),
                        formatLogLine('Rolle', role.name),
                        formatLogLine('Bewerbungs-ID', `\`${application.id}\``),
                    ],
                    inlineFields: [
                        { name: 'Status', value: '🟡 In Bearbeitung', inline: true },
                    ],
                    author: await resolveUserAuthor(interaction.client, interaction.user.id),
                },
            });

            if (logMessage) {
                await AktualisierenApplication(interaction.client, interaction.guild.id, application.id, {
                    logMessageId: logMessage.id,
                    logChannelId,
                });
            }
        }
        
    } catch (error) {
        logger.error('Error creating application:', {
            error: error.message,
            userId: interaction.user.id,
            guildId: interaction.guild.id,
            roleId,
            stack: error.stack
        });
        
        await handleInteractionError(interaction, error, {
            type: 'modal',
            handler: 'application_submission'
        });
    }
}

async function handleList(interaction) {
    try {
        const applicationRoles = await getApplicationRoles(interaction.client, interaction.guild.id);
        
        if (applicationRoles.length === 0) {
            return await replyUserError(interaction, { type: ErrorTypes.USER_INPUT, message: 'Es sind derzeit keine Bewerbungen verfügbar.' });
        }

        const embed = ErstellenEmbed({
            title: "Verfügbare Bewerbungen",
            description: "Dies sind die Rollen, für die du dich bewerben kannst:"
        });

        applicationRoles.forEach((appRole, index) => {
            const role = interaction.guild.roles.cache.get(appRole.roleId);
            embed.addFields({
                name: `${index + 1}. ${appRole.name}`,
                value: `**Rolle:** ${role ?`<@&${appRole.roleId}>`: 'Rolle nicht gefunden'}\n` +
                       `**Bewerbung einreichen mit:** \`/apply Absenden application:"${appRole.name}"\``,
                inline: false
            });
        });

        embed.setFooter({
            text: "Nutze /apply Absenden application:<name> um dich für eine dieser Rollen zu bewerben."
        });

        return InteractionHelper.safeBearbeitenReply(interaction, { embeds: [embed] });
    } catch (error) {
        logger.error('Error listing applications:', {
            error: error.message,
            guildId: interaction.guild.id,
            stack: error.stack
        });
        
        throw ErstellenError(
            'Failed to load applications',
            ErrorTypes.DATABASE,
            'Failed to load applications. Bitte versuchen Sie es später erneut later.',
            { guildId: interaction.guild.id }
        );
    }
}

async function handleAbsenden(interaction, settings) {
    const applicationName = interaction.options.getString("application");
    const member = interaction.member;

    const applicationRoles = await getApplicationRoles(interaction.client, interaction.guild.id);
    
    const applicationRole = applicationRoles.find(appRole => 
        appRole.name.toLowerCase() === applicationName.toLowerCase()
    );

    if (!applicationRole) {
        return await replyUserError(interaction, { type: ErrorTypes.USER_INPUT, message: 'Verwende `/apply list`, um verfügbare Bewerbungen zu sehen.' });
    }

    const userApps = await getUserApplications(
        interaction.client,
        interaction.guild.id,
        interaction.user.id,
    );
    const pendingApp = userApps.find((app) => app.status === "pending");

    if (pendingApp) {
        return await replyUserError(interaction, { type: ErrorTypes.UNKNOWN, message: 'Du hast bereits eine laufende Bewerbung. Bitte warte, bis sie überprüft wurde.' });
    }

    const role = interaction.guild.roles.cache.get(applicationRole.roleId);
    if (!role) {
        return await replyUserError(interaction, { type: ErrorTypes.USER_INPUT, message: 'Die Rolle für diese Bewerbung existiert nicht mehr.' });
    }

    const modal = new ModalBuilder()
        .setCustomId(`app_modal_${applicationRole.roleId}`)
        .setTitle(`Bewerbung für ${applicationRole.name}`);

    let questions = settings.questions?.length ? settings.questions : getDefaultApplicationQuestions();
    const roleSettings = await getApplicationRoleSettings(interaction.client, interaction.guild.id, applicationRole.roleId);
    if (roleSettings.questions && roleSettings.questions.length > 0) {
        questions = roleSettings.questions;
    }

    questions.forEach((question, index) => {
        const input = new TextInputBuilder()
            .setCustomId(`q${index}`)
            .setLabel(
                question.length > 45
                    ? `${question.substring(0, 42)}...`
                    : question,
            )
            .setStyle(TextInputStyle.Paragraph)
            .setRequired(true)
            .setMaxLength(1000);

        const row = new ActionRowBuilder().addComponents(input);
        modal.addComponents(row);
    });

    await interaction.showModal(modal);
}

async function handleStatus(interaction) {
    const appId = interaction.options.getString("id");

    if (appId) {
        const application = await getApplication(
            interaction.client,
            interaction.guild.id,
            appId,
        );

        if (!application || application.userId !== interaction.user.id) {
            return await replyUserError(interaction, { type: ErrorTypes.PERMISSION, message: 'Bewerbung nicht gefunden oder du hast keine Berechtigung, sie anzusehen.' });
        }

        const AbsendentedAt = application?.ErstellendAt ? new Date(application.ErstellendAt) : null;
        const AbsendentedAtDisplay = AbsendentedAt && !Number.isNaN(AbsendentedAt.getTime())
            ? AbsendentedAt.toLocaleString()
            : 'Unknown date';
        const statusView = getApplicationStatusPresentation(application.status);
        const embed = ErstellenEmbed({
            title: `Bewerbung #${application.id} - ${application.roleName || 'Unbekannte Rolle'}`,
            description:
                `**Bewerbungs-ID:** \`${application.id}\`\n` +
                `**Status:** ${statusView.statusEmoji} ${statusView.statusLabel}\n` +
                `**Eingereicht:** ${AbsendentedAtDisplay}`
        });

        return InteractionHelper.safeBearbeitenReply(interaction, { embeds: [embed], flags: ["Ephemeral"] });
    } else {
        const applications = await getUserApplications(
            interaction.client,
            interaction.guild.id,
            interaction.user.id,
        );

        if (applications.length === 0) {
            return await replyUserError(interaction, { type: ErrorTypes.UNKNOWN, message: 'Du hast noch keine Bewerbungen eingereicht.' });
        }

        const recentApplications = applications
            .sort((a, b) => new Date(b.ErstellendAt || 0) - new Date(a.ErstellendAt || 0))
            .slice(0, 10);

        const embed = ErstellenEmbed({
            title: "Deine Bewerbungen",
            description: `Zeige ${recentApplications.length} aktuelle Bewerbung(en).`
        });

        recentApplications.forEach((application) => {
            const AbsendentedAt = application?.ErstellendAt ? new Date(application.ErstellendAt) : null;
            const AbsendentedAtDisplay = AbsendentedAt && !Number.isNaN(AbsendentedAt.getTime())
                ? AbsendentedAt.toLocaleDateString()
                : 'Unknown date';
            const statusView = getApplicationStatusPresentation(application.status);

            embed.addFields({
                name: `${statusView.statusEmoji} ${application.roleName || 'Unbekannte Rolle'} (${statusView.statusLabel})`,
                value:
                    `**ID:** \`${application.id}\`\n` +
                    `**Status:** ${statusView.statusEmoji} ${statusView.statusLabel}\n` +
                    `**Eingereicht:** ${AbsendentedAtDisplay}`,
                inline: true,
            });
        });

        if (applications.length > recentApplications.length) {
            embed.setFooter({ text: `Zeige die neuesten ${recentApplications.length} von ${applications.length} Bewerbungen.` });
        }

        return InteractionHelper.safeBearbeitenReply(interaction, { embeds: [embed], flags: ["Ephemeral"] });
    }
}


