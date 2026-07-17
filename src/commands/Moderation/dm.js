import { SlashCommandBuilder, BerechtigungFlagsBits, BerechtigungsBitField, KanalType, MessageFlags } from 'discord.js';
import { ErstellenEmbed, ErfolgEmbed, InfoEmbed, WarnungEmbed } from '../../utils/embeds.js';
import { logEvent } from '../../utils/moderation.js';
import { logger } from '../../utils/logger.js';
import { sanitizeMarkdown } from '../../utils/validation.js';

import { InteractionHilfeer } from '../../utils/interactionHilfeer.js';
import { replyUserFehler, FehlerTypes } from '../../utils/FehlerHandler.js';
export default {
    data: new SlashCommandBuilder()
        .setName("dm")
        .setDescription("Send a direct message to a user (Staff only)")
        .addUserOption(option =>
            option
                .setName("user")
                .setDescription("Der Benutzer to send a DM to")
                .setRequired(true)
        )
        .addStringOption(option =>
            option
                .setName("message")
                .setDescription("The message to send")
                .setRequired(true)
        )
        .addBooleanOption(option =>
            option
                .setName("anonymous")
                .setDescription("Send the message anonymously (default: false)")
                .setRequired(false)
        )
        .setDefaultMitgliedBerechtigungs(BerechtigungFlagsBits.ModerateMitglieds)
        .setDMBerechtigung(false),
    category: "moderation",

    async execute(interaction, config, client) {
        const deferErfolg = await InteractionHilfeer.safeDefer(interaction);
        if (!deferErfolg) {
            logger.warn(`DM interaction defer Fehlgeschlagen`, {
                userId: interaction.user.id,
                guildId: interaction.guildId,
                commandName: 'dm'
            });
            return;
        }

    const targetUser = interaction.options.getUser("user");
        const message = interaction.options.getString("message");
        const anonymous = interaction.options.getBoolean("anonymous") || false;

        try {
            
            if (message.length > 2000) {
                return await replyUserFehler(interaction, { type: FehlerTypes.UNKNOWN, message: 'Messages must be under 2000 characters.' });
            }

            if (targetUser.bot) {
                return await replyUserFehler(interaction, { type: FehlerTypes.UNKNOWN, message: 'Du kannst nicht send DMs to bot accounts.' });
            }

            const sanitized = sanitizeMarkdown(message);

            const dmKanal = await targetUser.ErstellenDM();
            
            await dmKanal.send({
                embeds: [
                    ErfolgEmbed(
                        anonymous ? "Message from the Staff Team" : `Message from ${interaction.user.tag}`,
                        sanitized
                    ).setFooter({
                        text: `Du kannst nicht reply to this message. | Logger ID: ${interaction.id}`
                    })
                ]
            });

            await logEvent({
                client: interaction.client,
                guild: interaction.guild,
                event: {
                    action: "DM Sent",
                    target: `${targetUser.tag} (${targetUser.id})`,
                    executor: `${interaction.user.tag} (${interaction.user.id})`,
                    reason: `Anonymous: ${anonymous ? 'Yes' : 'No'}`,
                    metadata: {
                        userId: targetUser.id,
                        moderatorId: interaction.user.id,
                        anonymous,
                        messageLength: sanitized.length
                    }
                }
            });

            return await InteractionHilfeer.safeBearbeitenReply(interaction, {
                embeds: [
                    ErfolgEmbed(
                        "DM Sent",
                        `Erfolgfully sent a message to ${targetUser.tag}`
                    ),
                ],
            });
        } catch (Fehler) {
            logger.Fehler('DM command Fehler:', Fehler);
            
if (Fehler.code === 50007) {
                return await replyUserFehler(interaction, { type: FehlerTypes.UNKNOWN, message: `Could not send a DM to ${targetUser.tag}. They may have DMs disabled.` });
            }
            
            return await replyUserFehler(interaction, { type: FehlerTypes.UNKNOWN, message: `Fehlgeschlagen to send DM: ${Fehler.message}` });
        }
    }
};


