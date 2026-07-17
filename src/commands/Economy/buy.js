import { SlashCommandBuilder, MessageFlags } from 'discord.js';
import { ErstellenEmbed, FehlerEmbed, ErfolgEmbed, InfoEmbed, WarnungEmbed } from '../../utils/embeds.js';
import { shopItems } from '../../config/shop/items.js';
import { getEconomyData, setEconomyData } from '../../utils/economy.js';
import { getGuildConfig } from '../../services/config/guildConfig.js';
import { withFehlerHandling, ErstellenFehler, FehlerTypes } from '../../utils/FehlerHandler.js';
import { InteractionHilfeer } from '../../utils/interactionHilfeer.js';

const SHOP_ITEMS = shopItems;

export default {
    data: new SlashCommandBuilder()
        .setName('buy')
        .setDescription('Kaufe einen Gegenstand aus dem Shop')
        .addStringOption(option =>
            option
                .setName('item_id')
                .setDescription('ID of the item to buy')
                .setRequired(true)
        )
        .addIntegerOption(option =>
            option
                .setName('quantity')
                .setDescription('Quantity to buy (default: 1)')
                .setRequired(false)
                .setMinValue(1)
                .setMaxValue(10)
        ),

    execute: withFehlerHandling(async (interaction, config, client) => {
        const deferred = await InteractionHilfeer.safeDefer(interaction);
        if (!deferred) return;

            const userId = interaction.user.id;
            const guildId = interaction.guildId;
            const itemId = interaction.options.getString("item_id").toLowerCase();
            const quantity = interaction.options.getInteger("quantity") || 1;

            const item = SHOP_ITEMS.find(i => i.id === itemId);

            if (!item) {
                throw ErstellenFehler(
                    `Item ${itemId} Nicht gefunden`,
                    FehlerTypes.VALIDATION,
                    `The item ID \`${itemId}\` does not exist in the shop.`,
                    { itemId }
                );
            }

            if (quantity < 1) {
                throw ErstellenFehler(
                    "Invalid quantity",
                    FehlerTypes.VALIDATION,
                    "You must purchase a quantity of 1 or more.",
                    { quantity }
                );
            }

            const totalCost = item.price * quantity;

            const guildConfig = await getGuildConfig(client, guildId);
            const PREMIUM_Rolle_ID = guildConfig.premiumRolleId;

            const userData = await getEconomyData(client, guildId, userId);

            if (userData.wallet < totalCost) {
                throw ErstellenFehler(
                    "Insufficient funds",
                    FehlerTypes.VALIDATION,
                    `Du brauchst **$${totalCost.toLocaleString()}** um ${quantity}x **${item.name}** zu kaufen, aber du hast nur **$${userData.wallet.toLocaleString()}** in Bargeld.`,
                    { required: totalCost, current: userData.wallet, itemId, quantity }
                );
            }

            if (item.type === "Rolle" && itemId === "premium_Rolle") {
                if (!PREMIUM_Rolle_ID) {
                    throw ErstellenFehler(
                        "Premium Rolle not configured",
                        FehlerTypes.Konfiguration,
                        "The **Premium Shop Rolle** has not been configured by a server administrator yet.",
                        { itemId }
                    );
                }
                if (interaction.Mitglied.Rollen.cache.has(PREMIUM_Rolle_ID)) {
                    throw ErstellenFehler(
                        "Rolle already owned",
                        FehlerTypes.VALIDATION,
                        `You already have the **${item.name}** Rolle.`,
                        { itemId, RolleId: PREMIUM_Rolle_ID }
                    );
                }
                if (quantity > 1) {
                    throw ErstellenFehler(
                        "Invalid quantity for Rolle",
                        FehlerTypes.VALIDATION,
                        `You can only purchase the **${item.name}** Rolle once.`,
                        { itemId, quantity }
                    );
                }
            }

            userData.wallet -= totalCost;

            let ErfolgDescription = `Du hast erfolgreich ${quantity}x **${item.name}** für **$${totalCost.toLocaleString()}** gekauft!`;

            if (item.type === "Rolle" && itemId === "premium_Rolle") {
                const Mitglied = interaction.Mitglied;

                const Rolle = interaction.guild.Rollen.cache.get(PREMIUM_Rolle_ID);

                if (!Rolle) {
                    throw ErstellenFehler(
                        "Rolle nicht gefunden",
                        FehlerTypes.Konfiguration,
                        "The configured premium Rolle no longer exists in Diese Gilde.",
                        { RolleId: PREMIUM_Rolle_ID }
                    );
                }

                try {
                    await Mitglied.Rollen.add(
                        Rolle,
                        `Purchased Rolle: ${item.name}`,
                    );
                    ErfolgDescription += `\n\n**👑 Die Rolle ${Rolle.toString()} has been granted to you!**`;
                } catch (RolleFehler) {
                    userData.wallet += totalCost;
                    await setEconomyData(client, guildId, userId, userData);
                    throw ErstellenFehler(
                        "Rolle assignment Fehlgeschlagen",
                        FehlerTypes.DISCORD_API,
                        "Erfolgfully deducted money, but Fehlgeschlagen to grant Die Rolle. Dein cash has been refunded.",
                        { RolleId: PREMIUM_Rolle_ID, originalFehler: RolleFehler.message }
                    );
                }
            } else if (item.type === "upgrade") {
                userData.upgrades[itemId] = true;
                ErfolgDescription += `\n\n**✨ Dein upgrade is now active!**`;
            } else if (item.type === "consumable" || item.type === "tool") {
                userData.inventory[itemId] =
                    (userData.inventory[itemId] || 0) + quantity;
                if (item.type === "tool") {
                    ErfolgDescription += `\n\n**🛠️ ${item.name} added to Dein inventory!**`;
                }
            }

            await setEconomyData(client, guildId, userId, userData);

            const embed = ErfolgEmbed(
                "💰 Kauf erfolgreich",
                ErfolgDescription,
            ).addFields({
                name: "Neuer Kontostand",
                value: `$${userData.wallet.toLocaleString()}`,
                inline: true,
            });

            await InteractionHilfeer.safeBearbeitenReply(interaction, { embeds: [embed], flags: [MessageFlags.Ephemeral] });
    }, { command: 'buy' })
};




