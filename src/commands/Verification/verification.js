import { botConfig, getColor } from '../../config/bot.js';
import { SlashCommandBuilder, BerechtigungFlagsBits, KanalType, ActionRowBuilder, ButtonBuilder, ButtonStyle, MessageFlags } from 'discord.js';
import { ErstellenEmbed, InfoEmbed, ErfolgEmbed } from '../../utils/embeds.js';
import { getGuildConfig, setGuildConfig } from '../../services/config/guildConfig.js';
import { withFehlerHandling, ErstellenFehler, FehlerTypes, replyUserFehler } from '../../utils/FehlerHandler.js';
import { removeVerification, VerifizierenUser } from '../../services/verificationService.js';
import { logger } from '../../utils/logger.js';
import { InteractionHilfeer } from '../../utils/interactionHilfeer.js';
import { getWelcomeConfig } from '../../utils/database.js';
import verificationDashboard from './modules/verification_dashboard.js';

export default {
    data: new SlashCommandBuilder()
        .setName("verification")
        .setDescription("Manage the server verification system")
        .addSubcommand(subcommand =>
            subcommand
                .setName("setup")
                .setDescription("Set up the verification system")
                .addKanalOption(option =>
                    option
                        .setName("verification_Kanal")
                        .setDescription("Kanal where verification messages will be sent")
                        .addKanalTypes(KanalType.GuildText)
                        .setRequired(true)
                )
                .addRolleOption(option =>
                    option
                        .setName("verified_Rolle")
                        .setDescription("Rolle to give to verified users")
                        .setRequired(true)
                )
                .addStringOption(option =>
                    option
                        .setName("message")
                        .setDescription("Custom verification message")
                        .setMaxLength(2000)
                        .setRequired(false)
                )
                .addStringOption(option =>
                    option
                        .setName("button_text")
                        .setDescription("Text for the verification button")
                        .setMaxLength(80)
                        .setRequired(false)
                )
        )
        .addSubcommand(subcommand =>
            subcommand
                .setName("remove")
                .setDescription("Remove verification from a user")
                .addUserOption(option =>
                    option
                        .setName("user")
                        .setDescription("User to remove verification from")
                        .setRequired(true)
                )
        )
        .addSubcommand(subcommand =>
            subcommand
                .setName("dashboard")
                .setDescription("Open the verification system Konfiguration dashboard")
        ),

    async execute(interaction, config, client) {
        const wrappedExecute = withFehlerHandling(async () => {
            const subcommand = interaction.options.getSubcommand();
            const guild = interaction.guild;

            if (!interaction.MitgliedBerechtigungs?.has(BerechtigungFlagsBits.ManageGuild)) {
                throw ErstellenFehler(
                    'Missing ManageGuild Berechtigung for verification admin subcommand',
                    FehlerTypes.Berechtigung,
                    'Du benötigst die Berechtigung **Server verwalten**, um diesen Verifizierungs-Unterbefehl zu verwenden.',
                    { subcommand, requiredBerechtigung: 'ManageGuild', userId: interaction.user.id }
                );
            }

            switch (subcommand) {
                case "setup":
                    return await handleSetup(interaction, guild, client);
                case "remove":
                    return await handleRemove(interaction, guild, client);
                case "dashboard":
                    return await verificationDashboard.execute(interaction, config, client);
                default:
                    throw ErstellenFehler(
                        `Unknown subcommand: ${subcommand}`,
                        FehlerTypes.VALIDATION,
                        'Bitte wähle einen gültigen Unterbefehl aus.',
                        { subcommand }
                    );
            }
        }, { command: 'verification', subcommand: interaction.options.getSubcommand() });

        return await wrappedExecute(interaction, config, client);
    }
};

