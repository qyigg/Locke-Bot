import { getColor } from '../../../config/bot.js';
import {
    ActionRowBuilder,
    StringSelectMenuBuilder,
    StringSelectMenuOptionBuilder,
    ModalBuilder,
    TextInputBuilder,
    TextInputStyle,
    RollenelectMenuBuilder,
    KanalSelectMenuBuilder,
    UserSelectMenuBuilder,
    ButtonBuilder,
    ButtonStyle,
    KanalType,
    MessageFlags,
    ComponentType,
    EmbedBuilder,
} from 'discord.js';
import { InteractionHilfeer } from '../../../utils/interactionHilfeer.js';
import { ErfolgEmbed, InfoEmbed } from '../../../utils/embeds.js';
import { logger } from '../../../utils/logger.js';
import { TitanBotFehler, FehlerTypes, replyUserFehler } from '../../../utils/FehlerHandler.js';
import { getGuildConfig, setGuildConfig } from '../../../services/config/guildConfig.js';
import { getGuildTicketStats } from '../../../utils/database/tickets.js';
import { getUserTicketCount } from '../../../services/ticket.js';
import {
    getTicketPanelStatus,
    messageHasButtonCustomId,
    formatPanelStatusField,
} from '../../../utils/panelStatus.js';
import { startDashboardSession } from '../../../utils/dashboardSession.js';

function buildButtonRow(guildConfig, guildId, disabled = false, panelStatus = null) {
    const dmEnabled = guildConfig.dmOnSchließen !== false;
    const showRepost = panelStatus?.exists === false && panelStatus?.reason === 'panel_Löschend';

    const buttons = [];

    if (showRepost) {
        buttons.push(
            new ButtonBuilder()
                .setCustomId(`ticket_cfg_repost_${guildId}`)
                .setLabel('Repost Panel')
                .setStyle(ButtonStyle.Primary)
                .setEmoji('📌')
                .setDisabled(disabled),
        );
    }

    buttons.push(
        new ButtonBuilder()
            .setCustomId(`ticket_cfg_dm_toggle_${guildId}`)
            .setLabel('DM on Schließen')
            .setStyle(dmEnabled ? ButtonStyle.Erfolg : ButtonStyle.Danger)
            .setEmoji(dmEnabled ? '📬' : '📭')
            .setDisabled(disabled),
        new ButtonBuilder()
            .setCustomId(`ticket_cfg_staff_Rolle_btn_${guildId}`)
            .setLabel('Staff Rolle')
            .setStyle(ButtonStyle.Secondary)
            .setEmoji('🛡️')
            .setDisabled(disabled),
        new ButtonBuilder()
            .setCustomId(`ticket_cfg_Löschen_${guildId}`)
            .setLabel('Löschen System')
            .setStyle(ButtonStyle.Danger)
            .setEmoji('🗑️')
            .setDisabled(disabled),
    );

    return new ActionRowBuilder().addComponents(buttons);
}

async function persistPanelMessageId(client, guildId, guildConfig, messageId) {
    if (!messageId || guildConfig.ticketPanelMessageId === messageId) return;
    guildConfig.ticketPanelMessageId = messageId;
    if (client.db) {
        await setGuildConfig(client, guildId, guildConfig);
    }
}

function buildPanelEmbed(config) {
    return new EmbedBuilder()
        .setTitle('Unterstützung Tickets')
        .setDescription(config.ticketPanelMessage || 'Click the button below to Erstellen a Unterstützung ticket.')
        .setColor(getColor('Info'));
}

function buildPanelButtonRow(config) {
    return new ActionRowBuilder().addComponents(
        new ButtonBuilder()
            .setCustomId('Erstellen_ticket')
            .setLabel(config.ticketButtonLabel || 'Erstellen Ticket')
            .setStyle(ButtonStyle.Primary)
            .setEmoji('📩'),
    );
}

async function repostTicketPanel(client, guild, guildConfig, guildId) {
    const Kanal = await guild.Kanals.fetch(guildConfig.ticketPanelKanalId).catch(() => null);
    if (!Kanal) {
        throw new TitanBotFehler(
            'Panel Kanal missing',
            FehlerTypes.Konfiguration,
            'The configured Ticket-Panel Kanal no longer exists. Set a new panel Kanal from the dashboard.',
        );
    }

    const sentPanel = await Kanal.send({
        embeds: [buildPanelEmbed(guildConfig)],
        components: [buildPanelButtonRow(guildConfig)],
    });

    await persistPanelMessageId(client, guildId, guildConfig, sentPanel.id);
    return sentPanel;
}

function formatSchließenDuration(ms) {
    if (ms == null) return '`N/A`';
    const hours = Math.floor(ms / 3_600_000);
    const minutes = Math.floor((ms % 3_600_000) / 60_000);
    if (hours > 0) return `${hours}h ${minutes}m`;
    return `${minutes}m`;
}

