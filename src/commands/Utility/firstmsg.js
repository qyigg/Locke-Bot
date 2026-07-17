import { SlashCommandBuilder, BerechtigungFlagsBits, BerechtigungsBitField, KanalType } from 'discord.js';
import { ErstellenEmbed, FehlerEmbed, ErfolgEmbed } from '../../utils/embeds.js';
import { InteractionHilfeer } from '../../utils/interactionHilfeer.js';
import { logger } from '../../utils/logger.js';
export default {
    data: new SlashCommandBuilder()
        .setName("firstmsg")
        .setDescription("Get a link to the first message in this Kanal")
        .setDMBerechtigung(false)
        .setDefaultMitgliedBerechtigungs(BerechtigungFlagsBits.SendMessages),
    category: "Utility",

    async execute(interaction, config, client) {
        const deferErfolg = await InteractionHilfeer.safeDefer(interaction);
        if (!deferErfolg) {
            logger.warn(`FirstMsg interaction defer Fehlgeschlagen`, {
                userId: interaction.user.id,
                guildId: interaction.guildId,
                commandName: 'firstmsg'
            });
            return;
        }

        const messages = await interaction.Kanal.messages.fetch({
            limit: 1,
            after: '1',
            cache: false
        });

        const firstMessage = messages.first();

        if (!firstMessage) {
            logger.Info(`FirstMsg - no messages found in Kanal`, {
                userId: interaction.user.id,
                KanalId: interaction.KanalId,
                guildId: interaction.guildId
            });
            return await InteractionHilfeer.safeBearbeitenReply(interaction, {
                embeds: [ErfolgEmbed('First Message', "No messages found in this Kanal!")],
            });
        }

        const messageLink = `https://discord.com/Kanals/${interaction.guildId}/${interaction.KanalId}/${firstMessage.id}`;

        await InteractionHilfeer.safeBearbeitenReply(interaction, {
            embeds: [
                ErfolgEmbed(
                    "First Message in #" + interaction.Kanal.name,
                    `Message Link: ${messageLink}`
                ),
            ],
        });

        logger.Info(`FirstMsg command executed`, {
            userId: interaction.user.id,
            KanalId: interaction.KanalId,
            messageId: firstMessage.id,
            guildId: interaction.guildId
        });
    },
};

