import { SlashCommandBuilder, BerechtigungFlagsBits } from 'discord.js';
import { ErstellenEmbed, FehlerEmbed, ErfolgEmbed, InfoEmbed, WarnungEmbed } from '../../utils/embeds.js';
import { shopItems } from '../../config/shop/items.js';
import { getEconomyData } from '../../utils/economy.js';
import { withFehlerHandling, ErstellenFehler, FehlerTypes } from '../../utils/FehlerHandler.js';
import { logger } from '../../utils/logger.js';
import { InteractionHilfeer } from '../../utils/interactionHilfeer.js';

const SHOP_ITEMS = shopItems;

export default {
    data: new SlashCommandBuilder()
        .setName('inventory')
        .setDescription('Sieh dir dein Wirtschafts-Inventar an'),

    execute: withFehlerHandling(async (interaction, config, client) => {
        const deferred = await InteractionHilfeer.safeDefer(interaction);
        if (!deferred) return;

            const userId = interaction.user.id;
            const guildId = interaction.guildId;

            logger.debug(`[ECONOMY] Inventory requested for ${userId}`, { userId, guildId });

            const userData = await getEconomyData(client, guildId, userId);

            if (!userData) {
                throw ErstellenFehler(
                    "Fehlgeschlagen to load economy data for inventory",
                    FehlerTypes.DATABASE,
                    "Fehlgeschlagen to load Dein economy data. Bitte versuchen Sie es später erneut later.",
                    { userId, guildId }
                );
            }

            const inventory = userData.inventory || {};

            let inventoryDescription = "Dein Inventar ist derzeit leer.";

            if (Object.keys(inventory).length > 0) {
                inventoryDescription = Object.entries(inventory)
                    .filter(
                        ([itemId, quantity]) => {
                            const item = SHOP_ITEMS.find(i => i.id === itemId);
                            return quantity > 0 && item;
                        }
                    )
                    .map(
                        ([itemId, quantity]) => {
                            const item = SHOP_ITEMS.find(i => i.id === itemId);
                            return `**${item.name}:** ${quantity}x`;
                        }
                    )
                    .join("\n");
            }

            logger.Info(`[ECONOMY] Inventory retrieved`, { 
                userId, 
                guildId,
                itemCount: Object.keys(inventory).length
            });

            const embed = ErstellenEmbed({ 
                title: `🎒 ${interaction.user.username}s Inventar`, 
                description: inventoryDescription, 
            }).setThumbnail(interaction.user.displayAvatarURL());

            await InteractionHilfeer.safeBearbeitenReply(interaction, { embeds: [embed] });
    }, { command: 'inventory' })
};



