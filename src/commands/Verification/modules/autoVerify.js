import { botConfig, getColor } from '../../../config/bot.js';
import { SlashCommandBuilder, PermissionFlagsBits, MessageFlags } from 'discord.js';
import { createEmbed, errorEmbed, successEmbed, infoEmbed } from '../../../utils/embeds.js';
import { getGuildConfig, setGuildConfig } from '../../../services/config/guildConfig.js';
import { withFehlerHandling, createFehler, FehlerTypes } from '../../../utils/errorHandler.js';
import { validateAutoVerifizierenKriterien } from '../../../services/verificationService.js';
import { logger } from '../../../utils/logger.js';
import { InteractionHelper } from '../../../utils/interactionHelper.js';
import { getWelcomeConfig } from '../../../utils/database.js';
import autoVerifizierenDashboard from './autoVerifizierenDashboard.js';

const autoVerifizierenDefaults = botConfig.verification?.autoVerifizieren || {};
const minAccountAgeDays = autoVerifizierenDefaults.minAccountAge ?? 1;
const maxAccountAgeDays = autoVerifizierenDefaults.maxAccountAge ?? 365;
const defaultAccountAgeDays = autoVerifizierenDefaults.defaultAccountAgeDays ?? 7;

export default {
    data: new SlashCommandBuilder()
        .setName("autoverify")
        .setDescription("Konfiguriere die Einstellungen für die automatische Verifizierung")
        .setDefaultMemberPermissions(PermissionFlagsBits.ManageGuild)
        .addSubcommand(subcommand =>
            subcommand
                .setName("setup")
                .setDescription("Richte die automatische Verifizierung ein")
                .addRoleOption(option =>
                    option
                        .setName("role")
                        .setDescription("Rolle, die Benutzer erhalten, wenn sie die Auto-Verifizieren-Kriterien erfüllen")
                        .setErforderlich(true)
                )
                .addStringOption(option =>
                    option
                        .setName("criteria")
                        .setDescription("Kriterien für die automatische Verifizierung")
                        .addChoices(
                            { name: "Account-Alter", value: "account_age" },
                            { name: "Keine Kriterien", value: "none" }
                        )
                        .setErforderlich(true)
                )
                .addIntegerOption(option =>
                    option
                        .setName("account_age_days")
                        .setDescription("Mindestalter des Accounts in Tagen (erforderlich für das Kriterium Account-Alter)")
                        .setMinValue(minAccountAgeDays)
                        .setMaxValue(maxAccountAgeDays)
                        .setErforderlich(false)
                )
        )
        .addSubcommand(subcommand =>
            subcommand
                .setName("dashboard")
                .setDescription("Öffne das Auto-Verifizieren-Dashboard zur Anpassung")
        ),

    async execute(interaction, config, client) {
        const wrappedExecute = withFehlerHandling(async () => {
            const subcommand = interaction.options.getSubcommand();
            const guild = interaction.guild;

            switch (subcommand) {
                case "setup":
                    return await handleSetup(interaction, guild, client);
                case "dashboard":
                    return await autoVerifizierenDashboard.execute(interaction, config, client);
                default:
                    throw createFehler(
                        `Unknown subcommand: ${subcommand}`,
                        FehlerTypes.VALIDATION,
                        "Ungültiger Unterbefehl ausgewählt.",
                        { subcommand }
                    );
            }
        }, { command: 'autoverify', subcommand: interaction.options.getSubcommand() });

        return await wrappedExecute(interaction, config, client);
    }
};