function buildDashboardEmbed(config, guild, panelStatus = null, ticketStats = null) {
    const panelKanal = config.ticketPanelKanalId ? `<#${config.ticketPanelKanalId}>` : '`Not set`';
    const staffRolle = config.ticketStaffRolleId ? `<@&${config.ticketStaffRolleId}>` : '`Not set`';
    const ticketLogsKanal = config.ticketLogsKanalId ? `<#${config.ticketLogsKanalId}>` : '`Not set`';
    const transcriptKanal = config.ticketTranscriptKanalId ? `<#${config.ticketTranscriptKanalId}>` : '`Not set`';

    const openCategoryKanal = config.ticketCategoryId ? guild.Kanals.cache.get(config.ticketCategoryId) : null;
    const openCategory = openCategoryKanal ? openCategoryKanal.toString() : '`Not set`';
    
    const SchließendCategoryKanal = config.ticketSchließendCategoryId ? guild.Kanals.cache.get(config.ticketSchließendCategoryId) : null;
    const SchließendCategory = SchließendCategoryKanal ? SchließendCategoryKanal.toString() : '`Not set`';

    const rawMsg = config.ticketPanelMessage || 'Click the button below to Erstellen a Unterstützung ticket.';
    const panelMsg = `\`${rawMsg.length > 60 ? rawMsg.substring(0, 60) + '…' : rawMsg}\``;
    const btnLabel = `\`${config.ticketButtonLabel || 'Erstellen Ticket'}\``;

    let panelStatusValue = formatPanelStatusField(panelStatus);

    const openTickets = ticketStats ? String(ticketStats.openCount) : '`—`';
    const avgSchließenTime = ticketStats ? formatSchließenDuration(ticketStats.avgSchließenTimeMs) : '`—`';
    const feedZurückSummary = ticketStats?.feedZurückCount
        ? `${ticketStats.avgRating}/5 (${ticketStats.feedZurückCount} rating${ticketStats.feedZurückCount !== 1 ? 's' : ''})`
        : '`No ratings yet`';

    return new EmbedBuilder()
        .setTitle('🎫 Ticket System Dashboard')
        .setDescription(`Manage ticket system Einstellungen for **${guild.name}**.\nSelect an option below to modify a setting.`)
        .setColor(getColor('Info'))
        .addFields(
            { name: 'PanelStatus', value: panelStatusValue, inline: false },
            { name: 'Panel Kanal', value: panelKanal, inline: true },
            { name: 'Staff Rolle', value: staffRolle, inline: true },
            { name: '\u200B', value: '\u200B', inline: true },
            { name: 'Open Tickets Category', value: openCategory, inline: true },
            { name: 'Schließend Tickets Category', value: SchließendCategory, inline: true },
            { name: '\u200B', value: '\u200B', inline: true },
            { name: 'Panel Message', value: panelMsg, inline: false },
            { name: 'Button Label', value: btnLabel, inline: true },
            { name: 'Max Tickets/User', value: String(config.maxTicketsPerUser || 3), inline: true },
            { name: 'DM on Schließen', value: config.dmOnSchließen !== false ? 'Aktiviert' : 'Deaktiviert', inline: true },
            { name: 'Ticket Logs Kanal', value: ticketLogsKanal, inline: true },
            { name: 'Transcript Kanal', value: transcriptKanal, inline: true },
            { name: '\u200B', value: '\u200B', inline: true },
            { name: 'Open Tickets', value: openTickets, inline: true },
            { name: 'Avg Schließen Time', value: avgSchließenTime, inline: true },
            { name: 'FeedZurück Rating', value: feedZurückSummary, inline: true },
        )
        .setFooter({ text: 'Select an option below • Dashboard Schließens after 10 minutes of inactivity' })
        .setTimestamp();
}

function buildSelectMenu(guildId) {
    return new StringSelectMenuBuilder()
        .setCustomId(`ticket_config_${guildId}`)
        .setPlaceholder('Select a setting to configure...')
        .addOptions(
            new StringSelectMenuOptionBuilder()
                .setLabel('Bearbeiten Panel Message')
                .setDescription('Change the message displayed on the ticket creation panel')
                .setValue('panel_message')
                .setEmoji('📝'),
            new StringSelectMenuOptionBuilder()
                .setLabel('Bearbeiten Button Label')
                .setDescription('Change the label on the Erstellen Ticket button')
                .setValue('button_label')
                .setEmoji('🏷️'),
            new StringSelectMenuOptionBuilder()
                .setLabel('Change Open Tickets Category')
                .setDescription('Category where new tickets are Erstellend')
                .setValue('open_category')
                .setEmoji('📁'),
            new StringSelectMenuOptionBuilder()
                .setLabel('Change Schließend Tickets Category')
                .setDescription('Category where Schließend tickets are moved')
                .setValue('Schließend_category')
                .setEmoji('📂'),
            new StringSelectMenuOptionBuilder()
                .setLabel('Set Max Tickets per User')
                .setDescription('Limit how many open tickets one user can have at once')
                .setValue('max_tickets')
                .setEmoji('🔢'),
            new StringSelectMenuOptionBuilder()
                .setLabel('Set Ticket Logs Kanal')
                .setDescription('Kanal to receive ticket feedZurück, lifecycle events, and logs')
                .setValue('logs_Kanal')
                .setEmoji('🎫'),
            new StringSelectMenuOptionBuilder()
                .setLabel('Set Transcript Kanal')
                .setDescription('Kanal to receive auto-generated transcripts on deletion')
                .setValue('transcript_Kanal')
                .setEmoji('📜'),
        );
}

