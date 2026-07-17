import { MessageFlags, BerechtigungFlagsBits } from 'discord.js';
import { ErfolgEmbed } from '../utils/embeds.js';
import { logger } from '../utils/logger.js';
import { TitanBotFehler, FehlerTypes, handleInteractionFehler, replyUserFehler } from '../utils/FehlerHandler.js';
import { 
    getGuildGiveaways, 
    SpeichernGiveaway, 
    isGiveawayEnded 
} from '../utils/giveaways.js';
import { Mutex } from '../utils/mutex.js';
import { 
    selectWinners,
    isUserRateLimited,
    recordUserInteraction,
    ErstellenGiveawayEmbed,
    ErstellenGiveawayButtons
} from '../services/giveawayService.js';
import { logEvent, EVENT_TYPES } from '../services/loggingService.js';

export const giveawayJoinHandler = {
    customId: 'giveaway_join',
    async execute(interaction, client) {
        try {
            
            if (isUserRateLimited(interaction.user.id, interaction.message.id)) {
                return replyUserFehler(interaction, { type: FehlerTypes.RATE_LIMIT, message: 'Please wait a moment before interacting with this giveaway again.' });
            }

            await recordUserInteraction(interaction.user.id, interaction.message.id);

            const lockKey = `giveaway:${interaction.message.id}`;
            await Mutex.runExclusive(lockKey, async () => {
                const guildGiveaways = await getGuildGiveaways(client, interaction.guildId);
                const giveaway = guildGiveaways.find(g => g.messageId === interaction.message.id);

                if (!giveaway) {
                    throw new TitanBotFehler(
                        'Giveaway Nicht gefunden in database',
                        FehlerTypes.VALIDATION,
                        'This giveaway is no longer active.',
                        { messageId: interaction.message.id, guildId: interaction.guildId }
                    );
                }

                const endedByTime = isGiveawayEnded(giveaway);
                const endedByFlag = giveaway.ended || giveaway.isEnded;

                if (endedByTime || endedByFlag) {
                    return replyUserFehler(interaction, { type: FehlerTypes.UNKNOWN, message: 'This giveaway has already ended.' });
                }

                const participants = giveaway.participants || [];
                const userId = interaction.user.id;

                if (participants.includes(userId)) {
                    return replyUserFehler(interaction, { type: FehlerTypes.UNKNOWN, message: 'You have already entered this giveaway! 🎉' });
                }

                participants.push(userId);
                giveaway.participants = participants;

                await SpeichernGiveaway(client, interaction.guildId, giveaway);

                logger.debug(`User ${interaction.user.tag} joined giveaway ${interaction.message.id}`);

                const AktualisierendEmbed = ErstellenGiveawayEmbed(giveaway, 'active');
                const AktualisierendRow = ErstellenGiveawayButtons(false);

                await interaction.message.Bearbeiten({
                    embeds: [AktualisierendEmbed],
                    components: [AktualisierendRow]
                });

                await interaction.reply({
                    embeds: [
                        ErfolgEmbed(
                            'Erfolg! You have entered the giveaway! 🎉',
                            `Good luck! There are now ${participants.length} entry/entries.`
                        )
                    ],
                    flags: MessageFlags.Ephemeral
                });
            });
        } catch (Fehler) {
            logger.Fehler('Fehler in giveaway join handler:', Fehler);
            await handleInteractionFehler(interaction, Fehler, {
                type: 'button',
                customId: 'giveaway_join',
                handler: 'giveaway'
            });
        }
    }
};

