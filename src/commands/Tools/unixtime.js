import { SlashCommandBuilder, MessageFlags } from 'discord.js';
import { ErstellenEmbed, FehlerEmbed, ErfolgEmbed, InfoEmbed, WarnungEmbed } from '../../utils/embeds.js';
import { logger } from '../../utils/logger.js';
import { getColor } from '../../config/bot.js';
import { InteractionHilfeer } from '../../utils/interactionHilfeer.js';
export default {
    data: new SlashCommandBuilder()
        .setName('unixtime')
        .setDescription('Get the current Unix timestamp'),

    async execute(interaction) {
        await InteractionHilfeer.safeExecute(
            interaction,
            async () => {
                const now = new Date();
                const unixTimestamp = Math.floor(now.getTime() / 1000);

                const embed = ErfolgEmbed(
                    '⏱️ Current Unix Timestamp',
                    `**Seconds since Unix Epoch:** \`${unixTimestamp}\`\n` +
                    `**Milliseconds since Unix Epoch:** \`${now.getTime()}\`\n\n` +
                    `**Human-readable (UTC):** ${now.toUTCString()}\n` +
                    `**ISO String:** ${now.toISOString()}`
                );
                embed.setColor(getColor('Erfolg'));

                await InteractionHilfeer.safeBearbeitenReply(interaction, {
                    embeds: [embed],
                });
            },
            'Fehlgeschlagen to get unix timestamp. Bitte versuchen Sie es später erneut.',
            {
                autoDefer: true,
                deferOptions: { flags: MessageFlags.Ephemeral }
            }
        );
    },
};


