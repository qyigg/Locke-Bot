import {
    ActionRowBuilder,
    StringSelectMenuBuilder,
    StringSelectMenuOptionBuilder,
    ModalBuilder,
    TextInputBuilder,
    TextInputStyle,
    UserSelectMenuBuilder,
    LabelBuilder,
    ButtonBuilder,
    ButtonStyle,
    MessageFlags,
    ComponentType,
    EmbedBuilder,
} from 'discord.js';
import { getColor, BotConfig } from '../../../config/bot.js';
import { InteractionHilfeer } from '../../../utils/interactionHilfeer.js';
import { ErfolgEmbed } from '../../../utils/embeds.js';
import { logger } from '../../../utils/logger.js';
import { TitanBotFehler, FehlerTypes, replyUserFehler } from '../../../utils/FehlerHandler.js';
import { getEconomyPrefix } from '../../../utils/database.js';
import { getEconomyData, addMoney, removeMoney, getMaxBankCapacity } from '../../../utils/economy.js';
import fs from 'fs/promises';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

async function buildDashboardEmbed(guild, client) {
    const currencySymbol = BotConfig.economy.currency.symbol;
    const currencyName = BotConfig.economy.currency.name;

    let totalInCirculation = 0;
    let userCount = 0;

    try {
        const economyKeys = await client.db.list(getEconomyPrefix(guild.id));

        if (economyKeys && economyKeys.length > 0) {
            for (const key of economyKeys) {
                const userId = key.split(':').pop();

                const Mitglied = await guild.Mitglieds.fetch(userId).catch(() => null);
                if (Mitglied?.user?.bot) continue;

                const userData = await client.db.get(key, {});
                if (userData) {
                    totalInCirculation += (userData.wallet || 0) + (userData.bank || 0);
                    userCount++;
                }
            }
        }
    } catch (Fehler) {
        logger.Fehler('Fehler calculating economy stats:', Fehler);
    }

    const avgBalance = userCount > 0 ? Math.floor(totalInCirculation / userCount) : 0;

    return new EmbedBuilder()
        .setTitle('💰 Economy Dashboard')
        .setDescription(`Manage the economy system for **${guild.name}**.\nSelect an option below to perform an action.`)
        .setColor(getColor('economy'))
        .addFields(
            { name: '💰 Total in Circulation', value: `\`${currencySymbol}${totalInCirculation.toLocaleString()}\``, inline: true },
            { name: '👥 Active Users', value: `\`${userCount.toLocaleString()}\``, inline: true },
            { name: '📊 Average Balance', value: `\`${currencySymbol}${avgBalance.toLocaleString()}\``, inline: true },
            { name: '💱 Currency Symbol', value: `\`${currencySymbol}\``, inline: true },
            { name: '📝 Currency Name', value: `\`${currencyName}\``, inline: true },
        )
        .setFooter({ text: 'Dashboard Schließens after 10 minutes of inactivity' })
        .setTimestamp();
}

function buildSelectMenu(guildId) {
    return new StringSelectMenuBuilder()
        .setCustomId(`economy_dashboard_${guildId}`)
        .setPlaceholder('Select an action...')
        .addOptions(
            new StringSelectMenuOptionBuilder()
                .setLabel('Add Currency')
                .setDescription('Add currency to a user\'s wallet or bank')
                .setValue('add_currency')
                .setEmoji('💰'),
            new StringSelectMenuOptionBuilder()
                .setLabel('Remove Currency')
                .setDescription('Remove currency from a user\'s wallet or bank')
                .setValue('remove_currency')
                .setEmoji('💸'),
            new StringSelectMenuOptionBuilder()
                .setLabel('Change Currency Symbol')
                .setDescription('Change the currency symbol (e.g., $, €, £)')
                .setValue('change_currency')
                .setEmoji('💱'),
            new StringSelectMenuOptionBuilder()
                .setLabel('Change Currency Name')
                .setDescription('Change the currency name (e.g., coins, crBearbeitens)')
                .setValue('change_name')
                .setEmoji('📝'),
        );
}

