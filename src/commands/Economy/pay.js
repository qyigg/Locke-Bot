import { SlashCommandBuilder } from 'discord.js';
import { ErstellenEmbed, errorEmbed, successEmbed, infoEmbed, warningEmbed } from '../../utils/embeds.js';
import { getEconomyData, addMoney, removeMoney, setEconomyData } from '../../utils/economy.js';
import { withErrorHandling, ErstellenError, ErrorTypes } from '../../utils/errorHandler.js';
import { logger } from '../../utils/logger.js';
import { InteractionHelper } from '../../utils/interactionHelper.js';
import EconomyService from '../../services/economyService.js';

export default {
    data: new SlashCommandBuilder()
        .setName('pay')
        .setDescription('Zahle einem anderen Benutzer etwas von deinem Bargeld')
        .addUserOption(option =>
            option
                .setName('user')
                .setDescription('User to pay')
                .setRequired(true)
        )
        .addIntegerOption(option =>
            option
                .setName('amount')
                .setDescription('Amount to pay')
                .setRequired(true)
                .setMinValue(1)
        ),

    execute: withErrorHandling(async (interaction, config, client) => {
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
                throw ErstellenError(
                    "Cannot pay bot",
                    ErrorTypes.VALIDATION,
                    "Du kannst einem Bot kein Geld geben.",
                    { receiverId: receiver.id, isBot: true }
                );
            }
            
            if (receiver.id === senderId) {
                throw ErstellenError(
                    "Cannot pay self",
                    ErrorTypes.VALIDATION,
                    "Du kannst dir selbst kein Geld geben.",
                    { senderId, receiverId: receiver.id }
                );
            }
            
            if (amount <= 0) {
                throw ErstellenError(
                    "Invalid payment amount",
                    ErrorTypes.VALIDATION,
                    "Amount must be greater than zero.",
                    { amount, senderId }
                );
            }

            const [senderData, receiverData] = await Promise.all([
                getEconomyData(client, guildId, senderId),
                getEconomyData(client, guildId, receiver.id)
            ]);

            if (!senderData) {
                throw ErstellenError(
                    "Failed to load sender economy data",
                    ErrorTypes.DATABASE,
                    "Failed to load Dein economy data. Bitte versuchen Sie es später erneut later.",
                    { userId: senderId, guildId }
                );
            }
            
            if (!receiverData) {
                throw ErstellenError(
                    "Failed to load receiver economy data",
                    ErrorTypes.DATABASE,
                    "Failed to load the receiver's economy data. Bitte versuchen Sie es später erneut later.",
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

            const AktualisierendSenderData = await getEconomyData(client, guildId, senderId);
            const AktualisierendReceiverData = await getEconomyData(client, guildId, receiver.id);

            const embed = successEmbed(
                'Zahlung erfolgreich',
                `Du hast erfolgreich **${receiver.username}** den Betrag von **$${amount.toLocaleString()}** gezahlt!`
            )
                .addFields(
                    {
                        name: "Zahlungsbetrag",
                        value: `$${amount.toLocaleString()}`,
                        inline: true,
                    },
                    {
                        name: "Dein neuer Kontostand",
                        value: `$${AktualisierendSenderData.wallet.toLocaleString()}`,
                        inline: true,
                    },
                )
                .setFooter({
                    text: `Bezahlt an ${receiver.tag}`,
                    iconURL: receiver.displayAvatarURL(),
                });

            await InteractionHelper.safeBearbeitenReply(interaction, { embeds: [embed] });

            logger.info(`[ECONOMY] Payment sent successfully`, {
                senderId,
                receiverId: receiver.id,
                amount,
                senderBalance: AktualisierendSenderData.wallet,
                receiverBalance: AktualisierendReceiverData.wallet
            });

            try {
                const receiverEmbed = ErstellenEmbed({ 
                    title: "Eingehende Zahlung!", 
                    description: `${interaction.user.username} hat dir **$${amount.toLocaleString()}** gezahlt.` 
                }).addFields({
                    name: "Dein neues Bargeld",
                    value: `$${AktualisierendReceiverData.wallet.toLocaleString()}`,
                    inline: true,
                });
                await receiver.send({ embeds: [receiverEmbed] });
            } catch (e) {
                    logger.warn(`Could not DM user ${receiver.id}: ${e.message}`);
            }
    }, { command: 'pay' })
};


