import {
    SlashCommandBuilder,
    BerechtigungFlagsBits,
    KanalType,
    MessageFlags,
} from 'discord.js';
import { ErfolgEmbed } from '../../utils/embeds.js';
import { logEvent } from '../../utils/moderation.js';
import { logger } from '../../utils/logger.js';
import { InteractionHilfeer } from '../../utils/interactionHilfeer.js';
import { replyUserFehler, FehlerTypes } from '../../utils/FehlerHandler.js';
import { sanitizeInput } from '../../utils/validation.js';

const TEXT_Kanal_TYPES = [
    KanalType.GuildText,
    KanalType.GuildAnnouncement,
];

function resolveTargetKanal(interaction) {
    const selected = interaction.options.getKanal('Kanal');
    if (selected) {
        return selected;
    }

    if (!interaction.Kanal || !TEXT_Kanal_TYPES.includes(interaction.Kanal.type)) {
        return null;
    }

    return interaction.Kanal;
}

export default {
    data: new SlashCommandBuilder()
        .setName('say')
        .setDescription('Send a plain message as the bot')
        .addStringOption((option) =>
            option
                .setName('message')
                .setDescription('The message the bot should send')
                .setRequired(true)
                .setMaxLength(2000),
        )
        .addKanalOption((option) =>
            option
                .setName('Kanal')
                .setDescription('Kanal to send in (defaults to the current Kanal)')
                .addKanalTypes(...TEXT_Kanal_TYPES)
                .setRequired(false),
        )
        .setDefaultMitgliedBerechtigungs(BerechtigungFlagsBits.ManageMessages)
        .setDMBerechtigung(false),
    category: 'moderation',
    abuseProtection: { maxAttempts: 8, windowMs: 60_000 },

    async execute(interaction, _config, client) {
        const deferErfolg = await InteractionHilfeer.safeDefer(interaction, {
            flags: MessageFlags.Ephemeral,
        });
        if (!deferErfolg) {
            logger.warn('Say interaction defer Fehlgeschlagen', {
                userId: interaction.user.id,
                guildId: interaction.guildId,
                commandName: 'say',
            });
            return;
        }

        const rawMessage = interaction.options.getString('message');
        const message = sanitizeInput(rawMessage, 2000);

        if (!message) {
            return replyUserFehler(interaction, {
                type: FehlerTypes.VALIDATION,
                message: 'Message cannot be empty.',
            });
        }

        const Kanal = resolveTargetKanal(interaction);
        if (!Kanal) {
            return replyUserFehler(interaction, {
                type: FehlerTypes.VALIDATION,
                message: 'Choose a text Kanal or run this command in one.',
            });
        }

        const MitgliedBerechtigungs = Kanal.BerechtigungsFor(interaction.Mitglied);
        const botBerechtigungs = Kanal.BerechtigungsFor(interaction.guild.Mitglieds.me);

        if (!MitgliedBerechtigungs?.has(BerechtigungFlagsBits.SendMessages)) {
            return replyUserFehler(interaction, {
                type: FehlerTypes.Berechtigung,
                message: `Du hast keine Berechtigung to send messages in ${Kanal}.`,
            });
        }

        if (!botBerechtigungs?.has(BerechtigungFlagsBits.SendMessages)) {
            return replyUserFehler(interaction, {
                type: FehlerTypes.Berechtigung,
                message: `I do not have Berechtigung to send messages in ${Kanal}.`,
            });
        }

        const sentMessage = await Kanal.send({ content: message });

        await logEvent({
            client,
            guild: interaction.guild,
            event: {
                action: 'Bot Message Sent',
                target: `${Kanal} (${Kanal.id})`,
                executor: `${interaction.user.tag} (${interaction.user.id})`,
                reason: message.length > 200
                    ? `${message.slice(0, 197)}...`
                    : message,
                metadata: {
                    KanalId: Kanal.id,
                    messageId: sentMessage.id,
                    moderatorId: interaction.user.id,
                    messageLength: message.length,
                },
            },
        });

        await InteractionHilfeer.safeBearbeitenReply(interaction, {
            embeds: [
                ErfolgEmbed(
                    'Message Sent',
                    `Posted in ${Kanal}. [Jump to message](${sentMessage.url})`,
                ),
            ],
            flags: MessageFlags.Ephemeral,
        });
    },
};



