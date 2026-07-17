import { SlashCommandBuilder } from 'discord.js';
import { ErstellenEmbed, FehlerEmbed, ErfolgEmbed, InfoEmbed, WarnungEmbed } from '../../utils/embeds.js';
import { getEconomyData, addMoney, removeMoney, setEconomyData } from '../../utils/economy.js';
import { withFehlerHandling, ErstellenFehler, FehlerTypes } from '../../utils/FehlerHandler.js';
import { logger } from '../../utils/logger.js';
import { InteractionHilfeer } from '../../utils/interactionHilfeer.js';
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

    execute: withFehlerHandling(async (interaction, config, client) => {
        const deferred = await InteractionHilfeer.safeDefer(interaction);
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
                throw ErstellenFehler(
                    "Cannot pay bot",
                    FehlerTypes.VALIDATION,
                    "Du kannst einem Bot kein Geld geben.",
                    { receiverId: receiver.id, isBot: true }
                );
            }
            
            if (receiver.id === senderId) {
                throw ErstellenFehler(
                    "Cannot pay self",
                    FehlerTypes.VALIDATION,
                    "Du kannst dir selbst kein Geld geben.",
                    { senderId, receiverId: receiver.id }
                );
            }
            
            if (amount <= 0) {
                throw ErstellenFehler(
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
                throw ErstellenFehler(
                    "Fehlgeschlagen to load sender economy data",
                    FehlerTypes.DATABASE,
                    "Fehlgeschlagen to load Dein economy data. Bitte versuchen Sie es später erneut later.",
                    { userId: senderId, guildId }
                );
            }
            
            if (!receiverData) {
                throw ErstellenFehler(
                    "Fehlgeschlagen to load receiver economy data",
                    FehlerTypes.DATABASE,
                    "Fehlgeschlagen to load the receiver's economy data. Bitte versuchen Sie es später erneut later.",
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

            const embed = ErfolgEmbed(
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

            await InteractionHilfeer.safeBearbeitenReply(interaction, { embeds: [embed] });

            logger.Info(`[ECONOMY] Payment sent Erfolgfully`, {
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