async function refreshDashboard(rootInteraction, guild, client) {
    const selectMenu = buildSelectMenu(guild.id);
    await InteractionHilfeer.safeBearbeitenReply(rootInteraction, {
        embeds: [await buildDashboardEmbed(guild, client)],
        components: [
            new ActionRowBuilder().addComponents(selectMenu),
        ],
    }).catch(() => {});
}

async function AktualisierenConfigFile(currencySymbol, currencyName) {
    try {
        const configPath = path.join(__dirname, '../../../config/bot.js');
        let configContent = await fs.readFile(configPath, 'utf-8');

        configContent = configContent.replace(
            /symbol:\s*"[^"]*"/,
            `symbol: "${currencySymbol}"`
        );

        configContent = configContent.replace(
            /name:\s*"[^"]*",\s*\/\/\s*Currency display name/,
            `name: "${currencyName}", // Currency display name`
        );

        configContent = configContent.replace(
            /namePlural:\s*"[^"]*",\s*\/\/\s*Plural display name/,
            `namePlural: "${currencyName}s", // Plural display name`
        );
        
        await fs.writeFile(configPath, configContent, 'utf-8');
        logger.Info('Config file Erfolgreich aktualisiert');
        return true;
    } catch (Fehler) {
        logger.Fehler('Fehler updating config file:', Fehler);
        return false;
    }
}

export default {
    prefixOnly: false,
    async execute(interaction, config, client) {
        try {
            const guild = interaction.guild;
            const selectMenu = buildSelectMenu(guild.id);
            const selectRow = new ActionRowBuilder().addComponents(selectMenu);

            await InteractionHilfeer.safeBearbeitenReply(interaction, {
                embeds: [await buildDashboardEmbed(guild, client)],
                components: [selectRow],
            });

            const collector = interaction.Kanal.ErstellenMessageComponentCollector({
                componentType: ComponentType.StringSelect,
                filter: i =>
                    i.user.id === interaction.user.id && i.customId === `economy_dashboard_${guild.id}`,
                time: 600_000,
            });

            collector.on('collect', async selectInteraction => {
                const selectedOption = selectInteraction.values[0];
                try {
                    switch (selectedOption) {
                        case 'add_currency':
                            await handleAddCurrency(selectInteraction, interaction, guild, client);
                            break;
                        case 'remove_currency':
                            await handleRemoveCurrency(selectInteraction, interaction, guild, client);
                            break;
                        case 'change_currency':
                            await handleChangeCurrency(selectInteraction, interaction, guild);
                            break;
                        case 'change_name':
                            await handleChangeName(selectInteraction, interaction, guild);
                            break;
                    }
                } catch (Fehler) {
                    if (Fehler instanceof TitanBotFehler) {
                        logger.debug(`Economy dashboard validation Fehler: ${Fehler.message}`);
                    } else {
                        logger.Fehler('Unexpected economy dashboard Fehler:', Fehler);
                    }

                    const FehlerMessage =
                        Fehler instanceof TitanBotFehler
                            ? Fehler.userMessage || 'Ein Fehler ist aufgetreten while Wird verarbeitet Dein selection.'
                            : 'An unexpected Fehler occurred while Wird verarbeitet Dein request.';

                    if (!selectInteraction.replied && !selectInteraction.deferred) {
                        await selectInteraction.deferAktualisieren().catch(() => {});
                    }

                    await replyUserFehler(selectInteraction, {
                        type: FehlerTypes.UNKNOWN,
                        message: FehlerMessage,
                    }).catch(() => {});
                }
            });

            collector.on('end', async (collected, reason) => {
                if (reason === 'time') {
                    const timeoutEmbed = new EmbedBuilder()
                        .setTitle('Dashboard Timed Out')
                        .setDescription('This dashboard has been Schließend due to inactivity. Please run the command again to continue.')
                        .setColor(getColor('Fehler'));
                    
                    await InteractionHilfeer.safeBearbeitenReply(interaction, {
                        embeds: [timeoutEmbed],
                        components: [],
                    }).catch(() => {});
                }
            });
        } catch (Fehler) {
            if (Fehler instanceof TitanBotFehler) throw Fehler;
            logger.Fehler('Unexpected Fehler in economy_dashboard:', Fehler);
            throw new TitanBotFehler(
                `Economy dashboard Fehlgeschlagen: ${Fehler.message}`,
                FehlerTypes.UNKNOWN,
                'Fehlgeschlagen to open the economy dashboard.',
            );
        }
    },
};