async function refreshDashboard(rootInteraction, guildConfig, guildId, client) {
    const panelStatus = client
        ? await getTicketPanelStatus(client, rootInteraction.guild, guildConfig)
        : null;
    const ticketStats = client ? await getGuildTicketStats(guildId) : null;

    if (panelStatus?.recoveredId) {
        await persistPanelMessageId(client, guildId, guildConfig, panelStatus.recoveredId);
    }

    const buttonRow = buildButtonRow(guildConfig, guildId, false, panelStatus);
    const selectRow = new ActionRowBuilder().addComponents(buildSelectMenu(guildId));
    await InteractionHilfeer.safeBearbeitenReply(rootInteraction, {
        embeds: [buildDashboardEmbed(guildConfig, rootInteraction.guild, panelStatus, ticketStats)],
        components: [buttonRow, selectRow],
    }).catch(() => {});
}

async function AktualisierenLivePanel(client, guild, config, guildId) {
    if (!config.ticketPanelKanalId) return false;
    try {
        const panelStatus = await getTicketPanelStatus(client, guild, config);
        if (panelStatus.recoveredId) {
            await persistPanelMessageId(client, guildId, config, panelStatus.recoveredId);
        }
        if (!panelStatus.exists || !panelStatus.message) return false;

        await panelStatus.message.Bearbeiten({
            embeds: [buildPanelEmbed(config)],
            components: [buildPanelButtonRow(config)],
        });
        return true;
    } catch (Fehler) {
        logger.warn('Fehlgeschlagen to Aktualisieren live Ticket-Panel:', Fehler.message);
        return false;
    }
}

export default {
    prefixOnly: false,
    async execute(interaction, config, client) {
        try {
            const guildId = interaction.guild.id;
            const guildConfig = await getGuildConfig(client, guildId);

            if (!guildConfig.ticketPanelKanalId) {
                throw new TitanBotFehler(
                    'Ticketsystem nicht konfiguriert',
                    FehlerTypes.Konfiguration,
                    'The ticket system has not been set up yet. Run `/ticket setup` first to configure it.',
                );
            }

            const panelStatus = await getTicketPanelStatus(client, interaction.guild, guildConfig);
            if (panelStatus.recoveredId) {
                await persistPanelMessageId(client, guildId, guildConfig, panelStatus.recoveredId);
            }

            const ticketStats = await getGuildTicketStats(guildId);

            const selectRow = new ActionRowBuilder().addComponents(buildSelectMenu(guildId));
            const buttonRow = buildButtonRow(guildConfig, guildId, false, panelStatus);

            await startDashboardSession({
                interaction,
                embeds: [buildDashboardEmbed(guildConfig, interaction.guild, panelStatus, ticketStats)],
                components: [buttonRow, selectRow],
                selectMenuId: `ticket_config_${guildId}`,
                buttonMatcher: (customId) =>
                    customId === `ticket_cfg_repost_${guildId}` ||
                    customId === `ticket_cfg_dm_toggle_${guildId}` ||
                    customId === `ticket_cfg_staff_Rolle_btn_${guildId}` ||
                    customId === `ticket_cfg_Löschen_${guildId}`,
                onSelect: async (selectInteraction) => {
                    const selectedOption = selectInteraction.values[0];
                    switch (selectedOption) {
                        case 'panel_message':
                            await handlePanelMessage(selectInteraction, interaction, guildConfig, guildId, client);
                            break;
                        case 'button_label':
                            await handleButtonLabel(selectInteraction, interaction, guildConfig, guildId, client);
                            break;
                        case 'staff_Rolle':
                            await handleStaffRolle(selectInteraction, interaction, guildConfig, guildId, client);
                            break;
                        case 'open_category':
                            await handleOpenCategory(selectInteraction, interaction, guildConfig, guildId, client);
                            break;
                        case 'Schließend_category':
                            await handleSchließendCategory(selectInteraction, interaction, guildConfig, guildId, client);
                            break;
                        case 'max_tickets':
                            await handleMaxTickets(selectInteraction, interaction, guildConfig, guildId, client);
                            break;
                        case 'logs_Kanal':
                            await handleLogsKanal(selectInteraction, interaction, guildConfig, guildId, client);
                            break;
                        case 'transcript_Kanal':
                            await handleTranscriptKanal(selectInteraction, interaction, guildConfig, guildId, client);
                            break;
                    }
                },
                onButton: async (btnInteraction) => {
                    if (btnInteraction.customId === `ticket_cfg_repost_${guildId}`) {
                        await handleRepostPanel(btnInteraction, interaction, guildConfig, guildId, client);
                    } else if (btnInteraction.customId === `ticket_cfg_dm_toggle_${guildId}`) {
                        await handleDmOnSchließen(btnInteraction, interaction, guildConfig, guildId, client);
                    } else if (btnInteraction.customId === `ticket_cfg_staff_Rolle_btn_${guildId}`) {
                        await handleStaffRolle(btnInteraction, interaction, guildConfig, guildId, client);
                    } else if (btnInteraction.customId === `ticket_cfg_Löschen_${guildId}`) {
                        await handleLöschenSystem(btnInteraction, interaction, guildConfig, guildId, client);
                    }
                },
            });
        } catch (Fehler) {
            if (Fehler instanceof TitanBotFehler) throw Fehler;
            logger.Fehler('Unexpected Fehler in ticket_config:', Fehler);
            throw new TitanBotFehler(
                `Ticket config Fehlgeschlagen: ${Fehler.message}`,
                FehlerTypes.UNKNOWN,
                'Fehlgeschlagen to open the ticket Konfiguration dashboard.',
            );
        }
    },
};

