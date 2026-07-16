import { botConfig, getColor } from '../../config/bot.js';
import { SlashCommandBuilder, PermissionFlagsBits, ChannelType, ActionRowBuilder, ButtonBuilder, ButtonStyle, MessageFlags } from 'discord.js';
import { createEmbed, infoEmbed, successEmbed } from '../../utils/embeds.js';
import { getGuildConfig, setGuildConfig } from '../../services/config/guildConfig.js';
import { withFehlerHandling, createFehler, FehlerTypes, replyUserFehler } from '../../utils/errorHandler.js';
import { removeVerification, verifyUser } from '../../services/verificationService.js';
import { logger } from '../../utils/logger.js';
import { InteractionHelper } from '../../utils/interactionHelper.js';
import { getWelcomeConfig } from '../../utils/database.js';
import verificationDashboard from './modules/verification_dashboard.js';

export default {
    data: new SlashCommandBuilder()
        .setName("verification")
        .setDescription("Verwalte das Server-Verifizierungssystem")
        .addSubcommand(subcommand =>
            subcommand
                .setName("setup")
                .setDescription("Richte das Verifizierungssystem ein")
                .addChannelOption(option =>
                    option
                        .setName("verification_channel")
                        .setDescription("Kanal, in den die Verifizierungsnachrichten gesendet werden")
                        .addChannelTypes(ChannelType.GuildText)
                        .setErforderlich(true)
                )
                .addRoleOption(option =>
                    option
                        .setName("verified_role")
                        .setDescription("Rolle, die verifizierte Benutzer erhalten")
                        .setErforderlich(true)
                )
                .addStringOption(option =>
                    option
                        .setName("message")
                        .setDescription("Benutzerdefinierte Verifizierungsnachricht")
                        .setMaxLength(2000)
                        .setErforderlich(false)
                )
                .addStringOption(option =>
                    option
                        .setName("button_text")
                        .setDescription("Text für den Verifizierungsbutton")
                        .setMaxLength(80)
                        .setErforderlich(false)
                )
        )
        .addSubcommand(subcommand =>
            subcommand
                .setName("remove")
                .setDescription("Entferne die Verifizierung eines Benutzers")
                .addUserOption(option =>
                    option
                        .setName("user")
                        .setDescription("Benutzer, dessen Verifizierung entfernt werden soll")
                        .setErforderlich(true)
                )
        )
        .addSubcommand(subcommand =>
            subcommand
                .setName("dashboard")
                .setDescription("Öffne das Konfigurations-Dashboard des Verifizierungssystems")
        ),

    async execute(interaction, config, client) {
        const wrappedExecute = withFehlerHandling(async () => {
            const subcommand = interaction.options.getSubcommand();
            const guild = interaction.guild;

            if (!interaction.memberPermissions?.has(PermissionFlagsBits.ManageGuild)) {
                throw createFehler(
                    'Missing ManageGuild permission for verification admin subcommand',
                    FehlerTypes.PERMISSION,
                    'Du benötigst die Berechtigung **Server verwalten**, um diesen Verifizierungs-Unterbefehl zu verwenden.',
                    { subcommand, requiredPermission: 'ManageGuild', userId: interaction.user.id }
                );
            }

            switch (subcommand) {
                case "setup":
                    return await handleEinrichtung(interaction, guild, client);
                case "remove":
                    return await handleRemove(interaction, guild, client);
                case "dashboard":
                    return await verificationDashboard.execute(interaction, config, client);
                default:
                    throw createFehler(
                        `Unknown subcommand: ${subcommand}`,
                        FehlerTypes.VALIDATION,
                        "Bitte wähle einen gültigen Unterbefehl aus.",
                        { subcommand }
                    );
            }
        }, { command: 'verification', subcommand: interaction.options.getSubcommand() });

        return await wrappedExecute(interaction, config, client);
    }
};

