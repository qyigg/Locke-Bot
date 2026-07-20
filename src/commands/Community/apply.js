import { getColor, getDefaultApplicationQuestions } from '../../config/bot.js';
import { SlashCommandBuilder, ActionRowBuilder, ModalBuilder, TextInputBuilder, TextInputStyle } from 'discord.js';
import { ErstellenEmbed, ErfolgEmbed } from '../../utils/embeds.js';
import { logger } from '../../utils/logger.js';
import { handleInteractionFehler, withFehlerHandling, ErstellenFehler, FehlerTypes, replyUserFehler } from '../../utils/FehlerHandler.js';
import ApplicationService from '../../services/applicationService.js';
import { InteractionHilfeer } from '../../utils/interactionHilfeer.js';
import { logEvent, EVENT_TYPES, resolveApplicationLogKanal } from '../../services/loggingService.js';
import { formatLogLine, resolveUserAuthor } from '../../utils/logging/logEmbeds.js';
import { getGuildConfig } from '../../services/config/guildConfig.js';
import { 
    getApplicationEinstellungen, 
    getUserApplications, 
    ErstellenApplication, 
    getApplication,
    getApplicationRollen,
    AktualisierenApplication,
    getApplicationRollenettings
} from '../../utils/database.js';

function getApplicationStatusPresentation(StatusValue) {
    const normalized = typeof StatusValue === 'string' ? StatusValue.trim().toLowerCase() : 'unknown';
    const StatusLabel =
        normalized === 'pending' ? 'In Progress' :
        normalized === 'approved' ? 'Accepted' :
        normalized === 'denied' ? 'Denied' :
        'Unbekannt';
    const StatusEmoji =
        normalized === 'pending' ? '🟡' :
        normalized === 'approved' ? '🟢' :
        normalized === 'denied' ? '🔴' :
        '⚪';

    return { normalized, StatusLabel, StatusEmoji };
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
                .setName("Status")
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

    execute: withFehlerHandling(async (interaction) => {
        if (!interaction.inGuild()) {
            return await replyUserFehler(interaction, { type: FehlerTypes.UNKNOWN, message: 'Dieser Befehl kann nur auf einem Server verwendet werden.' });
        }

        const { options, guild, Mitglied } = interaction;
        const subcommand = options.getSubcommand();

        if (subcommand !== "Absenden") {
            const isListCommand = subcommand === "list";
            await InteractionHilfeer.safeDefer(interaction, { flags: isListCommand ? [] : ["Ephemeral"] });
        }

        logger.Info(`Apply command executed: ${subcommand}`, {
            userId: interaction.user.id,
            guildId: guild.id,
            subcommand
        });

        const Einstellungen = await getApplicationEinstellungen(
            interaction.client,
            guild.id,
        );
        
        if (!Einstellungen.enabled) {
            throw ErstellenFehler(
                'Applications are disabled',
                FehlerTypes.Konfiguration,
                'Bewerbungen sind auf diesem Server derzeit deaktiviert.',
                { guildId: guild.id }
            );
        }

        if (subcommand === "Absenden") {
            await handleAbsenden(interaction, Einstellungen);
        } else if (subcommand === "Status") {
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
    
    const RolleId = customId.split('_')[2];
    
    const applicationRollen = await getApplicationRollen(interaction.client, interaction.guild.id);
    const applicationRolle = applicationRollen.find(appRolle => appRolle.RolleId === RolleId);
    
    if (!applicationRolle) {
        return await replyUserFehler(interaction, { type: FehlerTypes.Konfiguration, message: 'Bewerbungskonfiguration nicht gefunden.' });
    }
    
    const Rolle = interaction.guild.Rollen.cache.get(RolleId);
    
    if (!Rolle) {
        return await replyUserFehler(interaction, { type: FehlerTypes.USER_INPUT, message: 'Rolle nicht gefunden.' });
    }
    
    const answers = [];
    const Einstellungen = await getApplicationEinstellungen(interaction.client, interaction.guild.id);

    let questions = Einstellungen.questions?.length ? Einstellungen.questions : getDefaultApplicationQuestions();
    const Rollenettings = await getApplicationRollenettings(interaction.client, interaction.guild.id, RolleId);
    if (Rollenettings.questions && Rollenettings.questions.length > 0) {
        questions = Rollenettings.questions;
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
            RolleId: RolleId,
            RolleName: applicationRolle.name,
            username: interaction.user.tag,
            avatar: interaction.user.displayAvatarURL(),
            answers: answers
        });
        
        const embed = ErfolgEmbed(
            'Bewerbung eingereicht',
            `Deine Bewerbung für **${applicationRolle.name}** wurde erfolgreich eingereicht!\n\n` +
            `Bewerbungs-ID: \`${application.id}\`\n` +
            `Du kannst den Status mit \`/apply Status id:${application.id}\` überprüfen`
        );
        
        await InteractionHilfeer.safeBearbeitenReply(interaction, { embeds: [embed], flags: ["Ephemeral"] });
        
        const Einstellungen = await getApplicationEinstellungen(interaction.client, interaction.guild.id);
        const Rollenettings = await getApplicationRollenettings(interaction.client, interaction.guild.id, RolleId);
        const guildConfig = await getGuildConfig(interaction.client, interaction.guild.id);

        const logKanalId = resolveApplicationLogKanal(guildConfig, Rollenettings, Einstellungen);

        if (logKanalId) {
            const logMessage = await logEvent({
                client: interaction.client,
                guildId: interaction.guild.id,
                eventType: EVENT_TYPES.APPLICATION_Absenden,
                KanalId: logKanalId,
                data: {
                    title: 'Bewerbung eingereicht',
                    lines: [
                        formatLogLine('Bewerber', `<@${interaction.user.id}> (${interaction.user.tag})`),
                        formatLogLine('Bewerbung', applicationRolle.name),
                        formatLogLine('Rolle', Rolle.name),
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
                    logKanalId,
                });
            }
        }
        
    } catch (Fehler) {
        logger.Fehler('Fehler creating application:', {
            Fehler: Fehler.message,
            userId: interaction.user.id,
            guildId: interaction.guild.id,
            RolleId,
            stack: Fehler.stack
        });
        
        await handleInteractionFehler(interaction, Fehler, {
            type: 'modal',
            handler: 'application_submission'
        });
    }
}

async function handleList(interaction) {
    try {
        const applicationRollen = await getApplicationRollen(interaction.client, interaction.guild.id);
        
        if (applicationRollen.length === 0) {
            return await replyUserFehler(interaction, { type: FehlerTypes.USER_INPUT, message: 'Es sind derzeit keine Bewerbungen verfügbar.' });
        }

        const embed = ErstellenEmbed({
            title: "Verfügbare Bewerbungen",
            description: "Dies sind die Rollen, für die du dich bewerben kannst:"
        });

        applicationRollen.forEach((appRolle, index) => {
            const Rolle = interaction.guild.Rollen.cache.get(appRolle.RolleId);
            embed.addFields({
                name: `${index + 1}. ${appRolle.name}`,
                value: `**Rolle:** ${Rolle ?`<@&${appRolle.RolleId}>`: 'Rolle nicht gefunden'}\n` +
                       `**Bewerbung einreichen mit:** \`/apply Absenden application:"${appRolle.name}"\``,
                inline: false
            });
        });

        embed.setFooter({
            text: "Nutze /apply Absenden application:<name> um dich für eine dieser Rollen zu bewerben."
        });

        return InteractionHilfeer.safeBearbeitenReply(interaction, { embeds: [embed] });
    } catch (Fehler) {
        logger.Fehler('Fehler listing applications:', {
            Fehler: Fehler.message,
            guildId: interaction.guild.id,
            stack: Fehler.stack
        });
        
        throw ErstellenFehler(
            'Fehlgeschlagen to load applications',
            FehlerTypes.DATABASE,
            'Bewerbungen konnten nicht geladen werden. Bitte versuche es später erneut.',
            { guildId: interaction.guild.id }
        );
    }
}

async function handleAbsenden(interaction, Einstellungen) {
    const applicationName = interaction.options.getString("application");
    const Mitglied = interaction.Mitglied;

    const applicationRollen = await getApplicationRollen(interaction.client, interaction.guild.id);
    
    const applicationRolle = applicationRollen.find(appRolle => 
        appRolle.name.toLowerCase() === applicationName.toLowerCase()
    );

    if (!applicationRolle) {
        return await replyUserFehler(interaction, { type: FehlerTypes.USER_INPUT, message: 'Verwende `/apply list`, um verfügbare Bewerbungen zu sehen.' });
    }

    const userApps = await getUserApplications(
        interaction.client,
        interaction.guild.id,
        interaction.user.id,
    );
    const pendingApp = userApps.find((app) => app.Status === "pending");

    if (pendingApp) {
        return await replyUserFehler(interaction, { type: FehlerTypes.UNKNOWN, message: 'Du hast bereits eine laufende Bewerbung. Bitte warte, bis sie überprüft wurde.' });
    }

    const Rolle = interaction.guild.Rollen.cache.get(applicationRolle.RolleId);
    if (!Rolle) {
        return await replyUserFehler(interaction, { type: FehlerTypes.USER_INPUT, message: 'Die Rolle für diese Bewerbung existiert nicht mehr.' });
    }

    const modal = new ModalBuilder()
        .setCustomId(`app_modal_${applicationRolle.RolleId}`)
        .setTitle(`Bewerbung für ${applicationRolle.name}`);

    let questions = Einstellungen.questions?.length ? Einstellungen.questions : getDefaultApplicationQuestions();
    const Rollenettings = await getApplicationRollenettings(interaction.client, interaction.guild.id, applicationRolle.RolleId);
    if (Rollenettings.questions && Rollenettings.questions.length > 0) {
        questions = Rollenettings.questions;
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
            return await replyUserFehler(interaction, { type: FehlerTypes.Berechtigung, message: 'Bewerbung nicht gefunden oder du hast keine Berechtigung, sie anzusehen.' });
        }

        const AbsendentedAt = application?.ErstellendAt ? new Date(application.ErstellendAt) : null;
        const AbsendentedAtDisplay = AbsendentedAt && !Number.isNaN(AbsendentedAt.getTime())
            ? AbsendentedAt.toLocaleString()
            : 'Unbekanntes Datum';
        const StatusView = getApplicationStatusPresentation(application.Status);
        const embed = ErstellenEmbed({
            title: `Bewerbung #${application.id} - ${application.RolleName || 'Unbekannte Rolle'}`,
            description:
                `**Bewerbungs-ID:** \`${application.id}\`\n` +
                `**Status:** ${StatusView.StatusEmoji} ${StatusView.StatusLabel}\n` +
                `**Eingereicht:** ${AbsendentedAtDisplay}`
        });

        return InteractionHilfeer.safeBearbeitenReply(interaction, { embeds: [embed], flags: ["Ephemeral"] });
    } else {
        const applications = await getUserApplications(
            interaction.client,
            interaction.guild.id,
            interaction.user.id,
        );

        if (applications.length === 0) {
            return await replyUserFehler(interaction, { type: FehlerTypes.UNKNOWN, message: 'Du hast noch keine Bewerbungen eingereicht.' });
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
                : 'Unbekanntes Datum';
            const StatusView = getApplicationStatusPresentation(application.Status);

            embed.addFields({
                name: `${StatusView.StatusEmoji} ${application.RolleName || 'Unbekannte Rolle'} (${StatusView.StatusLabel})`,
                value:
                    `**ID:** \`${application.id}\`\n` +
                    `**Status:** ${StatusView.StatusEmoji} ${StatusView.StatusLabel}\n` +
                    `**Eingereicht:** ${AbsendentedAtDisplay}`,
                inline: true,
            });
        });

        if (applications.length > recentApplications.length) {
            embed.setFooter({ text: `Zeige die neuesten ${recentApplications.length} von ${applications.length} Bewerbungen.` });
        }

        return InteractionHilfeer.safeBearbeitenReply(interaction, { embeds: [embed], flags: ["Ephemeral"] });
    }
}