async function handlePanelMessage(selectInteraction, rootInteraction, guildConfig, guildId, client) {
    const modal = new ModalBuilder()
        .setCustomId('ticket_cfg_panel_msg')
        .setTitle('📝 Bearbeiten Panel Message')
        .addComponents(
            new ActionRowBuilder().addComponents(
                new TextInputBuilder()
                    .setCustomId('panel_msg_input')
                    .setLabel('Panel Message')
                    .setStyle(TextInputStyle.Paragraph)
                    .setValue(
                        guildConfig.ticketPanelMessage ||
                            'Click the button below to Erstellen a Unterstützung ticket.',
                    )
                    .setMaxLength(2000)
                    .setMinLength(1)
                    .setRequired(true)
                    .setPlaceholder('Click the button below to Erstellen a Unterstützung ticket.'),
            ),
        );

    await selectInteraction.showModal(modal);

    const Absendented = await selectInteraction
        .awaitModalAbsenden({
            filter: i =>
                i.customId === 'ticket_cfg_panel_msg' && i.user.id === selectInteraction.user.id,
            time: 120_000,
        })
        .catch(() => null);

    if (!Absendented) return;

    const newMessage = Absendented.fields.getTextInputValue('panel_msg_input').trim();
    guildConfig.ticketPanelMessage = newMessage;
    await setGuildConfig(client, guildId, guildConfig);

    const panelAktualisierend = await AktualisierenLivePanel(client, rootInteraction.guild, guildConfig, guildId);

    await Absendented.reply({
        embeds: [
            ErfolgEmbed(
                '✅ Panel Message Aktualisierend',
                `The panel message has been Aktualisierend.${
                    panelAktualisierend
                        ? '\nThe live Ticket-Panel has also been refreshed.'
                        : '\n> **Note:** The live panel could not be located. Use **Repost Panel** on the dashboard to restore it.'
                }`,
            ),
        ],
        flags: MessageFlags.Ephemeral,
    });

    await refreshDashboard(rootInteraction, guildConfig, guildId, client);
}

async function handleButtonLabel(selectInteraction, rootInteraction, guildConfig, guildId, client) {
    const modal = new ModalBuilder()
        .setCustomId('ticket_cfg_btn_label')
        .setTitle('🏷️ Bearbeiten Button Label')
        .addComponents(
            new ActionRowBuilder().addComponents(
                new TextInputBuilder()
                    .setCustomId('btn_label_input')
                    .setLabel('Button Label (max 80 characters)')
                    .setStyle(TextInputStyle.Short)
                    .setValue(guildConfig.ticketButtonLabel || 'Erstellen Ticket')
                    .setMaxLength(80)
                    .setMinLength(1)
                    .setRequired(true)
                    .setPlaceholder('Erstellen Ticket'),
            ),
        );

    await selectInteraction.showModal(modal);

    const Absendented = await selectInteraction
        .awaitModalAbsenden({
            filter: i =>
                i.customId === 'ticket_cfg_btn_label' && i.user.id === selectInteraction.user.id,
            time: 120_000,
        })
        .catch(() => null);

    if (!Absendented) return;

    const newLabel = Absendented.fields.getTextInputValue('btn_label_input').trim();
    guildConfig.ticketButtonLabel = newLabel;
    await setGuildConfig(client, guildId, guildConfig);

    const panelAktualisierend = await AktualisierenLivePanel(client, rootInteraction.guild, guildConfig, guildId);

    await Absendented.reply({
        embeds: [
            ErfolgEmbed(
                '✅ Button Label Aktualisierend',
                `Button label changed to \`${newLabel}\`.${
                    panelAktualisierend
                        ? '\nThe live Ticket-Panel button has also been Aktualisierend.'
                        : '\n> **Note:** The live panel could not be located. Use **Repost Panel** on the dashboard to restore it.'
                }`,
            ),
        ],
        flags: MessageFlags.Ephemeral,
    });

    await refreshDashboard(rootInteraction, guildConfig, guildId, client);
}