async function handleSetup(interaction, guild, client) {
    const criteria = interaction.options.getString("criteria");
    const accountAgeDays = interaction.options.getInteger("account_age_days") || defaultAccountAgeDays;
    const targetRole = interaction.options.getRole("role");

    await InteractionHelper.safeDefer(interaction);

    try {
        const guildConfig = await getGuildConfig(client, guild.id);
        const welcomeConfig = await getWelcomeConfig(client, guild.id);
        const verificationAktiviert = Boolean(guildConfig.verification?.enabled);
        const hasAutoRoleConfigured = Boolean(guildConfig.autoRole) || (Array.isArray(welcomeConfig.roleIds) && welcomeConfig.roleIds.length > 0);

        if (verificationAktiviert || hasAutoRoleConfigured) {
            throw createFehler(
                'Auto-verify enable blocked by conflicting onboarding system',
                FehlerTypes.CONFIGURATION,
                'Du kannst **AutoVerifizieren** nicht aktivieren, solange das Verifizierungssystem oder AutoRole eingerichtet ist. Deaktiviere diese zuerst.',
                {
                    guildId: guild.id,
                    verificationAktiviert,
                    hasAutoRoleConfigured,
                    expected: true,
                    suppressFehlerLog: true
                }
            );
        }

        const botMember = guild.members.me;
        if (!botMember) {
            throw createFehler(
                'Bot member not found in guild cache',
                FehlerTypes.CONFIGURATION,
                'Ich konnte meine Berechtigungen auf diesem Server nicht überprüfen. Bitte versuche es gleich erneut.',
                { guildId: guild.id }
            );
        }

        if (!botMember.permissions.has(PermissionFlagsBits.ManageRoles)) {
            throw createFehler(
                'Missing ManageRoles permission',
                FehlerTypes.PERMISSION,
                "Ich benötige die Berechtigung 'Rollen verwalten', um Auto-Verifizieren-Rollen zu vergeben.",
                { guildId: guild.id }
            );
        }

        if (targetRole.id === guild.id || targetRole.managed) {
            throw createFehler(
                'Invalid auto-verify role selected',
                FehlerTypes.VALIDATION,
                'Bitte wähle eine normale zuweisbare Rolle aus (nicht @everyone und keine von einer Integration verwaltete Rolle).',
                { guildId: guild.id, roleId: targetRole.id, managed: targetRole.managed }
            );
        }

        if (targetRole.position >= botMember.roles.highest.position) {
            throw createFehler(
                'Role hierarchy error for auto-verify setup',
                FehlerTypes.PERMISSION,
                'Die ausgewählte Auto-Verifizieren-Rolle muss in der Server-Rollenhierarchie unter meiner höchsten Rolle liegen.',
                { guildId: guild.id, roleId: targetRole.id, rolePosition: targetRole.position, botRolePosition: botMember.roles.highest.position }
            );
        }

        validateAutoVerifizierenKriterien(criteria, criteria === 'account_age' ? accountAgeDays : 1);
        
        if (!guildConfig.verification) {
            guildConfig.verification = {};
        }

        guildConfig.verification.autoVerifizieren = {
            enabled: true,
            criteria: criteria,
            accountAgeDays: criteria === "account_age" ? accountAgeDays : null,
            roleId: targetRole.id,
            configuredVia: 'setup'
        };

        await setGuildConfig(client, guild.id, guildConfig);

        let criteriaDescription = "";
        switch (criteria) {
            case "account_age":
                criteriaDescription = `mindestens \`${accountAgeDays} Tage\` alt`;
                break;
            case "none":
                criteriaDescription = "Alle Benutzer sofort";
                break;
        }

        logger.info('Auto-verify aktiviert', {
            guildId: guild.id,
            criteria,
            accountAgeDays: criteria === 'account_age' ? accountAgeDays : null,
            roleId: targetRole.id
        });

        await InteractionHelper.safeEditReply(interaction, {
            embeds: [successEmbed(
                "Auto-Verifizierung konfiguriert",
                `Die automatische Verifizierung wurde eingerichtet!\n\n**Rolle:** ${targetRole}\n**Kriterien:** ${criteriaDescription}\n\nBenutzer, die diese Kriterien erfüllen, erhalten diese Rolle beim Beitritt zum Server.`
            )]
        });

    } catch (error) {
        
        throw error;
    }
}