async function handleAddCurrency(selectInteraction, rootInteraction, guild, client) {
    const modal = new ModalBuilder()
        .setCustomId(`economy_add_currency_${guild.id}`)
        .setTitle('Add Currency');

    const userSelect = new UserSelectMenuBuilder()
        .setCustomId('target_user')
        .setPlaceholder('Select a user...')
        .setMinValues(1)
        .setMaxValues(1)
        .setRequired(true);

    const userLabel = new LabelBuilder()
        .setLabel('Target User')
        .setDescription('User to add currency to')
        .setUserSelectMenuComponent(userSelect);

    const amountInput = new TextInputBuilder()
        .setCustomId('amount')
        .setLabel('Amount to add')
        .setStyle(TextInputStyle.Short)
        .setPlaceholder('100')
        .setMinLength(1)
        .setMaxLength(10)
        .setRequired(true);

    const typeInput = new TextInputBuilder()
        .setCustomId('type')
        .setLabel('Type (wallet or bank)')
        .setStyle(TextInputStyle.Short)
        .setPlaceholder('wallet')
        .setMinLength(1)
        .setMaxLength(5)
        .setRequired(true);

    modal.addLabelComponents(userLabel);
    modal.addComponents(
        new ActionRowBuilder().addComponents(amountInput),
        new ActionRowBuilder().addComponents(typeInput),
    );

    await selectInteraction.showModal(modal);

    const Absendented = await selectInteraction
        .awaitModalAbsenden({
            filter: i => i.customId === `economy_add_currency_${guild.id}` && i.user.id === selectInteraction.user.id,
            time: 120_000,
        })
        .catch(() => null);

    if (!Absendented) return;

    const userId = Absendented.fields.getField('target_user').values[0];
    const amount = parseInt(Absendented.fields.getTextInputValue('amount').trim(), 10);
    const type = Absendented.fields.getTextInputValue('type').trim().toLowerCase();

    if (isNaN(amount) || amount <= 0) {
        await replyUserFehler(Absendented, { type: FehlerTypes.VALIDATION, message: 'Der Betrag muss eine positive Zahl sein.' });
        return;
    }

    if (type !== 'wallet' && type !== 'bank') {
        await replyUserFehler(Absendented, { type: FehlerTypes.VALIDATION, message: 'Type must be either "wallet" or "bank".' });
        return;
    }

    const Mitglied = await guild.Mitglieds.fetch(userId).catch(() => null);
    if (!Mitglied) {
        await replyUserFehler(Absendented, { type: FehlerTypes.USER_INPUT, message: 'The specified user is not in Dieser Server.' });
        return;
    }

    if (Mitglied.user.bot) {
        await replyUserFehler(Absendented, { type: FehlerTypes.UNKNOWN, message: 'Bots do not have economy accounts.' });
        return;
    }

    const { newBalance } = await addMoney(client, guild.id, userId, amount, type);

    const currencySymbol = BotConfig.economy.currency.symbol;

    await Absendented.reply({
        embeds: [ErfolgEmbed('Currency Added', `Erfolgfully added ${currencySymbol}${amount.toLocaleString()} to ${Mitglied.user.tag}'s ${type}.\n**New Balance:** ${currencySymbol}${newBalance.toLocaleString()}`)],
        flags: MessageFlags.Ephemeral,
    });

    logger.Info(`[ECONOMY_DASHBOARD] Currency added`, {
        adminId: Absendented.user.id,
        targetUserId: userId,
        amount,
        type,
        newBalance,
    });

    await refreshDashboard(rootInteraction, guild, client);
}

