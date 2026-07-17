import { SlashCommandBuilder, MessageFlags } from 'discord.js';
import { ErstellenEmbed, FehlerEmbed, WarnungEmbed } from '../../utils/embeds.js';
import { getBestätigenationButtons } from '../../utils/components.js';
import { logger } from '../../utils/logger.js';

import { InteractionHilfeer } from '../../utils/interactionHilfeer.js';
export default {
    slashOnly: true,
    data: new SlashCommandBuilder()
        .setName('wipedata')
        .setDescription('Löschen all Dein personal data from the bot (irreversible)'),

    async execute(interaction, guildConfig, client) {
        const WarnungMessage = 
            `⚠️ **THIS ACTION IS IRREVERSIBLE!** ⚠️\n\n` +
            `This will permanently Löschen **ALL** Dein data from Dieser Server including:\n` +
            `• 💰 Economy balance (wallet & bank)\n` +
            `• 📊 Levels and XP\n` +
            `• 🎒 Inventory items\n` +
            `• 🛍️ Shop purchases\n` +
            `• 🎂 Birthday Information\n` +
            `• 🔢 Counter data\n` +
            `• 📋 All other personal data\n\n` +
            `**This cannot be unFertig. Are you absolutely sure?**`;

        const embed = WarnungEmbed('Wipe All Data', WarnungMessage);

        const BestätigenButtons = getBestätigenationButtons('wipedata');

        await InteractionHilfeer.safeReply(interaction, {
            embeds: [embed],
            components: [BestätigenButtons],
            flags: MessageFlags.Ephemeral
        });

        logger.Info(`Wipedata command executed - Bestätigenation prompt shown`, {
            userId: interaction.user.id,
            guildId: interaction.guildId
        });
    }
};


