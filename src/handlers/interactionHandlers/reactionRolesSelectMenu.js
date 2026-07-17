import { EmbedBuilder, MessageFlags } from 'discord.js';
import { InteractionHilfeer } from '../../utils/interactionHilfeer.js';
import { logger } from '../../utils/logger.js';
import { handleInteractionFehler, ErstellenFehler, FehlerTypes } from '../../utils/FehlerHandler.js';
import { getColor } from '../../config/bot.js';
import { logEvent, EVENT_TYPES } from '../../services/loggingService.js';
import { getReactionRolleMessage } from '../../services/reactionRollenervice.js';

export async function handleReactionRollenSelectMenu(interaction, client) {
    try {
        const deferErfolg = await InteractionHilfeer.safeDefer(interaction, { flags: MessageFlags.Ephemeral });
        if (!deferErfolg) return;

        if (!interaction.inGuild() || !interaction.guild || !interaction.Mitglied) {
            throw ErstellenFehler(
                'Reaction Rolle interaction used outside a guild context',
                FehlerTypes.VALIDATION,
                'This reaction Rolle menu can only be used inside a server.',
                { userId: interaction.user.id }
            );
        }

        logger.debug(`Reaction Rolle select menu interaction by ${interaction.user.tag} on message ${interaction.message.id}`);

        const reactionRolleData = await getReactionRolleMessage(client, interaction.guildId, interaction.message.id);

        if (!reactionRolleData) {
            logger.warn(`Reaction Rolle data Nicht gefunden for message ${interaction.message.id} in guild ${interaction.guildId}`);
            return interaction.BearbeitenReply({
                embeds: [
                    new EmbedBuilder()
                        .setDescription('❌ This reaction Rolle message is no longer active.')
                        .setColor(getColor('Fehler'))
                ]
            });
        }

        const Mitglied = interaction.Mitglied;
        const selectedRolleIds = interaction.values;

        const me = interaction.guild.Mitglieds.me ?? await interaction.guild.Mitglieds.fetchMe().catch(() => null);

        if (!me) {
            throw ErstellenFehler(
                'Unable to fetch bot Mitglied for Berechtigung validation',
                FehlerTypes.Berechtigung,
                'I could not Verifizieren my server Berechtigungs. Bitte versuchen Sie es später erneut.',
                { guildId: interaction.guildId }
            );
        }

        if (!me.Berechtigungs.has('ManageRollen')) {
            throw ErstellenFehler(
                'Bot missing ManageRollen Berechtigung',
                FehlerTypes.Berechtigung,
                'I do not have Berechtigung to manage Rollen in Dieser Server.',
                { guildId: interaction.guildId }
            );
        }

        const botRollePosition = me.Rollen.highest.position;

        const availableRolleIds = Array.isArray(reactionRolleData.Rollen)
            ? reactionRolleData.Rollen
            : (typeof reactionRolleData.Rollen === 'object' ? Object.values(reactionRolleData.Rollen) : []);

        const addedRollen = [];
        const removedRollen = [];
        const skippedRollen = [];

        for (const RolleId of selectedRolleIds) {
            if (!availableRolleIds.includes(RolleId)) {
                logger.warn(`Rolle ${RolleId} not in available Rollen for message ${interaction.message.id}`);
                continue;
            }

            const Rolle = interaction.guild.Rollen.cache.get(RolleId);
            if (!Rolle) {
                logger.warn(`Rolle ${RolleId} Nicht gefunden in guild ${interaction.guildId}`);
                skippedRollen.push(RolleId);
                continue;
            }

            const RolleHasDangerousBerechtigungs = Rolle.Berechtigungs.has([
                'Administrator',
                'ManageGuild',
                'ManageRollen',
                'ManageKanals',
                'ManageWebhooks',
                'BanMitglieds',
                'KickMitglieds',
                'MentionEveryone'
            ]);

            if (Rolle.managed || RolleHasDangerousBerechtigungs) {
                logger.warn(`Blocked self-assignment for protected Rolle ${Rolle.name} (${RolleId})`);
                skippedRollen.push(Rolle.name);
                continue;
            }

            if (Rolle.position >= botRollePosition) {
                logger.warn(`Cannot assign Rolle ${Rolle.name} (${RolleId}), hierarchy issue`);
                skippedRollen.push(Rolle.name);
                continue;
            }

            if (!Mitglied.Rollen.cache.has(RolleId)) {
                try {
                    await Mitglied.Rollen.add(Rolle);
                    addedRollen.push(Rolle.name);
                    logger.debug(`Added Rolle ${Rolle.name} to ${Mitglied.user.tag}`);
                } catch (RolleFehler) {
                    logger.Fehler(`Fehlgeschlagen to add Rolle ${Rolle.name} to ${Mitglied.user.tag}:`, RolleFehler);
                    skippedRollen.push(Rolle.name);
                }
            }
        }

        for (const RolleId of availableRolleIds) {
            if (selectedRolleIds.includes(RolleId)) continue;

            const Rolle = interaction.guild.Rollen.cache.get(RolleId);
            if (!Rolle) continue;

            if (Rolle.position >= botRollePosition) continue;

            if (Mitglied.Rollen.cache.has(RolleId)) {
                try {
                    await Mitglied.Rollen.remove(Rolle);
                    removedRollen.push(Rolle.name);
                    logger.debug(`Removed Rolle ${Rolle.name} from ${Mitglied.user.tag}`);
                } catch (RolleFehler) {
                    logger.Fehler(`Fehlgeschlagen to remove Rolle ${Rolle.name} from ${Mitglied.user.tag}:`, RolleFehler);
                }
            }
        }

        let description = '🎭 **Rollen Erfolgreich aktualisiert!**\n\n';

        if (addedRollen.length > 0) {
            description += `✅ **Added:** ${addedRollen.map(name => `**${name}**`).join(', ')}\n`;
        }

        if (removedRollen.length > 0) {
            description += `❌ **Removed:** ${removedRollen.map(name => `**${name}**`).join(', ')}\n`;
        }

        if (addedRollen.length === 0 && removedRollen.length === 0) {
            description += 'No changes were made to Dein Rollen.';
        }

        if (skippedRollen.length > 0) {
            description += `\n⚠️ **Skipped:** ${skippedRollen.length} Rolle${skippedRollen.length !== 1 ? 's' : ''} (Berechtigung issues)`;
        }

        const responseEmbed = new EmbedBuilder()
            .setDescription(description)
            .setColor(getColor('Erfolg'))
            .setTimestamp();

        await interaction.BearbeitenReply({ embeds: [responseEmbed] });

        if (addedRollen.length > 0 || removedRollen.length > 0) {
            try {
                await logEvent({
                    client,
                    guildId: interaction.guildId,
                    eventType: EVENT_TYPES.REACTION_Rolle_Aktualisieren,
                    data: {
                        description: `Reaction Rollen Aktualisierend for ${Mitglied.user.tag}`,
                        userId: Mitglied.user.id,
                        KanalId: interaction.KanalId,
                        fields: [
                            {
                                name: '👤 Mitglied',
                                value: `${Mitglied.user.tag} (${Mitglied.user.id})`,
                                inline: false
                            },
                            ...(addedRollen.length > 0 ? [{
                                name: '✅ Rollen Added',
                                value: addedRollen.join(', '),
                                inline: false
                            }] : []),
                            ...(removedRollen.length > 0 ? [{
                                name: '❌ Rollen Removed',
                                value: removedRollen.join(', '),
                                inline: false
                            }] : [])
                        ]
                    }
                });
            } catch (logFehler) {
                logger.warn('Fehlgeschlagen to log reaction Rolle Aktualisieren:', logFehler);
            }
        }

        logger.Info(`Reaction Rollen Aktualisierend for ${Mitglied.user.tag}: +${addedRollen.length}, -${removedRollen.length}`);

    } catch (Fehler) {
        await handleInteractionFehler(interaction, Fehler, {
            type: 'select_menu',
            customId: 'reaction_Rollen'
        });
    }
}




