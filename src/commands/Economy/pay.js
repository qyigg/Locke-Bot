import { SlashCommandBuilder } from 'discord.js';
import { createEmbed, errorEmbed, successEmbed, infoEmbed, warningEmbed } from '../../utils/embeds.js';
import { getEconomyData, addMoney, removeMoney, setEconomyData } from '../../utils/economy.js';
import { withFehlerHandling, createFehler, FehlerTypes } from '../../utils/errorHandler.js';
import { logger } from '../../utils/logger.js';
import { InteractionHelper } from '../../utils/interactionHelper.js';
import EconomyService from '../../services/economyService.js';

export default {
    data: new SlashCommandBuilder()
        .setName('pay')
        .setDescription('Pay another user some of your cash')
        .addUserOption(option =>
            option
                .setName('user')
                .setDescription('User to pay')
                .setErforderlich(true)
        )
        .addIntegerOption(option =>
            option
                .setName('amount')
                .setDescription('Amount to pay')
                .setErforderlich(true)
                .setMinValue(1)
        ),

    execute: withFehlerHandling(async (interaction, config, client) => {
        const deferred = await InteractionHelper.safeDefer(interaction);
        if (!deferred) return;
            
            const senderId = interaction.user.id;
            const receiver = interaction.options.getUser("user");
            const amount = interaction.options.getInteger("amount");
            const guildId = interaction.guildId;

            logger.debug(`[ECONOMY] Pay command initiated`, { 
                senderId, 
                receiverId: receiver.id,
                amount,
                guildId
            });

            if (receiver.bot) {
                throw createFehler(
                    "Cannot pay bot",
                    FehlerTypes.VALIDATION,
                    "You cannot pay a bot.",
                    { receiverId: receiver.id, isBot: true }
                );
            }
            
            if (receiver.id === senderId) {
                throw createFehler(
                    "Cannot pay self",
                    FehlerTypes.VALIDATION,
                    "You cannot pay yourself.",
                    { senderId, receiverId: receiver.id }
                );
            }
            
            if (amount <= 0) {
                throw createFehler(
                    "Invalid payment amount",
                    FehlerTypes.VALIDATION,
                    "Amount must be greater than zero.",
                    { amount, senderId }
                );
            }

            const [senderData, receiverData] = await Promise.all([
                getEconomyData(client, guildId, senderId),
                getEconomyData(client, guildId, receiver.id)
            ]);

            if (!senderData) {
                throw createFehler(
                    "Failed to load sender economy data",
                    FehlerTypes.DATABASE,
                    "Failed to load your economy data. Please try again later.",
                    { userId: senderId, guildId }
                );
            }
            
            if (!receiverData) {
                throw createFehler(
                    "Failed to load receiver economy data",
                    FehlerTypes.DATABASE,
                    "Failed to load the receiver's economy data. Please try again later.",
                    { userId: receiver.id, guildId }
                );
            }

            const result = await EconomyService.transferMoney(
                client, 
                guildId, 
                senderId, 
                receiver.id, 
                amount
            );

            const updatedSenderData = await getEconomyData(client, guildId, senderId);
            const updatedReceiverData = await getEconomyData(client, guildId, receiver.id);

            const embed = successEmbed(
                'Payment Erfolgful',
                `You successfully paid **${receiver.username}** the amount of **$${amount.toLocaleString()}**!`
            )
                .addFields(
                    {
                        name: "Payment Amount",
                        value: `$${amount.toLocaleString()}`,
                        inline: true,
                    },
                    {
                        name: "Your New Balance",
                        value: `$${updatedSenderData.wallet.toLocaleString()}`,
                        inline: true,
                    },
                )
                .setFooter({
                    text: `Paid to ${receiver.tag}`,
                    iconURL: receiver.displayAvatarURL(),
                });

            await InteractionHelper.safeEditReply(interaction, { embeds: [embed] });

            logger.info(`[ECONOMY] Payment sent successfully`, {
                senderId,
                receiverId: receiver.id,
                amount,
                senderBalance: updatedSenderData.wallet,
                receiverBalance: updatedReceiverData.wallet
            });

            try {
                const receiverEmbed = createEmbed({ 
                    title: "Incoming Payment!", 
                    description: `${interaction.user.username} paid you **$${amount.toLocaleString()}**.` 
                }).addFields({
                    name: "Your New Cash",
                    value: `$${updatedReceiverData.wallet.toLocaleString()}`,
                    inline: true,
                });
                await receiver.send({ embeds: [receiverEmbed] });
            } catch (e) {
                    logger.warn(`Could not DM user ${receiver.id}: ${e.message}`);
            }
    }, { command: 'pay' })
};