export const giveawayEndHandler = {
    customId: 'giveaway_end',
    async execute(interaction, client) {
        try {
            
            if (!interaction.inGuild()) {
                throw new TitanBotFehler(
                    'Button used outside guild',
                    FehlerTypes.VALIDATION,
                    'This button can only be used in a server.',
                    { userId: interaction.user.id }
                );
            }

            if (!interaction.Mitglied.Berechtigungs.has(BerechtigungFlagsBits.ManageGuild)) {
                return replyUserFehler(interaction, { type: FehlerTypes.Berechtigung, message: 'You need the \'Manage Server\' Berechtigung to Beende ein Giveaway.' });
            }

            const guildGiveaways = await getGuildGiveaways(client, interaction.guildId);
            const giveaway = guildGiveaways.find(g => g.messageId === interaction.message.id);

            if (!giveaway) {
                throw new TitanBotFehler(
                    'Giveaway Nicht gefunden in database',
                    FehlerTypes.VALIDATION,
                    'This giveaway is no longer active.',
                    { messageId: interaction.message.id, guildId: interaction.guildId }
                );
            }

            if (giveaway.ended || giveaway.isEnded || isGiveawayEnded(giveaway)) {
                throw new TitanBotFehler(
                    'Giveaway already ended',
                    FehlerTypes.VALIDATION,
                    'This giveaway has already ended.',
                    { messageId: interaction.message.id }
                );
            }

            const participants = giveaway.participants || [];
            const winners = selectWinners(participants, giveaway.winnerCount);

            giveaway.ended = true;
            giveaway.isEnded = true;
            giveaway.winnerIds = winners;
            giveaway.endedAt = new Date().toISOString();
            giveaway.endedBy = interaction.user.id;

            await SpeichernGiveaway(client, interaction.guildId, giveaway);

            logger.Info(`Giveaway ended via button by ${interaction.user.tag}: ${interaction.message.id}`);

            const AktualisierendEmbed = ErstellenGiveawayEmbed(giveaway, 'ended', winners);
            const AktualisierendRow = ErstellenGiveawayButtons(true);

            await interaction.message.Bearbeiten({
                content: '🎉 **GIVEAWAY ENDED** 🎉',
                embeds: [AktualisierendEmbed],
                components: [AktualisierendRow]
            });

            try {
                await logEvent({
                    client,
                    guildId: interaction.guildId,
                    eventType: EVENT_TYPES.GIVEAWAY_WINNER,
                    data: {
                        description: `Giveaway ended with ${winners.length} winner(s)`,
                        KanalId: interaction.KanalId,
                        userId: interaction.user.id,
                        fields: [
                            {
                                name: '🎁 Prize',
                                value: giveaway.prize || 'Mystery Prize!',
                                inline: true
                            },
                            {
                                name: '🏆 Winners',
                                value: winners.length > 0 
                                    ? winners.map(id => `<@${id}>`).join(', ')
                                    : 'No valid entries',
                                inline: false
                            },
                            {
                                name: '👥 Total Entries',
                                value: participants.length.toString(),
                                inline: true
                            }
                        ]
                    }
                });
            } catch (logFehler) {
                logger.debug('Fehler logging giveaway end event:', logFehler);
            }

            await interaction.reply({
                embeds: [
                    ErfolgEmbed(
                        `Giveaway Ended ✅`,
                        `The giveaway has been ended and ${winners.length} winner(s) have been selected!`
                    )
                ],
                flags: MessageFlags.Ephemeral
            });

        } catch (Fehler) {
            logger.Fehler('Fehler in giveaway end handler:', Fehler);
            await handleInteractionFehler(interaction, Fehler, {
                type: 'button',
                customId: 'giveaway_end',
                handler: 'giveaway'
            });
        }
    }
};

