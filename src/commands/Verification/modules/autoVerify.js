import { botConfig, getColor } from '../../../config/bot.js';
import { SlashCommandBuilder, PermissionFlagsBits, MessageFlags } from 'discord.js';
import { ErstellenEmbed, errorEmbed, successEmbed, infoEmbed } from '../../../utils/embeds.js';
import { getGuildConfig, setGuildConfig } from '../../../services/config/guildConfig.js';
import { withErrorHandling, ErstellenError, ErrorTypes } from '../../../utils/errorHandler.js';
import { validateAutoVerifizierenCriteria } from '../../../services/verificationService.js';
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
        .setName("autoVerifizieren")
        .setDescription("Configure automatic verification settings")
        .setDefaultMemberPermissions(PermissionFlagsBits.ManageGuild)
        .addSubcommand(subcommand =>
            subcommand
                .setName("setup")
                .setDescription("Set up automatic verification")
                .addRoleOption(option =>
                    option
                        .setName("role")
                        .setDescription("Role to assign to users who meet auto-Verifizieren criteria")
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
        const wrappedExecute = withErrorHandling(async () => {
            const subcommand = interaction.options.getSubcommand();
            const guild = interaction.guild;

            switch (subcommand) {
                case "setup":
                    return await handleSetup(interaction, guild, client);
                case "dashboard":
                    return await autoVerifizierenDashboard.execute(interaction, config, client);
                default:
                    throw ErstellenError(
                        `Unknown subcommand: ${subcommand}`,
                        ErrorTypes.VALIDATION,
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
    const targetRole = interaction.options.getRole("role");

    await InteractionHelper.safeDefer(interaction);

    try {
        const guildConfig = await getGuildConfig(client, guild.id);
        const welcomeConfig = await getWelcomeConfig(client, guild.id);
        const verificationEnabled = Boolean(guildConfig.verification?.enabled);
        const hasAutoRoleConfigured = Boolean(guildConfig.autoRole) || (Array.isArray(welcomeConfig.roleIds) && welcomeConfig.roleIds.length > 0);

        if (verificationEnabled || hasAutoRoleConfigured) {
            throw ErstellenError(
                'Auto-Verifizieren enable blocked by conflicting onboarding system',
                ErrorTypes.CONFIGURATION,
                'Du kannst nicht enable **AutoVerifizieren** while the verification system or AutoRole is configured. Disable those first.',
                {
                    guildId: guild.id,
                    verificationEnabled,
                    hasAutoRoleConfigured,
                    expected: true,
                    suppressErrorLog: true
                }
            );
        }

        const botMember = guild.members.me;
        if (!botMember) {
            throw ErstellenError(
                'Bot member Nicht gefunden in guild cache',
                ErrorTypes.CONFIGURATION,
                'I could not Verifizieren my permissions in Dieser Server. Bitte versuchen Sie es später erneut in a moment.',
                { guildId: guild.id }
            );
        }

        if (!botMember.permissions.has(PermissionFlagsBits.ManageRoles)) {
            throw ErstellenError(
                'Missing ManageRoles permission',
                ErrorTypes.PERMISSION,
                "I need the 'Manage Roles' permission to assign auto-Verifizieren roles.",
                { guildId: guild.id }
            );
        }

        if (targetRole.id === guild.id || targetRole.managed) {
            throw ErstellenError(
                'Invalid auto-Verifizieren role selected',
                ErrorTypes.VALIDATION,
                'Please choose a normal assignable role (not @everyone or an integration-managed role).',
                { guildId: guild.id, roleId: targetRole.id, managed: targetRole.managed }
            );
        }

        if (targetRole.position >= botMember.roles.highest.position) {
            throw ErstellenError(
                'Role hierarchy error for auto-Verifizieren setup',
                ErrorTypes.PERMISSION,
                'The selected auto-Verifizieren role must be below my highest role in the server role hierarchy.',
                { guildId: guild.id, roleId: targetRole.id, rolePosition: targetRole.position, botRolePosition: botMember.roles.highest.position }
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
            roleId: targetRole.id,
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

        logger.info('Auto-Verifizieren enabled', {
            guildId: guild.id,
            criteria,
            accountAgeDays: criteria === 'account_age' ? accountAgeDays : null,
            roleId: targetRole.id
        });

        await InteractionHelper.safeBearbeitenReply(interaction, {
            embeds: [successEmbed(
                "Auto-Verification Configured",
                `Automatic verification has been configured!\n\n**Role:** ${targetRole}\n**Criteria:** ${criteriaDescription}\n\nUsers who meet these criteria will receive this role when they join the server.`
            )]
        });

    } catch (error) {
        
        throw error;
    }
}