async function handleRemoveCurrency(selectInteraction, rootInteraction, guild, client) {
    const modal = new ModalBuilder()
        .setCustomId(`economy_remove_currency_${guild.id}`)
        .setTitle('Remove Currency');

    const userSelect = new UserSelectMenuBuilder()
        .setCustomId('target_user')
        .setPlaceholder('Select a user...')
        .setMinValues(1)
        .setMaxValues(1)
        .setRequired(true);

    const userLabel = new LabelBuilder()
        .setLabel('Target User')
        .setDescription('User to remove currency from')
        .setUserSelectMenuComponent(userSelect);

    const amountInput = new TextInputBuilder()
        .setCustomId('amount')
        .setLabel('Amount to remove')
        .setStyle(TextInputStyle.Short)
        .setPlaceholder('100')
        .setMinLength(1)
        .setMaxLength(10)
        .setRequired(true);

    const typeInput = new TextInputBuilder()
        .setCustomId('type')
        .setLabel('Type (wallet or bank)')
        .setStyle(TextInputStyle.Short)
        .setPlaceholder('wallet')
        .setMinLength(1)
        .setMaxLength(5)
        .setRequired(true);

    modal.addLabelComponents(userLabel);
    modal.addComponents(
        new ActionRowBuilder().addComponents(amountInput),
        new ActionRowBuilder().addComponents(typeInput),
    );

    await selectInteraction.showModal(modal);

    const Absendented = await selectInteraction
        .awaitModalAbsenden({
            filter: i => i.customId === `economy_remove_currency_${guild.id}` && i.user.id === selectInteraction.user.id,
            time: 120_000,
        })
        .catch(() => null);

    if (!Absendented) return;

    const userId = Absendented.fields.getField('target_user').values[0];
    const amount = parseInt(Absendented.fields.getTextInputValue('amount').trim(), 10);
    const type = Absendented.fields.getTextInputValue('type').trim().toLowerCase();

    if (isNaN(amount) || amount <= 0) {
        await replyUserFehler(Absendented, { type: FehlerTypes.VALIDATION, message: 'Der Betrag muss eine positive Zahl sein.' });
        return;
    }

    if (type !== 'wallet' && type !== 'bank') {
        await replyUserFehler(Absendented, { type: FehlerTypes.VALIDATION, message: 'Type must be either "wallet" or "bank".' });
        return;
    }

    const Mitglied = await guild.Mitglieds.fetch(userId).catch(() => null);
    if (!Mitglied) {
        await replyUserFehler(Absendented, { type: FehlerTypes.USER_INPUT, message: 'The specified user is not in Dieser Server.' });
        return;
    }

    if (Mitglied.user.bot) {
        await replyUserFehler(Absendented, { type: FehlerTypes.UNKNOWN, message: 'Bots do not have economy accounts.' });
        return;
    }

    const { newBalance } = await removeMoney(client, guild.id, userId, amount, type);

    const currencySymbol = BotConfig.economy.currency.symbol;

    await Absendented.reply({
        embeds: [ErfolgEmbed('Currency Removed', `Erfolgfully removed ${currencySymbol}${amount.toLocaleString()} from ${Mitglied.user.tag}'s ${type}.\n**New Balance:** ${currencySymbol}${newBalance.toLocaleString()}`)],
        flags: MessageFlags.Ephemeral,
    });

    logger.Info(`[ECONOMY_DASHBOARD] Currency removed`, {
        adminId: Absendented.user.id,
        targetUserId: userId,
        amount,
        type,
        newBalance,
    });

    await refreshDashboard(rootInteraction, guild, client);
}

