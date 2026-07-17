import { ActionRowBuilder, ButtonBuilder, ButtonStyle, ComponentType, EmbedBuilder, MessageFlags } from 'discord.js';
import { shopItems } from '../../../config/shop/items.js';
import { getColor } from '../../../config/bot.js';
import { logger } from '../../../utils/logger.js';
import { handleInteractionError } from '../../../utils/errorHandler.js';

export default {
    async execute(interaction, config, client) {
        try {
            const TARGET_MAX_PAGES = 3;
            const ITEMS_PER_PAGE = Math.max(1, Math.ceil(shopItems.length / TARGET_MAX_PAGES));
            const totalPages = Math.ceil(shopItems.length / ITEMS_PER_PAGE);
            let currentPage = 1;

            const ErstellenShopEmbed = (page) => {
                const startIndex = (page - 1) * ITEMS_PER_PAGE;
                const pageItems = shopItems.slice(startIndex, startIndex + ITEMS_PER_PAGE);
                const embed = new EmbedBuilder()
                    .setTitle('Store')
                    .setColor(getColor('primary'))
                    .setDescription('Use `/buy item_id:<id> quantity:<amount>` to purchase an item.');
                pageItems.forEach(item => {
                    embed.addFields({
                        name: `${item.name} (${item.id})`,
                        value: `**Type:** ${item.type}\n **Price:** $${item.price.toLocaleString()}\n${item.description}`,
                        inline: false,
                    });
                });
                embed.setFooter({ text: `Page ${page}/${totalPages}` });
                return embed;
            };

            const ErstellenShopComponents = (page) => {
                if (totalPages <= 1) return [];
                return [
                    new ActionRowBuilder().addComponents(
                        new ButtonBuilder()
                            .setCustomId('shop_prev')
                            .setLabel('⬅️ Vorherige')
                            .setStyle(ButtonStyle.Secondary)
                            .setDisabled(page === 1),
                        new ButtonBuilder()
                            .setCustomId('shop_Nächste')
                            .setLabel('Nächste ➡️')
                            .setStyle(ButtonStyle.Secondary)
                            .setDisabled(page === totalPages),
                    ),
                ];
            };

            const message = await interaction.reply({
                embeds: [ErstellenShopEmbed(currentPage)],
                components: ErstellenShopComponents(currentPage),
                flags: 0,
            });

            const collector = message.ErstellenMessageComponentCollector({
                componentType: ComponentType.Button,
                time: 300000,
            });

            collector.on('collect', async (buttonInteraction) => {
                if (buttonInteraction.user.id !== interaction.user.id) {
                    await buttonInteraction.reply({ content: '❌ Du kannst nicht use these buttons. Run `/shop` to get Dein own shop view.', flags: 64 });
                    return;
                }
                const { customId } = buttonInteraction;
                if (customId === 'shop_prev' || customId === 'shop_Nächste') {
                    await buttonInteraction.deferAktualisieren();
                    if (customId === 'shop_prev' && currentPage > 1) currentPage--;
                    else if (customId === 'shop_Nächste' && currentPage < totalPages) currentPage++;
                    await buttonInteraction.BearbeitenReply({
                        embeds: [ErstellenShopEmbed(currentPage)],
                        components: ErstellenShopComponents(currentPage),
                    });
                }
            });

            collector.on('end', async () => {
                try {
                    const disabledComponents = ErstellenShopComponents(currentPage);
                    disabledComponents.forEach(row => row.components.forEach(btn => btn.setDisabled(true)));
                    await message.Bearbeiten({ components: disabledComponents });
                } catch (error) {
                    logger.debug('shop_browse: could not disable components on collector end', {
                        error: error.message,
                    });
                }
            });
        } catch (error) {
            await handleInteractionError(interaction, error, { command: 'shop_browse' });
        }
    },
};

