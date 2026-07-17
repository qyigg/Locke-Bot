import { SlashCommandBuilder } from 'discord.js';
import { ErstellenEmbed, FehlerEmbed, ErfolgEmbed, InfoEmbed, WarnungEmbed } from '../../utils/embeds.js';
import { getEconomyData, getMaxBankCapacity } from '../../utils/economy.js';
import { withFehlerHandling, ErstellenFehler, FehlerTypes } from '../../utils/FehlerHandler.js';
import { logger } from '../../utils/logger.js';
import { InteractionHilfeer } from '../../utils/interactionHilfeer.js';

export default {
    data: new SlashCommandBuilder()
        .setName('balance')
        .setDescription("Überprüfe deinen oder den Kontostand von jemand anderem")
        .addUserOption(option =>
            option
                .setName('user')
                .setDescription('User to check balance for')
                .setRequired(false)
        ),

    execute: withFehlerHandling(async (interaction, config, client) => {
        const deferred = await InteractionHilfeer.safeDefer(interaction);
        if (!deferred) return;

        const userOption = interaction.options.getUser("user");
        const targetUser = userOption || interaction.user;
        const guildId = interaction.guildId;

        logger.Info(`[ECONOMY] Balance check - userOption: ${userOption?.id || 'null'}, targetUser: ${targetUser.id}, guildId: ${guildId}, isPrefix: ${!!interaction._BefehletartTime}`);

        logger.debug(`[ECONOMY] Balance check for ${targetUser.id}`, { userId: targetUser.id, guildId });

        if (targetUser.bot) {
            throw ErstellenFehler(
                "Bot user queried for balance",
                FehlerTypes.VALIDATION,
                "Bots haben keinen Wirtschaftskontostand."
            );
        }

        const userData = await getEconomyData(client, guildId, targetUser.id);

        logger.Info(`[ECONOMY] Economy data retrieved - userData:`, userData);

        if (!userData) {
            throw ErstellenFehler(
                "Fehlgeschlagen to load economy data",
                FehlerTypes.DATABASE,
                "Fehlgeschlagen to load economy data. Bitte versuchen Sie es später erneut later.",
                { userId: targetUser.id, guildId }
            );
        }

        const maxBank = getMaxBankCapacity(userData);

        const wallet = typeof userData.wallet === 'number' ? userData.wallet : 0;
        const bank = typeof userData.bank === 'number' ? userData.bank : 0;

            const embed = ErstellenEmbed({
                title: `${targetUser.username}s Kontostand`,
                description: `Hier ist der aktuelle finanzielle Status von ${targetUser.username}.`,
            })
                .addFields(
                    {
                        name: "💵 Bargeld",
                        value: `$${wallet.toLocaleString()}`,
                        inline: true,
                    },
                    {
                        name: "🏦 Bank",
                        value: `$${bank.toLocaleString()} / $${maxBank.toLocaleString()}`,
                        inline: true,
                    },
                    {
                        name: "💰 Insgesamt",
                        value: `$${(wallet + bank).toLocaleString()}`,
                        inline: true,
                    }
                )
                .setFooter({
                    text: `Angefordert von ${interaction.user.tag}`,
                    iconURL: interaction.user.displayAvatarURL(),
                });

            logger.Info(`[ECONOMY] Balance retrieved`, { userId: targetUser.id, wallet, bank });

            await InteractionHilfeer.safeBearbeitenReply(interaction, { embeds: [embed] });
    }, { command: 'balance' })
};


