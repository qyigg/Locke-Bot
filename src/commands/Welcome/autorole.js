import { getColor } from '../../config/bot.js';
import { SlashCommandBuilder, PermissionFlagsBits, ChannelType, EmbedBuilder, MessageFlags } from 'discord.js';
import { getWelcomeConfig, updateWelcomeConfig } from '../../utils/database.js';
import { logger } from '../../utils/logger.js';
import { InteractionHelper } from '../../utils/interactionHelper.js';
import { getGuildConfig } from '../../services/config/guildConfig.js';
import { ErrorTypes, replyUserError } from '../../utils/errorHandler.js';

function createAutoroleInfoEmbed(description) {
    return new EmbedBuilder()
        .setColor(getColor('primary'))
        .setDescription(description)
        .setFooter({ text: new Date().toLocaleString() });
}

export default {
    data: new SlashCommandBuilder()
        .setName('autorole')
        .setDescription('Verwalte Rollen, die neuen Mitgliedern automatisch zugewiesen werden')
        .setDefaultMemberPermissions(PermissionFlagsBits.ManageGuild)
        .addSubcommand(subcommand =>
            subcommand
                .setName('add')
                .setDescription('Füge eine Rolle hinzu, die neuen Mitgliedern automatisch zugewiesen wird')
                .addRoleOption(option =>
                    option.setName('role')
                        .setDescription('Die hinzuzufügende Rolle')
                        .setRequired(true)))
        .addSubcommand(subcommand =>
            subcommand
                .setName('remove')
                .setDescription('Entferne eine Rolle aus der automatischen Zuweisung')
                .addRoleOption(option =>
                    option.setName('role')
                        .setDescription('Die zu entfernende Rolle')
                        .setRequired(true)))
        .addSubcommand(subcommand =>
            subcommand
                .setName('list')
                .setDescription('Liste alle automatisch zugewiesenen Rollen auf')),

    async execute(interaction) {
        const deferSuccess = await InteractionHelper.safeDefer(interaction);
        if (!deferSuccess) {
            logger.warn(`Autorole-Interaction defer fehlgeschlagen`, {
                userId: interaction.user.id,
                guildId: interaction.guildId,
                commandName: 'autorole'
            });
            return;
        }

        if (!interaction.memberPermissions?.has(PermissionFlagsBits.ManageGuild)) {
            return await replyUserError(interaction, { type: ErrorTypes.PERMISSION, message: 'Du benötigst die Berechtigung **Server verwalten**, um `/autorole` zu verwenden.' });
        }

    const { options, guild, client } = interaction;
        const subcommand = options.getSubcommand();

        if (subcommand === 'add') {
            const role = options.getRole('role');

            const guildConfig = await getGuildConfig(client, guild.id);
            const verificationEnabled = Boolean(guildConfig.verification?.enabled);
            const autoVerifyEnabled = Boolean(guildConfig.verification?.autoVerify?.enabled);

            if (verificationEnabled || autoVerifyEnabled) {
                return await replyUserError(interaction, { type: ErrorTypes.UNKNOWN, message: 'Du kannst AutoRole nicht hinzufügen, solange das Verifizierungssystem oder AutoVerify aktiviert ist. Deaktiviere diese zuerst.' });
            }
            
            if (role.position >= guild.members.me.roles.highest.position) {
                logger.warn(`[Autorole] Benutzer ${interaction.user.tag} hat versucht, Rolle ${role.name} (${role.id}) hinzuzufügen, die höher als die höchste Rolle des Bots in ${guild.name} ist`);
                return await replyUserError(interaction, { type: ErrorTypes.UNKNOWN, message: 'Ich kann keine Rollen zuweisen, die höher als meine höchste Rolle sind.' });
            }

            try {
                const config = await getWelcomeConfig(client, guild.id);
                const existingRoles = config.roleIds || [];
                const currentRoleId = existingRoles[0] || null;

                if (currentRoleId === role.id) {
                    logger.info(`[Autorole] Benutzer ${interaction.user.tag} hat versucht, doppelte Rolle ${role.name} (${role.id}) in ${guild.name} hinzuzufügen`);
                    return await replyUserError(interaction, { type: ErrorTypes.UNKNOWN, message: `Die Rolle ${role} ist bereits für die automatische Zuweisung festgelegt.` });
                }

                await updateWelcomeConfig(client, guild.id, {
                    roleIds: [role.id]
                });

                logger.info(`[Autorole] Einzelne Auto-Rolle auf ${role.name} (${role.id}) in ${guild.name} gesetzt von ${interaction.user.tag}`);
                await InteractionHelper.safeEditReply(interaction, {
                    embeds: [createAutoroleInfoEmbed(
                        currentRoleId
                            ? `✅ Auto-Rolle wurde auf ${role} aktualisiert. Es ist nur eine Auto-Rolle erlaubt.`
                            : `✅ Auto-Rolle wurde auf ${role} gesetzt.`
                    )],
                    flags: MessageFlags.Ephemeral
                });
            } catch (error) {
                logger.error(`[Autorole] Fehler beim Hinzufügen einer Rolle für Guild ${guild.id}:`, error);
                await replyUserError(interaction, { type: ErrorTypes.UNKNOWN, message: 'Beim Hinzufügen der Rolle ist ein Fehler aufgetreten. Bitte versuche es erneut.' });
            }
        } 
        
        else if (subcommand === 'remove') {
            const role = options.getRole('role');

            try {
                const config = await getWelcomeConfig(client, guild.id);
                const existingRoles = config.roleIds || [];
                
                if (!existingRoles.includes(role.id)) {
                    logger.info(`[Autorole] Benutzer ${interaction.user.tag} hat versucht, nicht vorhandene Rolle ${role.name} (${role.id}) in ${guild.name} zu entfernen`);
                    return await replyUserError(interaction, { type: ErrorTypes.USER_INPUT, message: `Die Rolle ${role} ist nicht für die automatische Zuweisung festgelegt.` });
                }

                const updatedRoles = existingRoles.filter(id => id !== role.id);
                
                await updateWelcomeConfig(client, guild.id, {
                    roleIds: updatedRoles
                });

                logger.info(`[Autorole] Rolle ${role.name} (${role.id}) aus Auto-Zuweisung in ${guild.name} von ${interaction.user.tag} entfernt`);
                await InteractionHelper.safeEditReply(interaction, {
                    embeds: [createAutoroleInfoEmbed(`✅ ${role} wurde aus den automatisch zugewiesenen Rollen entfernt.`)],
                    flags: MessageFlags.Ephemeral
                });
            } catch (error) {
                logger.error(`[Autorole] Fehler beim Entfernen einer Rolle für Guild ${guild.id}:`, error);
                await replyUserError(interaction, { type: ErrorTypes.UNKNOWN, message: 'Beim Entfernen der Rolle ist ein Fehler aufgetreten. Bitte versuche es erneut.' });
            }
        }
        
        else if (subcommand === 'list') {
            try {
                const guildConfig = await getGuildConfig(client, guild.id);
                const verificationEnabled = Boolean(guildConfig.verification?.enabled);
                const autoVerifyEnabled = Boolean(guildConfig.verification?.autoVerify?.enabled);
                const conflictSummary = [
                    verificationEnabled ? 'Verifizierungssystem ist aktiviert' : null,
                    autoVerifyEnabled ? 'AutoVerify ist aktiviert' : null
                ].filter(Boolean).join('\n');

                const config = await getWelcomeConfig(client, guild.id);
                const autoRoles = Array.isArray(config.roleIds) ? config.roleIds : [];

                const singleRoleIds = autoRoles.length > 1 ? [autoRoles[0]] : autoRoles;
                if (singleRoleIds.length !== autoRoles.length) {
                    await updateWelcomeConfig(client, guild.id, {
                        roleIds: singleRoleIds
                    });
                    logger.info(`[Autorole] Auto-Rollen-Liste in ${interaction.guild.name} auf eine Rolle gekürzt`);
                }

                if (singleRoleIds.length === 0) {
                    return InteractionHelper.safeEditReply(interaction, {
                        embeds: [createAutoroleInfoEmbed(`ℹ️ Es ist keine Rolle für die automatische Zuweisung festgelegt.${conflictSummary ?`\n\n⚠️ Einrichtungsblocker:\n${conflictSummary}`: ''}`)],
                        flags: MessageFlags.Ephemeral
                    });
                }

                const roles = await guild.roles.fetch();
                const validRoles = [];
                const invalidRoleIds = [];
                
                for (const roleId of singleRoleIds) {
                    const role = roles.get(roleId);
                    if (role) {
                        validRoles.push(role);
                    } else {
                        invalidRoleIds.push(roleId);
                    }
                }

                if (invalidRoleIds.length > 0) {
                    logger.info(`[Autorole] ${invalidRoleIds.length} ungültige Rolle(n) aus Guild ${interaction.guild.name} werden bereinigt`);
                    const updatedRoles = singleRoleIds.filter(id => !invalidRoleIds.includes(id));
                    await updateWelcomeConfig(client, guild.id, {
                        roleIds: updatedRoles
                    });
                }

                if (validRoles.length === 0) {
                    return InteractionHelper.safeEditReply(interaction, {
                        embeds: [createAutoroleInfoEmbed(`ℹ️ Keine gültige Auto-Rolle gefunden. Ungültige Rollen wurden entfernt.${conflictSummary ?`\n\n⚠️ Einrichtungsblocker:\n${conflictSummary}`: ''}`)],
                        flags: MessageFlags.Ephemeral
                    });
                }

                const embed = new EmbedBuilder()
                    .setColor(getColor('info'))
                    .setTitle('Automatisch zugewiesene Rolle')
                    .setDescription(`${validRoles[0]}${conflictSummary ?`\n\n⚠️ Einrichtungsblocker:\n${conflictSummary}`: ''}`)
                    .setFooter({ text: 'Es kann nur eine Auto-Rolle konfiguriert werden.' });

                await InteractionHelper.safeEditReply(interaction, {
                    embeds: [embed],
                    flags: MessageFlags.Ephemeral
                });

            } catch (error) {
                logger.error(`[Autorole] Fehler beim Auflisten von Rollen für Guild ${guild.id}:`, error);
                await replyUserError(interaction, { type: ErrorTypes.UNKNOWN, message: 'Beim Auflisten der automatisch zugewiesenen Rollen ist ein Fehler aufgetreten. Bitte versuche es erneut.' });
            }
        }
    },
};