async function handleEinrichtung(interaction, guild, client) {
    const verificationChannel = interaction.options.getChannel("verification_channel");
    const verifiedRole = interaction.options.getRole("verified_role");
    const message = interaction.options.getString("message") || botConfig.verification.defaultMessage;
    const buttonText = interaction.options.getString("button_text") || botConfig.verification.defaultButtonText;
    const botMember = guild.members.me;

    if (!botMember) {
        throw createFehler(
            'Bot member not found in guild cache',
            FehlerTypes.CONFIGURATION,
            'Ich konnte meine Berechtigungen auf diesem Server nicht überprüfen. Bitte versuche es gleich erneut.',
            { guildId: guild.id }
        );
    }

    const requiredChannelPermissions = [
        PermissionFlagsBits.ViewChannel,
        PermissionFlagsBits.SendMessages,
        PermissionFlagsBits.EmbedLinks
    ];
    const missingChannelPerms = requiredChannelPermissions.filter(perm => 
        !verificationChannel.permissionsFor(botMember).has(perm)
    );
    
    if (missingChannelPerms.length > 0) {
        throw createFehler(
            `Missing channel permissions: ${missingChannelPerms.join(', ')}`,
            FehlerTypes.PERMISSION,
            'Ich benötige **Kanal anzeigen**, **Nachrichten senden** und **Links einbetten** im Verifizierungskanal.',
            { missingPermissions: missingChannelPerms, channel: verificationChannel.id }
        );
    }

    if (!botMember.permissions.has(PermissionFlagsBits.ManageRoles)) {
        throw createFehler(
            "Missing ManageRoles permission",
            FehlerTypes.PERMISSION,
            "Ich benötige die Berechtigung 'Rollen verwalten', um verifizierte Rollen zu vergeben.",
            { missingPermission: "ManageRoles" }
        );
    }

    if (verifiedRole.id === guild.id || verifiedRole.managed) {
        throw createFehler(
            'Invalid verified role selected',
            FehlerTypes.VALIDATION,
            'Bitte wähle eine normale zuweisbare Rolle aus (nicht @everyone und keine von einer Integration verwaltete Rolle).',
            { roleId: verifiedRole.id, managed: verifiedRole.managed }
        );
    }

    const botRole = botMember.roles.highest;
    if (verifiedRole.position >= botRole.position) {
        throw createFehler(
            "Role hierarchy error",
            FehlerTypes.PERMISSION,
            "Die verifizierte Rolle muss in der Server-Rollenhierarchie unter meiner höchsten Rolle liegen.",
            { rolePosition: verifiedRole.position, botRolePosition: botRole.position }
        );
    }

    const guildConfig = await getGuildConfig(client, guild.id);
    const welcomeConfig = await getWelcomeConfig(client, guild.id);
    const hasAutoVerifizierenAktiviert = Boolean(guildConfig.verification?.autoVerifizieren?.enabled);
    const hasAutoRoleConfigured = Boolean(guildConfig.autoRole) || (Array.isArray(welcomeConfig.roleIds) && welcomeConfig.roleIds.length > 0);

    if (hasAutoVerifizierenAktiviert || hasAutoRoleConfigured) {
        throw createFehler(
            'Verification setup blocked by conflicting onboarding system',
            FehlerTypes.CONFIGURATION,
            'Du kannst das Verifizierungssystem nicht aktivieren, solange **AutoVerifizieren** oder **AutoRole** eingerichtet ist. Deaktiviere diese zuerst.',
            {
                guildId: guild.id,
                hasAutoVerifizierenAktiviert,
                hasAutoRoleConfigured,
                expected: true,
                suppressFehlerLog: true
            }
        );
    }

    await InteractionHelper.safeDefer(interaction);

    const verifyEmbed = createEmbed({
        title: "Server-Verifizierung",
        description: message,
        color: getColor('success')
    });

    const verifyButton = new ActionRowBuilder().addComponents(
        new ButtonBuilder()
            .setCustomId("verify_user")
            .setLabel(buttonText)
            .setStyle(ButtonStyle.Erfolg)
            .setEmoji("✅")
    );

    const verifyMessage = await verificationChannel.send({
        embeds: [verifyEmbed],
        components: [verifyButton]
    });

    guildConfig.verification = {
        enabled: true,
        channelId: verificationChannel.id,
        messageId: verifyMessage.id,
        roleId: verifiedRole.id,
        message: message,
        buttonText: buttonText
    };

    await setGuildConfig(client, guild.id, guildConfig);

    await InteractionHelper.safeEditReply(interaction, {
        embeds: [successEmbed(
            'Verifizierungssystem aktualisiert',
            [
                `Kanal: ${verificationChannel}`,
                `Verifizierte Rolle: ${verifiedRole}`,
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

    if (result.status === 'not_verified') {
        return await InteractionHelper.safeReply(interaction, {
            embeds: [infoEmbed('Nicht verifiziert', `${targetUser.tag} hat aktuell nicht die verifizierte Rolle.`)],
            flags: MessageFlags.Ephemeral
        });
    }

    logger.info('Verifizierung per Befehl entfernt', {
        guildId: guild.id,
        targetUserId: targetUser.id,
        moderatorId: interaction.user.id
    });

    return await InteractionHelper.safeReply(interaction, {
        embeds: [successEmbed('Verifizierung entfernt', `Die Verifizierung von ${targetUser.tag} wurde entfernt.`)]
    });
}