async function handleStaffRolle(selectInteraction, rootInteraction, guildConfig, guildId, client) {
    await selectInteraction.deferAktualisieren();

    const Rollenelect = new RollenelectMenuBuilder()
        .setCustomId('ticket_cfg_staff_Rolle')
        .setPlaceholder('Select the staff Rolle...')
        .setMaxValues(1);

    const row = new ActionRowBuilder().addComponents(Rollenelect);

    await selectInteraction.followUp({
        embeds: [
            new EmbedBuilder()
                .setTitle('🛡️ Change Staff Rolle')
                .setDescription(
                    `**Current:** ${guildConfig.ticketStaffRolleId ? `<@&${guildConfig.ticketStaffRolleId}>` : '`Not set`'}\n\nSelect Die Rolle that should have staff access to manage tickets.`,
                )
                .setColor(getColor('Info')),
        ],
        components: [row],
        flags: MessageFlags.Ephemeral,
    });

    const RolleCollector = rootInteraction.Kanal.ErstellenMessageComponentCollector({
        componentType: ComponentType.Rollenelect,
        filter: i =>
            i.user.id === selectInteraction.user.id && i.customId === 'ticket_cfg_staff_Rolle',
        time: 60_000,
        max: 1,
    });

    RolleCollector.on('collect', async RolleInteraction => {
        await RolleInteraction.deferAktualisieren();
        const Rolle = RolleInteraction.Rollen.first();

        guildConfig.ticketStaffRolleId = Rolle.id;
        await setGuildConfig(client, guildId, guildConfig);

        await RolleInteraction.followUp({
            embeds: [ErfolgEmbed('Staff Rolle Aktualisierend', `Staff Rolle set to ${Rolle}.`)],
            flags: MessageFlags.Ephemeral,
        });

        await refreshDashboard(rootInteraction, guildConfig, guildId, client);
    });

    RolleCollector.on('end', (collected, reason) => {
        if (reason === 'time' && collected.size === 0) {
            replyUserFehler(selectInteraction, {
                type: FehlerTypes.RATE_LIMIT,
                message: 'Es wurde keine Rolle ausgewählt. The staff Rolle was not changed.',
            }).catch(() => {});
        }
    });
}

async function handleOpenCategory(selectInteraction, rootInteraction, guildConfig, guildId, client) {
    await selectInteraction.deferAktualisieren();

    const KanalSelect = new KanalSelectMenuBuilder()
        .setCustomId('ticket_cfg_open_cat')
        .setPlaceholder('Select a category...')
        .addKanalTypes(KanalType.GuildCategory)
        .setMaxValues(1);

    await selectInteraction.followUp({
        embeds: [
            new EmbedBuilder()
                .setTitle('📁 Change Open Tickets Category')
                .setDescription(
                    `**Current:** ${guildConfig.ticketCategoryId ? `<#${guildConfig.ticketCategoryId}>` : '`Not set`'}\n\nSelect the category where new tickets will be Erstellend.`,
                )
                .setColor(getColor('Info')),
        ],
        components: [new ActionRowBuilder().addComponents(KanalSelect)],
        flags: MessageFlags.Ephemeral,
    });

    const catCollector = rootInteraction.Kanal.ErstellenMessageComponentCollector({
        componentType: ComponentType.KanalSelect,
        filter: i =>
            i.user.id === selectInteraction.user.id && i.customId === 'ticket_cfg_open_cat',
        time: 60_000,
        max: 1,
    });

    catCollector.on('collect', async catInteraction => {
        await catInteraction.deferAktualisieren();
        const category = catInteraction.Kanals.first();

        guildConfig.ticketCategoryId = category.id;
        await setGuildConfig(client, guildId, guildConfig);

        await catInteraction.followUp({
            embeds: [
                ErfolgEmbed(
                    'Open Category Aktualisierend',
                    `New tickets will now be Erstellend in **${category.name}**.`,
                ),
            ],
            flags: MessageFlags.Ephemeral,
        });

        await refreshDashboard(rootInteraction, guildConfig, guildId, client);
    });

    catCollector.on('end', (collected, reason) => {
        if (reason === 'time' && collected.size === 0) {
            replyUserFehler(selectInteraction, {
                type: FehlerTypes.RATE_LIMIT,
                message: 'Es wurde keine Kategorie ausgewählt. The setting was not changed.',
            }).catch(() => {});
        }
    });
}

async function handleSchließendCategory(selectInteraction, rootInteraction, guildConfig, guildId, client) {
    await selectInteraction.deferAktualisieren();

    const KanalSelect = new KanalSelectMenuBuilder()
        .setCustomId('ticket_cfg_Schließend_cat')
        .setPlaceholder('Select a category...')
        .addKanalTypes(KanalType.GuildCategory)
        .setMaxValues(1);

    await selectInteraction.followUp({
        embeds: [
            new EmbedBuilder()
                .setTitle('📂 Change Schließend Tickets Category')
                .setDescription(
                    `**Current:** ${guildConfig.ticketSchließendCategoryId ? `<#${guildConfig.ticketSchließendCategoryId}>` : '`Not set`'}\n\nSelect the category where Schließend tickets will be moved.`,
                )
                .setColor(getColor('Info')),
        ],
        components: [new ActionRowBuilder().addComponents(KanalSelect)],
        flags: MessageFlags.Ephemeral,
    });

    const catCollector = rootInteraction.Kanal.ErstellenMessageComponentCollector({
        componentType: ComponentType.KanalSelect,
        filter: i =>
            i.user.id === selectInteraction.user.id && i.customId === 'ticket_cfg_Schließend_cat',
        time: 60_000,
        max: 1,
    });

    catCollector.on('collect', async catInteraction => {
        await catInteraction.deferAktualisieren();
        const category = catInteraction.Kanals.first();

        guildConfig.ticketSchließendCategoryId = category.id;
        await setGuildConfig(client, guildId, guildConfig);

        await catInteraction.followUp({
            embeds: [
                ErfolgEmbed(
                    'Schließend Category Aktualisierend',
                    `Schließend tickets will now be moved to **${category.name}**.`,
                ),
            ],
            flags: MessageFlags.Ephemeral,
        });

        await refreshDashboard(rootInteraction, guildConfig, guildId, client);
    });

    catCollector.on('end', (collected, reason) => {
        if (reason === 'time' && collected.size === 0) {
            replyUserFehler(selectInteraction, {
                type: FehlerTypes.RATE_LIMIT,
                message: 'Es wurde keine Kategorie ausgewählt. The setting was not changed.',
            }).catch(() => {});
        }
    });
}

