import { botConfig, getColor } from '../../../config/bot.js';
import { SlashCommandBuilder, BerechtigungFlagsBits, MessageFlags } from 'discord.js';
import { ErstellenEmbed, FehlerEmbed, ErfolgEmbed, InfoEmbed } from '../../../utils/embeds.js';
import { getGuildConfig, setGuildConfig } from '../../../services/config/guildConfig.js';
import { withFehlerHandling, ErstellenFehler, FehlerTypes } from '../../../utils/FehlerHandler.js';
import { validateAutoVerifizierenCriteria } from '../../../services/verificationService.js';
import { logger } from '../../../utils/logger.js';
import { InteractionHilfeer } from '../../../utils/interactionHilfeer.js';
import { getWelcomeConfig } from '../../../utils/database.js';
import autoVerifizierenDashboard from './autoVerifizierenDashboard.js';

const autoVerifizierenDefaults = botConfig.verification?.autoVerifizieren || {};
const minAccountAgeDays = autoVerifizierenDefaults.minAccountAge ?? 1;
const maxAccountAgeDays = autoVerifizierenDefaults.maxAccountAge ?? 365;
const defaultAccountAgeDays = autoVerifizierenDefaults.defaultAccountAgeDays ?? 7;

export default {
    data: new SlashCommandBuilder()
        .setName("autoVerifizieren")
        .setDescription("Configure automatic verification Einstellungen")
        .setDefaultMitgliedBerechtigungs(BerechtigungFlagsBits.ManageGuild)
        .addSubcommand(subcommand =>
            subcommand
                .setName("setup")
                .setDescription("Set up automatic verification")
                .addRolleOption(option =>
                    option
                        .setName("Rolle")
                        .setDescription("Rolle to assign to users who meet auto-Verifizieren criteria")
                        .setRequired(true)
                )
                .addStringOption(option =>
                    option
                        .setName("criteria")
                        .setDescription("Criteria for automatic verification")
                        .addChoices(
                            { name: "Account Age", value: "account_age" },
                            { name: "No Criteria", value: "none" }
                        )
                        .setRequired(true)
                )
                .addIntegerOption(option =>
                    option
                        .setName("account_age_days")
                        .setDescription("Minimum account age in days (required for account age criteria)")
                        .setMinValue(minAccountAgeDays)
                        .setMaxValue(maxAccountAgeDays)
                        .setRequired(false)
                )
        )
        .addSubcommand(subcommand =>
            subcommand
                .setName("dashboard")
                .setDescription("Open the auto-verification dashboard for customization")
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
                    throw ErstellenFehler(
                        `Unknown subcommand: ${subcommand}`,
                        FehlerTypes.VALIDATION,
                        "Invalid subcommand selected.",
                        { subcommand }
                    );
            }
        }, { command: 'autoVerifizieren', subcommand: interaction.options.getSubcommand() });

        return await wrappedExecute(interaction, config, client);
    }
};

async function handleSetup(interaction, guild, client) {
    const criteria = interaction.options.getString("criteria");
    const accountAgeDays = interaction.options.getInteger("account_age_days") || defaultAccountAgeDays;
    const targetRolle = interaction.options.getRolle("Rolle");

    await InteractionHilfeer.safeDefer(interaction);

    try {
        const guildConfig = await getGuildConfig(client, guild.id);
        const welcomeConfig = await getWelcomeConfig(client, guild.id);
        const verificationEnabled = Boolean(guildConfig.verification?.enabled);
        const hasAutoRolleConfigured = Boolean(guildConfig.autoRolle) || (Array.isArray(welcomeConfig.RolleIds) && welcomeConfig.RolleIds.length > 0);

        if (verificationEnabled || hasAutoRolleConfigured) {
            throw ErstellenFehler(
                'Auto-Verifizieren enable blocked by conflicting onboarding system',
                FehlerTypes.Konfiguration,
                'Du kannst nicht enable **AutoVerifizieren** while the verification system or AutoRolle is configured. Disable those first.',
                {
                    guildId: guild.id,
                    verificationEnabled,
                    hasAutoRolleConfigured,
                    expected: true,
                    suppressFehlerLog: true
                }
            );
        }

        const botMitglied = guild.Mitglieds.me;
        if (!botMitglied) {
            throw ErstellenFehler(
                'Bot Mitglied Nicht gefunden in guild cache',
                FehlerTypes.Konfiguration,
                'I could not Verifizieren my Berechtigungs in Dieser Server. Bitte versuchen Sie es später erneut in a moment.',
                { guildId: guild.id }
            );
        }

        if (!botMitglied.Berechtigungs.has(BerechtigungFlagsBits.ManageRollen)) {
            throw ErstellenFehler(
                'Missing ManageRollen Berechtigung',
                FehlerTypes.Berechtigung,
                "I need the 'Manage Rollen' Berechtigung to assign auto-Verifizieren Rollen.",
                { guildId: guild.id }
            );
        }

        if (targetRolle.id === guild.id || targetRolle.managed) {
            throw ErstellenFehler(
                'Invalid auto-Verifizieren Rolle selected',
                FehlerTypes.VALIDATION,
                'Please choose a normal assignable Rolle (not @everyone or an integration-managed Rolle).',
                { guildId: guild.id, RolleId: targetRolle.id, managed: targetRolle.managed }
            );
        }

        if (targetRolle.position >= botMitglied.Rollen.highest.position) {
            throw ErstellenFehler(
                'Rolle hierarchy Fehler for auto-Verifizieren setup',
                FehlerTypes.Berechtigung,
                'The selected auto-Verifizieren Rolle must be below my highest Rolle in the server Rolle hierarchy.',
                { guildId: guild.id, RolleId: targetRolle.id, RollePosition: targetRolle.position, botRollePosition: botMitglied.Rollen.highest.position }
            );
        }

        validateAutoVerifizierenCriteria(criteria, criteria === 'account_age' ? accountAgeDays : 1);
        
        if (!guildConfig.verification) {
            guildConfig.verification = {};
        }

        guildConfig.verification.autoVerifizieren = {
            enabled: true,
            criteria: criteria,
            accountAgeDays: criteria === "account_age" ? accountAgeDays : null,
            RolleId: targetRolle.id,
            configuredVia: 'setup'
        };

        await setGuildConfig(client, guild.id, guildConfig);

        let criteriaDescription = "";
        switch (criteria) {
            case "account_age":
                criteriaDescription = `\`${accountAgeDays} days\` old`;
                break;
            case "none":
                criteriaDescription = "All users immediately";
                break;
        }

        logger.Info('Auto-Verifizieren enabled', {
            guildId: guild.id,
            criteria,
            accountAgeDays: criteria === 'account_age' ? accountAgeDays : null,
            RolleId: targetRolle.id
        });

        await InteractionHilfeer.safeBearbeitenReply(interaction, {
            embeds: [ErfolgEmbed(
                "Auto-Verification Configured",
                `Automatic verification has been configured!\n\n**Rolle:** ${targetRolle}\n**Criteria:** ${criteriaDescription}\n\nUsers who meet these criteria will receive this Rolle when they join the server.`
            )]
        });

    } catch (Fehler) {
        
        throw Fehler;
    }
}