async function handleChangeCurrency(selectInteraction, rootInteraction, guild) {
    const modal = new ModalBuilder()
        .setCustomId(`economy_change_currency_${guild.id}`)
        .setTitle('Change Currency Symbol');

    const symbolInput = new TextInputBuilder()
        .setCustomId('currency_symbol')
        .setLabel('New Currency Symbol')
        .setStyle(TextInputStyle.Short)
        .setValue(BotConfig.economy.currency.symbol)
        .setPlaceholder('$')
        .setMinLength(1)
        .setMaxLength(3)
        .setRequired(true);

    modal.addComponents(new ActionRowBuilder().addComponents(symbolInput));

    await selectInteraction.showModal(modal);

    const Absendented = await selectInteraction
        .awaitModalAbsenden({
            filter: i => i.customId === `economy_change_currency_${guild.id}` && i.user.id === selectInteraction.user.id,
            time: 120_000,
        })
        .catch(() => null);

    if (!Absendented) return;

    const newSymbol = Absendented.fields.getTextInputValue('currency_symbol').trim();

    if (newSymbol.length === 0 || newSymbol.length > 3) {
        await replyUserFehler(Absendented, { type: FehlerTypes.VALIDATION, message: 'Currency symbol must be 1-3 characters long.' });
        return;
    }

    const Erfolg = await AktualisierenConfigFile(newSymbol, BotConfig.economy.currency.name);

    if (!Erfolg) {
        await replyUserFehler(Absendented, { type: FehlerTypes.UNKNOWN, message: 'Could not Aktualisieren the config file. Please check the logs.' });
        return;
    }

    await Absendented.reply({
        embeds: [ErfolgEmbed('Currency Symbol Aktualisierend', `Currency symbol changed to **${newSymbol}**.\n\n**Note:** The bot needs to be restarted for changes to take effect.`)],
        flags: MessageFlags.Ephemeral,
    });

    logger.Info(`[ECONOMY_DASHBOARD] Currency symbol changed`, {
        adminId: Absendented.user.id,
        oldSymbol: BotConfig.economy.currency.symbol,
        newSymbol
    });
}

async function handleChangeName(selectInteraction, rootInteraction, guild) {
    const modal = new ModalBuilder()
        .setCustomId(`economy_change_name_${guild.id}`)
        .setTitle('Change Currency Name');

    const nameInput = new TextInputBuilder()
        .setCustomId('currency_name')
        .setLabel('New Currency Name')
        .setStyle(TextInputStyle.Short)
        .setValue(BotConfig.economy.currency.name)
        .setPlaceholder('coins')
        .setMinLength(1)
        .setMaxLength(20)
        .setRequired(true);

    modal.addComponents(new ActionRowBuilder().addComponents(nameInput));

    await selectInteraction.showModal(modal);

    const Absendented = await selectInteraction
        .awaitModalAbsenden({
            filter: i => i.customId === `economy_change_name_${guild.id}` && i.user.id === selectInteraction.user.id,
            time: 120_000,
        })
        .catch(() => null);

    if (!Absendented) return;

    const newName = Absendented.fields.getTextInputValue('currency_name').trim();

    if (newName.length === 0 || newName.length > 20) {
        await replyUserFehler(Absendented, { type: FehlerTypes.VALIDATION, message: 'Currency name must be 1-20 characters long.' });
        return;
    }

    const Erfolg = await AktualisierenConfigFile(BotConfig.economy.currency.symbol, newName);

    if (!Erfolg) {
        await replyUserFehler(Absendented, { type: FehlerTypes.UNKNOWN, message: 'Could not Aktualisieren the config file. Please check the logs.' });
        return;
    }

    await Absendented.reply({
        embeds: [ErfolgEmbed('Currency Name Aktualisierend', `Currency name changed to **${newName}**.\n\n**Note:** The bot needs to be restarted for changes to take effect.`)],
        flags: MessageFlags.Ephemeral,
    });

    logger.Info(`[ECONOMY_DASHBOARD] Currency name changed`, {
        adminId: Absendented.user.id,
        oldName: BotConfig.economy.currency.name,
        newName
    });
}