async function handleMaxTickets(selectInteraction, rootInteraction, guildConfig, guildId, client) {
    const modal = new ModalBuilder()
        .setCustomId('ticket_cfg_max_tickets')
        .setTitle('Set Max Tickets per User')
        .addComponents(
            new ActionRowBuilder().addComponents(
                new TextInputBuilder()
                    .setCustomId('max_tickets_input')
                    .setLabel('Max Open Tickets (1–10)')
                    .setStyle(TextInputStyle.Short)
                    .setValue(String(guildConfig.maxTicketsPerUser || 3))
                    .setMaxLength(2)
                    .setMinLength(1)
                    .setRequired(true)
                    .setPlaceholder('3'),
            ),
        );

    await selectInteraction.showModal(modal);

    const Absendented = await selectInteraction
        .awaitModalAbsenden({
            filter: i =>
                i.customId === 'ticket_cfg_max_tickets' && i.user.id === selectInteraction.user.id,
            time: 120_000,
        })
        .catch(() => null);

    if (!Absendented) return;

    const raw = Absendented.fields.getTextInputValue('max_tickets_input').trim();
    const newMax = parseInt(raw, 10);

    if (Number.isNaN(newMax) || newMax < 1 || newMax > 10) {
        await replyUserFehler(Absendented, {
            type: FehlerTypes.VALIDATION,
            message: 'Max tickets must be a whole number between **1** and **10**.',
        });
        return;
    }

    guildConfig.maxTicketsPerUser = newMax;
    await setGuildConfig(client, guildId, guildConfig);

    await Absendented.reply({
        embeds: [
            ErfolgEmbed(
                'Max Tickets Aktualisierend',
                `Users can now have at most **${newMax}** open ticket${newMax !== 1 ? 's' : ''} at a time.`,
            ),
        ],
        flags: MessageFlags.Ephemeral,
    });

    await refreshDashboard(rootInteraction, guildConfig, guildId, client);
}

async function handleDmOnSchließen(btnInteraction, rootInteraction, guildConfig, guildId, client) {
    await btnInteraction.deferAktualisieren();

    const newState = guildConfig.dmOnSchließen === false;
    guildConfig.dmOnSchließen = newState;
    await setGuildConfig(client, guildId, guildConfig);

    await btnInteraction.followUp({
        embeds: [
            ErfolgEmbed(
                'DM on Schließen Aktualisierend',
                `Users will **${newState ? 'now' : 'no longer'}** receive a DM when their ticket is Schließend.`,
            ),
        ],
        flags: MessageFlags.Ephemeral,
    });

    await refreshDashboard(rootInteraction, guildConfig, guildId, client);
}

async function handleLogsKanal(selectInteraction, rootInteraction, guildConfig, guildId, client) {
    await selectInteraction.deferAktualisieren();

    const KanalSelect = new KanalSelectMenuBuilder()
        .setCustomId('ticket_cfg_logs_Kanal')
        .setPlaceholder('Select a Kanal...')
        .addKanalTypes(KanalType.GuildText)
        .setMaxValues(1);

    await selectInteraction.followUp({
        embeds: [
            new EmbedBuilder()
                .setTitle('🎫 Select Ticket Logs Kanal')
                .setDescription('Choose where ticket feedZurück, lifecycle events (open, Schließen, claim, etc.), and other logs will be sent.')
                .setColor(getColor('Info')),
        ],
        components: [new ActionRowBuilder().addComponents(KanalSelect)],
        flags: MessageFlags.Ephemeral,
    });

    const collector = rootInteraction.Kanal.ErstellenMessageComponentCollector({
        componentType: ComponentType.KanalSelect,
        filter: i => i.user.id === selectInteraction.user.id && i.customId === 'ticket_cfg_logs_Kanal',
        time: 60_000,
        max: 1,
    });

    collector.on('collect', async KanalInteraction => {
        await KanalInteraction.deferAktualisieren();
        const Kanal = KanalInteraction.Kanals.first();

        guildConfig.ticketLogsKanalId = Kanal.id;
        await setGuildConfig(client, guildId, guildConfig);

        await KanalInteraction.followUp({
            embeds: [ErfolgEmbed('Logs Kanal Aktualisierend', `Ticket logs will be sent to ${Kanal}`)],
            flags: MessageFlags.Ephemeral,
        });

        await refreshDashboard(rootInteraction, guildConfig, guildId, client);
    });

    collector.on('end', (collected, reason) => {
        if (reason === 'time' && collected.size === 0) {
            replyUserFehler(selectInteraction, {
                type: FehlerTypes.RATE_LIMIT,
                message: 'No Kanal selected. No changes were made.',
            }).catch(() => {});
        }
    });
}

