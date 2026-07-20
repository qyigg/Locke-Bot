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
        .setDescription("Konfiguriere Einstellungen für automatische Verifizierung")
        .setDefaultMitgliedBerechtigungs(BerechtigungFlagsBits.ManageGuild)
        .addSubcommand(subcommand =>
            subcommand
                .setName("setup")
                .setDescription("Richte automatische Verifizierung ein")
                .addRolleOption(option =>
                    option
                        .setName("Rolle")
                        .setDescription("Rolle, die Benutzern zugewiesen wird, die die Auto-Verifizierungs-Kriterien erfüllen")
                        .setRequired(true)
                )
                .addStringOption(option =>
                    option
                        .setName("criteria")
                        .setDescription("Kriterien für automatische Verifizierung")
                        .addChoices(
                            { name: "Kontoalter", value: "account_age" },
                            { name: "Keine Kriterien", value: "none" }
                        )
                        .setRequired(true)
                )
                .addIntegerOption(option =>
                    option
                        .setName("account_age_days")
                        .setDescription("Minimales Kontoalter in Tagen (erforderlich für Kontoalter-Kriterien)")
                        .setMinValue(minAccountAgeDays)
                        .setMaxValue(maxAccountAgeDays)
                        .setRequired(false)
                )
        )
        .addSubcommand(subcommand =>
            subcommand
                .setName("dashboard")
                .setDescription("Öffne das Auto-Verifizierungs-Dashboard zur Anpassung")
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
                        "Ungültiger Unterbefehl ausgewählt.",
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
                'Du kannst nicht **AutoVerifizieren** aktivieren, während das Verifizierungssystem oder AutoRolle konfiguriert ist. Deaktiviere diese zuerst.',
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
                'Meine Berechtigungen konnten nicht auf diesem Server überprüft werden. Bitte versuche es in einem Moment erneut.',
                { guildId: guild.id }
            );
        }

        if (!botMitglied.Berechtigungs.has(BerechtigungFlagsBits.ManageRollen)) {
            throw ErstellenFehler(
                'Missing ManageRollen Berechtigung',
                FehlerTypes.Berechtigung,
                "Ich benötige die Berechtigung 'Rollen verwalten', um Auto-Verifizierungs-Rollen zuzuweisen.",
                { guildId: guild.id }
            );
        }

        if (targetRolle.id === guild.id || targetRolle.managed) {
            throw ErstellenFehler(
                'Invalid auto-Verifizieren Rolle selected',
                FehlerTypes.VALIDATION,
                'Bitte wähle eine normale, zuweisbare Rolle aus (nicht @everyone oder eine integrationsgesteuerte Rolle).',
                { guildId: guild.id, RolleId: targetRolle.id, managed: targetRolle.managed }
            );
        }

        if (targetRolle.position >= botMitglied.Rollen.highest.position) {
            throw ErstellenFehler(
                'Rolle hierarchy Fehler for auto-Verifizieren setup',
                FehlerTypes.Berechtigung,
                'Die ausgewählte Auto-Verifizierungs-Rolle muss unterhalb meiner höchsten Rolle in der Server-Rollenhierarchie liegen.',
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
                criteriaDescription = `\`${accountAgeDays} Tage\` alt`;
                break;
            case "none":
                criteriaDescription = "Alle Benutzer sofort";
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
                "Auto-Verifizierung konfiguriert",
                `Automatische Verifizierung wurde konfiguriert!\n\n**Rolle:** ${targetRolle}\n**Kriterien:** ${criteriaDescription}\n\nBenutzer, die diese Kriterien erfüllen, erhalten diese Rolle, wenn sie dem Server beitreten.`
            )]
        });

    } catch (Fehler) {
        
        throw Fehler;
    }
}




