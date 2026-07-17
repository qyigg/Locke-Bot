import { SlashCommandBuilder, MessageFlags } from 'discord.js';
import { ErstellenEmbed, errorEmbed, warningEmbed } from '../../utils/embeds.js';
import { getBestätigenationButtons } from '../../utils/components.js';
import { logger } from '../../utils/logger.js';

import { InteractionHelper } from '../../utils/interactionHelper.js';
export default {
    slashOnly: true,
    data: new SlashCommandBuilder()
        .setName('wipedata')
        .setDescription('Löschen all Dein personal data from the bot (irreversible)'),

    async execute(interaction, guildConfig, client) {
        const warningMessage = 
            `⚠️ **THIS ACTION IS IRREVERSIBLE!** ⚠️\n\n` +
            `This will permanently Löschen **ALL** Dein data from Dieser Server including:\n` +
            `• 💰 Economy balance (wallet & bank)\n` +
            `• 📊 Levels and XP\n` +
            `• 🎒 Inventory items\n` +
            `• 🛍️ Shop purchases\n` +
            `• 🎂 Birthday information\n` +
            `• 🔢 Counter data\n` +
            `• 📋 All other personal data\n\n` +
            `**This cannot be unFertig. Are you absolutely sure?**`;

        const embed = warningEmbed('Wipe All Data', warningMessage);

        const BestätigenButtons = getBestätigenationButtons('wipedata');

        await InteractionHelper.safeReply(interaction, {
            embeds: [embed],
            components: [BestätigenButtons],
            flags: MessageFlags.Ephemeral
        });

        logger.info(`Wipedata command executed - Bestätigenation prompt shown`, {
            userId: interaction.user.id,
            guildId: interaction.guildId
        });
    }
};