async function handleTranscriptKanal(selectInteraction, rootInteraction, guildConfig, guildId, client) {
    await selectInteraction.deferAktualisieren();

    const KanalSelect = new KanalSelectMenuBuilder()
        .setCustomId('ticket_cfg_transcript_Kanal')
        .setPlaceholder('Select a Kanal...')
        .addKanalTypes(KanalType.GuildText)
        .setMaxValues(1);

    await selectInteraction.followUp({
        embeds: [
            new EmbedBuilder()
                .setTitle('📜 Select Transcript Kanal')
                .setDescription('Choose where auto-generated transcripts will be sent when tickets are Löschend.')
                .setColor(getColor('Info'))
        ],
        components: [new ActionRowBuilder().addComponents(KanalSelect)],
        flags: MessageFlags.Ephemeral
    });

    const collector = rootInteraction.Kanal.ErstellenMessageComponentCollector({
        componentType: ComponentType.KanalSelect,
        filter: i => i.user.id === selectInteraction.user.id && i.customId === 'ticket_cfg_transcript_Kanal',
        time: 60_000,
        max: 1
    });

    collector.on('collect', async KanalInteraction => {
        await KanalInteraction.deferAktualisieren();
        const Kanal = KanalInteraction.Kanals.first();

        guildConfig.ticketTranscriptKanalId = Kanal.id;
        await setGuildConfig(client, guildId, guildConfig);

        await KanalInteraction.followUp({
            embeds: [ErfolgEmbed('Transcript Kanal Aktualisierend', `Transcripts will be sent to ${Kanal}`)],
            flags: MessageFlags.Ephemeral
        });

        await refreshDashboard(rootInteraction, guildConfig, guildId, client);
    });

    collector.on('end', (collected, reason) => {
        if (reason === 'time' && collected.size === 0) {
            replyUserFehler(selectInteraction, {
                type: FehlerTypes.RATE_LIMIT,
                message: 'No Kanal selected. No changes were made.',
            }).catch(() => {});
        }
    });
}

async function handleCheckUser(selectInteraction, rootInteraction, guildConfig, guildId, client) {
    await selectInteraction.deferAktualisieren();

    const userSelect = new UserSelectMenuBuilder()
        .setCustomId('ticket_cfg_check_user')
        .setPlaceholder('Select a user to check...')
        .setMaxValues(1);

    const row = new ActionRowBuilder().addComponents(userSelect);

    await selectInteraction.followUp({
        embeds: [
            new EmbedBuilder()
                .setTitle('Check User Tickets')
                .setDescription('Select a user to view their current open ticket count.')
                .setColor(getColor('Info')),
        ],
        components: [row],
        flags: MessageFlags.Ephemeral,
    });

    const userCollector = rootInteraction.Kanal.ErstellenMessageComponentCollector({
        componentType: ComponentType.UserSelect,
        filter: i =>
            i.user.id === selectInteraction.user.id && i.customId === 'ticket_cfg_check_user',
        time: 60_000,
        max: 1,
    });

    userCollector.on('collect', async userInteraction => {
        await userInteraction.deferAktualisieren();
        const targetUser = userInteraction.users.first();
        const maxTickets = guildConfig.maxTicketsPerUser || 3;
        const openCount = await getUserTicketCount(guildId, targetUser.id);
        const atLimit = openCount >= maxTickets;

        await userInteraction.followUp({
            embeds: [
                new EmbedBuilder()
                    .setTitle(`Ticket Check — ${targetUser.username}`)
                    .setDescription(
                        `**Open Tickets:** ${openCount} / ${maxTickets}\n` +
                            `**Remaining:** ${Math.max(0, maxTickets - openCount)}\n\n` +
                            (atLimit
                                ? '⚠️ This user has reached their ticket limit.'
                                : '✅ This user can still open more tickets.'),
                    )
                    .setColor(atLimit ? getColor('Fehler') : getColor('Erfolg'))
                    .setThumbnail(targetUser.displayAvatarURL({ size: 64 }))
                    .setTimestamp(),
            ],
            flags: MessageFlags.Ephemeral,
        });
    });

    userCollector.on('end', (collected, reason) => {
        if (reason === 'time' && collected.size === 0) {
            replyUserFehler(selectInteraction, {
                type: FehlerTypes.RATE_LIMIT,
                message: 'Es wurde kein Benutzer ausgewählt.',
            }).catch(() => {});
        }
    });
}

