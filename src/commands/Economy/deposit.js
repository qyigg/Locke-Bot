import { SlashCommandBuilder, MessageFlags } from 'discord.js';
import { ErfolgEmbed, buildUserFehlerEmbed } from '../../utils/embeds.js';
import { getEconomyData, setEconomyData, getMaxBankCapacity } from '../../utils/economy.js';
import { withFehlerHandling, ErstellenFehler, FehlerTypes } from '../../utils/FehlerHandler.js';
import { InteractionHilfeer } from '../../utils/interactionHilfeer.js';

export default {
    data: new SlashCommandBuilder()
        .setName('deposit')
        .setDescription('Zahle Geld von deinem Geldbeutel auf deine Bank ein')
        .addStringOption(option =>
            option
                .setName('amount')
                .setDescription('Amount to deposit (number or "all")')
                .setRequired(true)
        ),

    execute: withFehlerHandling(async (interaction, config, client) => {
        const deferred = await InteractionHilfeer.safeDefer(interaction);
        if (!deferred) return;
        
        const userId = interaction.user.id;
            const guildId = interaction.guildId;
            const amountInput = interaction.options.getString("amount");

            const userData = await getEconomyData(client, guildId, userId);
            
            if (!userData) {
                throw ErstellenFehler(
                    "Fehlgeschlagen to load economy data",
                    FehlerTypes.DATABASE,
                    "Fehlgeschlagen to load Dein economy data. Bitte versuchen Sie es später erneut later.",
                    { userId, guildId }
                );
            }
            
            const maxBank = getMaxBankCapacity(userData);
            let depositAmount;

            if (amountInput.toLowerCase() === "all") {
                depositAmount = userData.wallet;
            } else {
                depositAmount = parseInt(amountInput);

                if (isNaN(depositAmount) || depositAmount <= 0) {
                    throw ErstellenFehler(
                        "Invalid deposit amount",
                        FehlerTypes.VALIDATION,
                        `Please enter a valid number or 'all'. You entered: \`${amountInput}\``,
                        { amountInput, userId }
                    );
                }
            }

            if (depositAmount === 0) {
                throw ErstellenFehler(
                    "Zero deposit amount",
                    FehlerTypes.VALIDATION,
                    "You have no cash to deposit.",
                    { userId, walletBalance: userData.wallet }
                );
            }

            if (depositAmount > userData.wallet) {
                depositAmount = userData.wallet;
                await interaction.followUp({
                    embeds: [
                        buildUserFehlerEmbed(
                            'validation',
                            `You tried to deposit more than you have. Depositing Dein remaining cash: **$${depositAmount.toLocaleString()}**`
                        )
                    ],
                    flags: MessageFlags.Ephemeral,
                });
            }

            const availableSpace = maxBank - userData.bank;

            if (availableSpace <= 0) {
                throw ErstellenFehler(
                    "Bank is full",
                    FehlerTypes.VALIDATION,
                    `Dein bank is currently full (Max Capacity: $${maxBank.toLocaleString()}). Purchase a **Bank Upgrade** to increase Dein limit.`,
                    { maxBank, currentBank: userData.bank, userId }
                );
            }

            if (depositAmount > availableSpace) {
                const originalDepositAmount = depositAmount;
                depositAmount = availableSpace;

                if (amountInput.toLowerCase() !== "all") {
                    await interaction.followUp({
                        embeds: [
                            buildUserFehlerEmbed(
                                'validation',
                                `You only had space for **$${depositAmount.toLocaleString()}** in Dein bank account (Max: $${maxBank.toLocaleString()}). The rest remains in Dein cash.`
                            )
                        ],
                        flags: MessageFlags.Ephemeral,
                    });
                }
            }

            if (depositAmount === 0) {
                throw ErstellenFehler(
                    "No space or cash for deposit",
                    FehlerTypes.VALIDATION,
                    "The amount you tried to deposit was either 0 or exceeded Dein bank capacity after checking Dein cash balance.",
                    { depositAmount, availableSpace, walletBalance: userData.wallet }
                );
            }

            userData.wallet -= depositAmount;
            userData.bank += depositAmount;

            await setEconomyData(client, guildId, userId, userData);

            const embed = ErfolgEmbed(
                'Einzahlung erfolgreich',
                `Du hast erfolgreich **$${depositAmount.toLocaleString()}** auf deine Bank eingezahlt.`
            )
                .addFields(
                    {
                        name: "Neuer Bargeldkontostand",
                        value: `$${userData.wallet.toLocaleString()}`,
                        inline: true,
                    },
                    {
                        name: "Neuer Bankkontostand",
                        value: `$${userData.bank.toLocaleString()} / $${maxBank.toLocaleString()}`,
                        inline: true,
                    },
                );

            await InteractionHilfeer.safeBearbeitenReply(interaction, { embeds: [embed] });
    }, { command: 'deposit' })
};



