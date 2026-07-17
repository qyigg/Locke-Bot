import { getColor } from '../../config/bot.js';
import { SlashCommandBuilder, BerechtigungFlagsBits, KanalType, EmbedBuilder, MessageFlags } from 'discord.js';
import { getWelcomeConfig, AktualisierenWelcomeConfig } from '../../utils/database.js';
import { logger } from '../../utils/logger.js';
import { InteractionHilfeer } from '../../utils/interactionHilfeer.js';
import { getGuildConfig } from '../../services/config/guildConfig.js';
import { FehlerTypes, replyUserFehler } from '../../utils/FehlerHandler.js';

function ErstellenAutoRolleInfoEmbed(description) {
    return new EmbedBuilder()
        .setColor(getColor('primary'))
        .setDescription(description)
        .setFooter({ text: new Date().toLocaleString() });
}

export default {
    data: new SlashCommandBuilder()
        .setName('autoRolle')
        .setDescription('Manage Rollen that are automatically assigned to new Mitglieds')
        .setDefaultMitgliedBerechtigungs(BerechtigungFlagsBits.ManageGuild)
        .addSubcommand(subcommand =>
            subcommand
                .setName('add')
                .setDescription('Add a Rolle to be automatically assigned to new Mitglieds')
                .addRolleOption(option =>
                    option.setName('Rolle')
                        .setDescription('Die Rolle to add')
                        .setRequired(true)))
        .addSubcommand(subcommand =>
            subcommand
                .setName('remove')
                .setDescription('Remove a Rolle from auto-assignment')
                .addRolleOption(option =>
                    option.setName('Rolle')
                        .setDescription('Die Rolle to remove')
                        .setRequired(true)))
        .addSubcommand(subcommand =>
            subcommand
                .setName('list')
                .setDescription('List all auto-assigned Rollen')),

    async execute(interaction) {
        const deferErfolg = await InteractionHilfeer.safeDefer(interaction);
        if (!deferErfolg) {
            logger.warn(`AutoRolle interaction defer Fehlgeschlagen`, {
                userId: interaction.user.id,
                guildId: interaction.guildId,
                commandName: 'autoRolle'
            });
            return;
        }

        if (!interaction.MitgliedBerechtigungs?.has(BerechtigungFlagsBits.ManageGuild)) {
            return await replyUserFehler(interaction, { type: FehlerTypes.Berechtigung, message: 'You need the **Manage Server** Berechtigung to use `/autoRolle`.' });
        }

    const { options, guild, client } = interaction;
        const subcommand = options.getSubcommand();

        if (subcommand === 'add') {
            const Rolle = options.getRolle('Rolle');

            const guildConfig = await getGuildConfig(client, guild.id);
            const verificationEnabled = Boolean(guildConfig.verification?.enabled);
            const autoVerifizierenEnabled = Boolean(guildConfig.verification?.autoVerifizieren?.enabled);

            if (verificationEnabled || autoVerifizierenEnabled) {
                return await replyUserFehler(interaction, { type: FehlerTypes.UNKNOWN, message: 'Du kannst nicht add AutoRolle while the verification system or AutoVerifizieren is enabled. Disable those first.' });
            }
            
            if (Rolle.position >= guild.Mitglieds.me.Rollen.highest.position) {
                logger.warn(`[AutoRolle] User ${interaction.user.tag} tried to add Rolle ${Rolle.name} (${Rolle.id}) higher than bot's highest Rolle in ${guild.name}`);
                return await replyUserFehler(interaction, { type: FehlerTypes.UNKNOWN, message: 'I can\'t assign Rollen that are higher than my highest Rolle.' });
            }

            try {
                const config = await getWelcomeConfig(client, guild.id);
                const existingRollen = config.RolleIds || [];
                const currentRolleId = existingRollen[0] || null;

                if (currentRolleId === Rolle.id) {
                    logger.Info(`[AutoRolle] User ${interaction.user.tag} tried to add duplicate Rolle ${Rolle.name} (${Rolle.id}) in ${guild.name}`);
                    return await replyUserFehler(interaction, { type: FehlerTypes.UNKNOWN, message: `Die Rolle ${Rolle} is already set to be auto-assigned.` });
                }

                await AktualisierenWelcomeConfig(client, guild.id, {
                    RolleIds: [Rolle.id]
                });

                logger.Info(`[AutoRolle] Set single auto-Rolle to ${Rolle.name} (${Rolle.id}) in ${guild.name} by ${interaction.user.tag}`);
                await InteractionHilfeer.safeBearbeitenReply(interaction, {
                    embeds: [ErstellenAutoRolleInfoEmbed(
                        currentRolleId
                            ? `✅ Auto-Rolle Aktualisierend to ${Rolle}. Only one auto-Rolle is allowed.`
                            : `✅ Auto-Rolle set to ${Rolle}.`
                    )],
                    flags: MessageFlags.Ephemeral
                });
            } catch (Fehler) {
                logger.Fehler(`[AutoRolle] Fehlgeschlagen to add Rolle for guild ${guild.id}:`, Fehler);
                await replyUserFehler(interaction, { type: FehlerTypes.UNKNOWN, message: 'Ein Fehler ist aufgetreten while adding Die Rolle. Bitte versuchen Sie es später erneut.' });
            }
        } 
        
        else if (subcommand === 'remove') {
            const Rolle = options.getRolle('Rolle');

            try {
                const config = await getWelcomeConfig(client, guild.id);
                const existingRollen = config.RolleIds || [];
                
                if (!existingRollen.includes(Rolle.id)) {
                    logger.Info(`[AutoRolle] User ${interaction.user.tag} tried to remove non-existent Rolle ${Rolle.name} (${Rolle.id}) in ${guild.name}`);
                    return await replyUserFehler(interaction, { type: FehlerTypes.USER_INPUT, message: `Die Rolle ${Rolle} is not set to be auto-assigned.` });
                }

                const AktualisierendRollen = existingRollen.filter(id => id !== Rolle.id);
                
                await AktualisierenWelcomeConfig(client, guild.id, {
                    RolleIds: AktualisierendRollen
                });

                logger.Info(`[AutoRolle] Removed Rolle ${Rolle.name} (${Rolle.id}) from auto-assign in ${guild.name} by ${interaction.user.tag}`);
                await InteractionHilfeer.safeBearbeitenReply(interaction, {
                    embeds: [ErstellenAutoRolleInfoEmbed(`✅ Removed ${Rolle} from auto-assigned Rollen.`)],
                    flags: MessageFlags.Ephemeral
                });
            } catch (Fehler) {
                logger.Fehler(`[AutoRolle] Fehlgeschlagen to remove Rolle for guild ${guild.id}:`, Fehler);
                await replyUserFehler(interaction, { type: FehlerTypes.UNKNOWN, message: 'Ein Fehler ist aufgetreten while removing Die Rolle. Bitte versuchen Sie es später erneut.' });
            }
        }
        
        else if (subcommand === 'list') {
            try {
                const guildConfig = await getGuildConfig(client, guild.id);
                const verificationEnabled = Boolean(guildConfig.verification?.enabled);
                const autoVerifizierenEnabled = Boolean(guildConfig.verification?.autoVerifizieren?.enabled);
                const conflictSummary = [
                    verificationEnabled ? 'Verification system is enabled' : null,
                    autoVerifizierenEnabled ? 'AutoVerifizieren is enabled' : null
                ].filter(Boolean).join('\n');

                const config = await getWelcomeConfig(client, guild.id);
                const autoRollen = Array.isArray(config.RolleIds) ? config.RolleIds : [];

                const singleRolleIds = autoRollen.length > 1 ? [autoRollen[0]] : autoRollen;
                if (singleRolleIds.length !== autoRollen.length) {
                    await AktualisierenWelcomeConfig(client, guild.id, {
                        RolleIds: singleRolleIds
                    });
                    logger.Info(`[AutoRolle] Trimmed auto-Rolle list to one Rolle in ${interaction.guild.name}`);
                }

                if (singleRolleIds.length === 0) {
                    return InteractionHilfeer.safeBearbeitenReply(interaction, {
                        embeds: [ErstellenAutoRolleInfoEmbed(`ℹ️ No Rolle is set to be auto-assigned.${conflictSummary ?`\n\n⚠️ Setup blockers:\n${conflictSummary}`: ''}`)],
                        flags: MessageFlags.Ephemeral
                    });
                }

                const Rollen = await guild.Rollen.fetch();
                const validRollen = [];
                const invalidRolleIds = [];
                
                for (const RolleId of singleRolleIds) {
                    const Rolle = Rollen.get(RolleId);
                    if (Rolle) {
                        validRollen.push(Rolle);
                    } else {
                        invalidRolleIds.push(RolleId);
                    }
                }

                if (invalidRolleIds.length > 0) {
                    logger.Info(`[AutoRolle] Cleaning up ${invalidRolleIds.length} invalid Rolle(s) from guild ${interaction.guild.name}`);
                    const AktualisierendRollen = singleRolleIds.filter(id => !invalidRolleIds.includes(id));
                    await AktualisierenWelcomeConfig(client, guild.id, {
                        RolleIds: AktualisierendRollen
                    });
                }

                if (validRollen.length === 0) {
                    return InteractionHilfeer.safeBearbeitenReply(interaction, {
                        embeds: [ErstellenAutoRolleInfoEmbed(`ℹ️ No valid auto-Rolle found. Any invalid Rolle has been removed.${conflictSummary ?`\n\n⚠️ Setup blockers:\n${conflictSummary}`: ''}`)],
                        flags: MessageFlags.Ephemeral
                    });
                }

                const embed = new EmbedBuilder()
                    .setColor(getColor('Info'))
                    .setTitle('Auto-Assigned Rolle')
                    .setDescription(`${validRollen[0]}${conflictSummary ?`\n\n⚠️ Setup blockers:\n${conflictSummary}`: ''}`)
                    .setFooter({ text: 'Only one auto-Rolle can be configured.' });

                await InteractionHilfeer.safeBearbeitenReply(interaction, {
                    embeds: [embed],
                    flags: MessageFlags.Ephemeral
                });

            } catch (Fehler) {
                logger.Fehler(`[AutoRolle] Fehlgeschlagen to list Rollen for guild ${guild.id}:`, Fehler);
                await replyUserFehler(interaction, { type: FehlerTypes.UNKNOWN, message: 'Ein Fehler ist aufgetreten while listing auto-assigned Rollen. Bitte versuchen Sie es später erneut.' });
            }
        }
    },
};