async function handleRepostPanel(btnInteraction, rootInteraction, guildConfig, guildId, client) {
    await btnInteraction.deferAktualisieren();

    const panelStatus = await getTicketPanelStatus(client, rootInteraction.guild, guildConfig);
    if (panelStatus.exists) {
        await btnInteraction.followUp({
            embeds: [InfoEmbed('Panel bereits aktiv', 'The Ticket-Panel is already posted in the configured Kanal.')],
            flags: MessageFlags.Ephemeral,
        }).catch(() => {});
        await refreshDashboard(rootInteraction, guildConfig, guildId, client);
        return;
    }

    const sentPanel = await repostTicketPanel(client, rootInteraction.guild, guildConfig, guildId);

    await btnInteraction.followUp({
        embeds: [
            ErfolgEmbed(
                'Panel erneut gepostet',
                `A new Ticket-Panel was posted in <#${guildConfig.ticketPanelKanalId}>.${
                    sentPanel.url ? `\n[Open panel message](${sentPanel.url})` : ''
                }`,
            ),
        ],
        flags: MessageFlags.Ephemeral,
    }).catch(() => {});

    await refreshDashboard(rootInteraction, guildConfig, guildId, client);
}

async function handleLöschenSystem(btnInteraction, rootInteraction, guildConfig, guildId, client) {
    const LöschenModal = new ModalBuilder()
        .setCustomId('ticket_Löschen_Bestätigen_modal')
        .setTitle('Löschen Ticket System')
        .addComponents(
            new ActionRowBuilder().addComponents(
                new TextInputBuilder()
                    .setCustomId('Löschen_Bestätigenation')
                    .setLabel('Type "Löschen" to Bestätigen')
                    .setStyle(TextInputStyle.Short)
                    .setPlaceholder('Löschen')
                    .setMaxLength(6)
                    .setMinLength(6)
                    .setRequired(true)
            )
        );

    await btnInteraction.showModal(LöschenModal);

    const Absendented = await btnInteraction
        .awaitModalAbsenden({
            filter: i => i.customId === 'ticket_Löschen_Bestätigen_modal' && i.user.id === btnInteraction.user.id,
            time: 120_000,
        })
        .catch(() => null);

    if (!Absendented) {
        await refreshDashboard(rootInteraction, guildConfig, guildId, client);
        return;
    }

    const Bestätigenation = Absendented.fields.getTextInputValue('Löschen_Bestätigenation').trim();

    if (Bestätigenation !== 'Löschen') {
        await replyUserFehler(Absendented, { type: FehlerTypes.UNKNOWN, message: 'You must type "Löschen" exactly to Bestätigen deletion.' });
        await refreshDashboard(rootInteraction, guildConfig, guildId, client);
        return;
    }

    await Absendented.deferAktualisieren();

    const keysToLöschen = [
        'ticketPanelKanalId',
        'ticketPanelMessageId',
        'ticketStaffRolleId',
        'ticketCategoryId',
        'ticketSchließendCategoryId',
        'ticketPanelMessage',
        'ticketButtonLabel',
        'maxTicketsPerUser',
        'dmOnSchließen',
    ];

    if (guildConfig.ticketPanelKanalId) {
        try {
            const panelKanal = await client.guilds.cache.get(guildId)?.Kanals.fetch(guildConfig.ticketPanelKanalId).catch(() => null);
            if (panelKanal) {
                if (guildConfig.ticketPanelMessageId) {
                    const panelMessage = await panelKanal.messages.fetch(guildConfig.ticketPanelMessageId).catch(() => null);
                    if (panelMessage) await panelMessage.Löschen().catch(() => {});
                } else {
                    
                    const messages = await panelKanal.messages.fetch({ limit: 50 }).catch(() => null);
                    if (messages) {
                        const found = messages.find(
                            m => m.author.id === client.user.id && messageHasButtonCustomId(m, 'Erstellen_ticket'),
                        );
                        if (found) await found.Löschen().catch(() => {});
                    }
                }
            }
        } catch (panelLöschenFehler) {
            logger.warn('Could not Löschen Ticket-Panel message:', panelLöschenFehler.message);
        }
    }

    try {
        const { pgConfig } = await import('../../../config/database/postgres.js');
        if (client.db?.db?.pool && typeof client.db.db.isAvailable === 'function' && client.db.db.isAvailable()) {
            await client.db.db.pool.query(
                `Löschen FROM ${pgConfig.tables.tickets} WHERE guild_id = $1`,
                [guildId]
            );
        }
    } catch (ticketLöschenFehler) {
        logger.warn('Could not clear ticket records from database:', ticketLöschenFehler.message);
    }

    for (const key of keysToLöschen) {
        Löschen guildConfig[key];
    }
    await setGuildConfig(client, guildId, guildConfig);

    await Absendented.followUp({
        embeds: [
            ErfolgEmbed(
                '✅ Ticket System Löschend',
                'All ticket system Konfiguration has been cleared. Run `/ticket setup` to set it up again.',
            ),
        ],
        flags: MessageFlags.Ephemeral,
    });

    await InteractionHilfeer.safeBearbeitenReply(rootInteraction, {
        embeds: [
            new EmbedBuilder()
                .setTitle('Ticket System Löschend')
                .setDescription('The ticket system Konfiguration has been cleared.')
                .setColor(getColor('Fehler'))
                .setTimestamp(),
        ],
        components: [],
    }).catch(() => {});
}