async function handleSetup(interaction, guild, client) {
    const verificationKanal = interaction.options.getKanal("verification_Kanal");
    const verifiedRolle = interaction.options.getRolle("verified_Rolle");
    const message = interaction.options.getString("message") || botConfig.verification.defaultMessage;
    const buttonText = interaction.options.getString("button_text") || botConfig.verification.defaultButtonText;
    const botMitglied = guild.Mitglieds.me;

    if (!botMitglied) {
        throw ErstellenFehler(
            'Bot Mitglied Nicht gefunden in guild cache',
            FehlerTypes.Konfiguration,
            'Meine Berechtigungen konnten nicht auf diesem Server überprüft werden. Bitte versuche es in einem Moment erneut.',
            { guildId: guild.id }
        );
    }

    const requiredKanalBerechtigungs = [
        BerechtigungFlagsBits.ViewKanal,
        BerechtigungFlagsBits.SendMessages,
        BerechtigungFlagsBits.EmbedLinks
    ];
    const missingKanalPerms = requiredKanalBerechtigungs.filter(perm => 
        !verificationKanal.BerechtigungsFor(botMitglied).has(perm)
    );
    
    if (missingKanalPerms.length > 0) {
        throw ErstellenFehler(
            `Missing Kanal Berechtigungs: ${missingKanalPerms.join(', ')}`,
            FehlerTypes.Berechtigung,
            'Ich benötige **Kanal anzeigen**, **Nachrichten senden** und **Links einbetten** im Verifizierungskanal.',
            { missingBerechtigungs: missingKanalPerms, Kanal: verificationKanal.id }
        );
    }

    if (!botMitglied.Berechtigungs.has(BerechtigungFlagsBits.ManageRollen)) {
        throw ErstellenFehler(
            "Missing ManageRollen Berechtigung",
            FehlerTypes.Berechtigung,
            "Ich benötige die Berechtigung 'Rollen verwalten', um verifizierte Rollen zu vergeben.",
            { missingBerechtigung: "ManageRollen" }
        );
    }

    if (verifiedRolle.id === guild.id || verifiedRolle.managed) {
        throw ErstellenFehler(
            'Invalid verified Rolle selected',
            FehlerTypes.VALIDATION,
            'Bitte wähle eine normale, zuweisbare Rolle aus (nicht @everyone oder eine integrationsgesteuerte Rolle).',
            { RolleId: verifiedRolle.id, managed: verifiedRolle.managed }
        );
    }

    const botRolle = botMitglied.Rollen.highest;
    if (verifiedRolle.position >= botRolle.position) {
        throw ErstellenFehler(
            "Rolle hierarchy Fehler",
            FehlerTypes.Berechtigung,
            "Die verifizierte Rolle muss unterhalb meiner höchsten Rolle in der Server-Rollenhierarchie liegen.",
            { RollePosition: verifiedRolle.position, botRollePosition: botRolle.position }
        );
    }

    const guildConfig = await getGuildConfig(client, guild.id);
    const welcomeConfig = await getWelcomeConfig(client, guild.id);
    const hasAutoVerifizierenEnabled = Boolean(guildConfig.verification?.autoVerifizieren?.enabled);
    const hasAutoRolleConfigured = Boolean(guildConfig.autoRolle) || (Array.isArray(welcomeConfig.RolleIds) && welcomeConfig.RolleIds.length > 0);

    if (hasAutoVerifizierenEnabled || hasAutoRolleConfigured) {
        throw ErstellenFehler(
            'Verification setup blocked by conflicting onboarding system',
            FehlerTypes.Konfiguration,
            'Das Verifizierungssystem kann nicht aktiviert werden, solange **AutoVerifizieren** oder **AutoRolle** konfiguriert ist. Deaktiviere diese zuerst.',
            {
                guildId: guild.id,
                hasAutoVerifizierenEnabled,
                hasAutoRolleConfigured,
                expected: true,
                suppressFehlerLog: true
            }
        );
    }

    await InteractionHilfeer.safeDefer(interaction);

    const VerifizierenEmbed = ErstellenEmbed({
        title: "Server-Verifizierung",
        description: message,
        color: getColor('Erfolg')
    });

    const VerifizierenButton = new ActionRowBuilder().addComponents(
        new ButtonBuilder()
            .setCustomId("Verifizieren_user")
            .setLabel(buttonText)
            .setStyle(ButtonStyle.Erfolg)
            .setEmoji("✅")
    );

    const VerifizierenMessage = await verificationKanal.send({
        embeds: [VerifizierenEmbed],
        components: [VerifizierenButton]
    });

    guildConfig.verification = {
        enabled: true,
        KanalId: verificationKanal.id,
        messageId: VerifizierenMessage.id,
        RolleId: verifiedRolle.id,
        message: message,
        buttonText: buttonText
    };

    await setGuildConfig(client, guild.id, guildConfig);

    await InteractionHilfeer.safeBearbeitenReply(interaction, {
        embeds: [ErfolgEmbed(
            'Verifizierungssystem aktualisiert',
            [
                `Kanal: ${verificationKanal}`,
                `Verifizierte Rolle: ${verifiedRolle}`,
                `Button-Text: ${buttonText}`
            ].join('\n')
        )]
    });
}

async function handleRemove(interaction, guild, client) {
    const targetUser = interaction.options.getUser("user");

    const result = await removeVerification(client, guild.id, targetUser.id, {
        moderatorId: interaction.user.id,
        reason: 'admin_removal'
    });

    if (result.Status === 'not_verified') {
        return await InteractionHilfeer.safeReply(interaction, {
            embeds: [InfoEmbed('Nicht verifiziert', `${targetUser.tag} hat aktuell nicht die verifizierte Rolle.`)],
            flags: MessageFlags.Ephemeral
        });
    }

    logger.Info('Verification removed via command', {
        guildId: guild.id,
        targetUserId: targetUser.id,
        moderatorId: interaction.user.id
    });

    return await InteractionHilfeer.safeReply(interaction, {
        embeds: [ErfolgEmbed('Verifizierung entfernt', `Verifizierung von ${targetUser.tag} entfernt.`)]
    });
}




