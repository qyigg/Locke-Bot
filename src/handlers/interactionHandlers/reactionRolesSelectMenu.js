import { EmbedBuilder, MessageFlags } from 'discord.js';
import { InteractionHelper } from '../../utils/interactionHelper.js';
import { logger } from '../../utils/logger.js';
import { handleInteractionError, createError, ErrorTypes } from '../../utils/errorHandler.js';
import { getColor } from '../../config/bot.js';
import { logEvent, EVENT_TYPES } from '../../services/loggingService.js';
import { getReactionRoleMessage } from '../../services/reactionRoleService.js';

export async function handleReactionRolesSelectMenu(interaction, client) {
    try {
        const deferSuccess = await InteractionHelper.safeDefer(interaction, { flags: MessageFlags.Ephemeral });
        if (!deferSuccess) return;

        if (!interaction.inGuild() || !interaction.guild || !interaction.member) {
            throw createError(
                'Reaction role interaction used outside a guild context',
                ErrorTypes.VALIDATION,
                'Dieses Rollen-Menü kann nur auf einem Server genutzt werden.',
                { userId: interaction.user.id }
            );
        }

        logger.debug(`Reaction role select menu interaction by ${interaction.user.tag} on message ${interaction.message.id}`);

        const reactionRoleData = await getReactionRoleMessage(client, interaction.guildId, interaction.message.id);

        if (!reactionRoleData) {
            logger.warn(`Reaction role data not found for message ${interaction.message.id} in guild ${interaction.guildId}`);
            return interaction.editReply({
                embeds: [
                    new EmbedBuilder()
                        .setDescription('❌ Diese Rollen-Nachricht ist nicht mehr aktiv.')
                        .setColor(getColor('error'))
                ]
            });
        }

        const member = await interaction.guild.members.fetch(interaction.user.id).catch(() => null);
        if (!member) {
            throw createError(
                'Guild member could not be fetched for reaction role update',
                ErrorTypes.USER_INPUT,
                'Dein Mitgliedsprofil konnte nicht geladen werden. Bitte versuche es erneut.',
                { guildId: interaction.guildId, userId: interaction.user.id }
            );
        }
        const selectedRoleIds = interaction.values;

        const me = interaction.guild.members.me ?? await interaction.guild.members.fetchMe().catch(() => null);

        if (!me) {
            throw createError(
                'Unable to fetch bot member for permission validation',
                ErrorTypes.PERMISSION,
                'Ich konnte meine Server-Berechtigungen nicht prüfen. Bitte versuche es erneut.',
                { guildId: interaction.guildId }
            );
        }

        if (!me.permissions.has('ManageRoles')) {
            throw createError(
                'Bot missing ManageRoles permission',
                ErrorTypes.PERMISSION,
                'Ich habe keine Berechtigung, Rollen auf diesem Server zu verwalten.',
                { guildId: interaction.guildId }
            );
        }

        const botRolePosition = me.roles.highest.position;

        const availableRoleIds = Array.isArray(reactionRoleData.roles)
            ? reactionRoleData.roles
            : (typeof reactionRoleData.roles === 'object' ? Object.values(reactionRoleData.roles) : []);

        const addedRoles = [];
        const removedRoles = [];
        const skippedRoles = [];
        const selectedSet = new Set(selectedRoleIds);

        for (const roleId of availableRoleIds) {
            const role = interaction.guild.roles.cache.get(roleId);
            if (!role) {
                logger.warn(`Role ${roleId} not found in guild ${interaction.guildId}`);
                skippedRoles.push(roleId);
                continue;
            }

            const roleHasDangerousPermissions = role.permissions.has([
                'Administrator',
                'ManageGuild',
                'ManageRoles',
                'ManageChannels',
                'ManageWebhooks',
                'BanMembers',
                'KickMembers',
                'MentionEveryone'
            ]);

            if (role.managed || roleHasDangerousPermissions) {
                logger.warn(`Blocked self-assignment for protected role ${role.name} (${roleId})`);
                skippedRoles.push(role.name);
                continue;
            }

            if (role.position >= botRolePosition) {
                logger.warn(`Cannot manage role ${role.name} (${roleId}), hierarchy issue`);
                skippedRoles.push(role.name);
                continue;
            }

            const shouldHaveRole = selectedSet.has(roleId);
            const hasRole = member.roles.cache.has(roleId);

            if (shouldHaveRole && !hasRole) {
                try {
                    await member.roles.add(role);
                    addedRoles.push(role.name);
                    logger.debug(`Added role ${role.name} to ${member.user.tag}`);
                } catch (roleError) {
                    logger.error(`Failed to add role ${role.name} to ${member.user.tag}:`, roleError);
                    skippedRoles.push(role.name);
                }
            } else if (!shouldHaveRole && hasRole) {
                try {
                    await member.roles.remove(role);
                    removedRoles.push(role.name);
                    logger.debug(`Removed role ${role.name} from ${member.user.tag}`);
                } catch (roleError) {
                    logger.error(`Failed to remove role ${role.name} from ${member.user.tag}:`, roleError);
                    skippedRoles.push(role.name);
                }
            }
        }

        let description = '🎭 **Rollen erfolgreich aktualisiert!**\n\n';

        if (addedRoles.length > 0) {
            description += `✅ **Hinzugefügt:** ${addedRoles.map(name => `**${name}**`).join(', ')}\n`;
        }

        if (removedRoles.length > 0) {
            description += `❌ **Entfernt:** ${removedRoles.map(name => `**${name}**`).join(', ')}\n`;
        }

        if (addedRoles.length === 0 && removedRoles.length === 0) {
            description += 'An deinen Rollen wurden keine Änderungen vorgenommen.';
        }

        if (skippedRoles.length > 0) {
            description += `\n⚠️ **Übersprungen:** ${skippedRoles.length} Rolle${skippedRoles.length !== 1 ? 'n' : ''} (Berechtigungsprobleme)`;
        }

        const responseEmbed = new EmbedBuilder()
            .setDescription(description)
            .setColor(getColor('success'))
            .setTimestamp();

        await interaction.editReply({ embeds: [responseEmbed] });

        if (addedRoles.length > 0 || removedRoles.length > 0) {
            try {
                await logEvent({
                    client,
                    guildId: interaction.guildId,
                    eventType: EVENT_TYPES.REACTION_ROLE_UPDATE,
                    data: {
                        description: `Rollen-Auswahl aktualisiert für ${member.user.tag}`,
                        userId: member.user.id,
                        channelId: interaction.channelId,
                        fields: [
                            {
                                name: '👤 Member',
                                value: `${member.user.tag} (${member.user.id})`,
                                inline: false
                            },
                            ...(addedRoles.length > 0 ? [{
                                name: '✅ Rollen hinzugefügt',
                                value: addedRoles.join(', '),
                                inline: false
                            }] : []),
                            ...(removedRoles.length > 0 ? [{
                                name: '❌ Rollen entfernt',
                                value: removedRoles.join(', '),
                                inline: false
                            }] : [])
                        ]
                    }
                });
            } catch (logError) {
                logger.warn('Failed to log reaction role update:', logError);
            }
        }

        logger.info(`Reaction roles updated for ${member.user.tag}: +${addedRoles.length}, -${removedRoles.length}`);

    } catch (error) {
        await handleInteractionError(interaction, error, {
            type: 'select_menu',
            customId: 'reaction_roles'
        });
    }
}