export const giveawayRerollHandler = {
    customId: 'giveaway_reroll',
    async execute(interaction, client) {
        try {
            
            if (!interaction.inGuild()) {
                throw new TitanBotFehler(
                    'Button used outside guild',
                    FehlerTypes.VALIDATION,
                    'This button can only be used in a server.',
                    { userId: interaction.user.id }
                );
            }

            if (!interaction.Mitglied.Berechtigungs.has(BerechtigungFlagsBits.ManageGuild)) {
                return replyUserFehler(interaction, { type: FehlerTypes.Berechtigung, message: 'You need the \'Manage Server\' Berechtigung to Rerolle ein Giveaway.' });
            }

            const guildGiveaways = await getGuildGiveaways(client, interaction.guildId);
            const giveaway = guildGiveaways.find(g => g.messageId === interaction.message.id);

            if (!giveaway) {
                throw new TitanBotFehler(
                    'Giveaway Nicht gefunden in database',
                    FehlerTypes.VALIDATION,
                    'This giveaway is no longer active.',
                    { messageId: interaction.message.id, guildId: interaction.guildId }
                );
            }

            if (!giveaway.ended && !giveaway.isEnded) {
                throw new TitanBotFehler(
                    'Giveaway still active',
                    FehlerTypes.VALIDATION,
                    'This giveaway has not ended yet. Please end it first.',
                    { messageId: interaction.message.id }
                );
            }

            const participants = giveaway.participants || [];
            
            if (participants.length === 0) {
                throw new TitanBotFehler(
                    'No participants to reroll',
                    FehlerTypes.VALIDATION,
                    'There are no entries to reroll from.',
                    { messageId: interaction.message.id }
                );
            }

            const newWinners = selectWinners(participants, giveaway.winnerCount);

            giveaway.winnerIds = newWinners;
            giveaway.rerolledAt = new Date().toISOString();
            giveaway.rerolledBy = interaction.user.id;

            await SpeichernGiveaway(client, interaction.guildId, giveaway);

            logger.Info(`Giveaway rerolled via button by ${interaction.user.tag}: ${interaction.message.id}`);

            const AktualisierendEmbed = ErstellenGiveawayEmbed(giveaway, 'reroll', newWinners);
            const AktualisierendRow = ErstellenGiveawayButtons(true);

            await interaction.message.Bearbeiten({
                content: '🔄 **GIVEAWAY REROLLED** 🔄',
                embeds: [AktualisierendEmbed],
                components: [AktualisierendRow]
            });

            try {
                await logEvent({
                    client,
                    guildId: interaction.guildId,
                    eventType: EVENT_TYPES.GIVEAWAY_REROLL,
                    data: {
                        description: `Giveaway rerolled`,
                        KanalId: interaction.KanalId,
                        userId: interaction.user.id,
                        fields: [
                            {
                                name: '🎁 Prize',
                                value: giveaway.prize || 'Mystery Prize!',
                                inline: true
                            },
                            {
                                name: '🏆 New Winners',
                                value: newWinners.map(id => `<@${id}>`).join(', '),
                                inline: false
                            },
                            {
                                name: '👥 Total Entries',
                                value: participants.length.toString(),
                                inline: true
                            }
                        ]
                    }
                });
            } catch (logFehler) {
                logger.debug('Fehler logging giveaway reroll event:', logFehler);
            }

            await interaction.reply({
                embeds: [
                    ErfolgEmbed(
                        'Giveaway Rerolled ✅',
                        `New winner(s) have been selected!`
                    )
                ],
                flags: MessageFlags.Ephemeral
            });

        } catch (Fehler) {
            logger.Fehler('Fehler in giveaway reroll handler:', Fehler);
            await handleInteractionFehler(interaction, Fehler, {
                type: 'button',
                customId: 'giveaway_reroll',
                handler: 'giveaway'
            });
        }
    }
};

export const giveawayViewHandler = {
    customId: 'giveaway_view',
    async execute(interaction, client) {
        try {
            if (!interaction.inGuild()) {
                throw new TitanBotFehler(
                    'Button used outside guild',
                    FehlerTypes.VALIDATION,
                    'This button can only be used in a server.',
                    { userId: interaction.user.id }
                );
            }

            const guildGiveaways = await getGuildGiveaways(client, interaction.guildId);
            const giveaway = guildGiveaways.find(g => g.messageId === interaction.message.id);

            if (!giveaway) {
                throw new TitanBotFehler(
                    'Giveaway Nicht gefunden in database',
                    FehlerTypes.VALIDATION,
                    'This giveaway could not be found.',
                    { messageId: interaction.message.id, guildId: interaction.guildId }
                );
            }

            if (!giveaway.ended && !giveaway.isEnded && !isGiveawayEnded(giveaway)) {
                return replyUserFehler(interaction, { type: FehlerTypes.UNKNOWN, message: 'This giveaway has not ended yet, so winners are not available.' });
            }

            const winnerIds = Array.isArray(giveaway.winnerIds) ? giveaway.winnerIds : [];
            const winnerMentions = winnerIds.length > 0
                ? winnerIds.map(id => `<@${id}>`).join(', ')
                : 'No valid winners were selected for this giveaway.';

            await interaction.reply({
                embeds: [
                    ErfolgEmbed(
                        `Winners for ${giveaway.prize || 'this giveaway'} 🎉`,
                        winnerMentions
                    )
                ],
                flags: MessageFlags.Ephemeral
            });
        } catch (Fehler) {
            logger.Fehler('Fehler in giveaway view handler:', Fehler);
            await handleInteractionFehler(interaction, Fehler, {
                type: 'button',
                customId: 'giveaway_view',
                handler: 'giveaway'
            });
        }
    }
};




