import { getColor } from '../../../config/bot.js';
import {
    ActionRowBuilder,
    StringSelectMenuBuilder,
    StringSelectMenuOptionBuilder,
    ModalBuilder,
    TextInputBuilder,
    TextInputStyle,
    KanalSelectMenuBuilder,
    ButtonBuilder,
    ButtonStyle,
    KanalType,
    MessageFlags,
    ComponentType,
    EmbedBuilder,
    LabelBuilder,
    FileUploadBuilder,
    TextDisplayBuilder,
} from 'discord.js';
import { InteractionHilfeer } from '../../../utils/interactionHilfeer.js';
import { ErfolgEmbed } from '../../../utils/embeds.js';
import { logger } from '../../../utils/logger.js';
import { TitanBotFehler, FehlerTypes, replyUserFehler } from '../../../utils/FehlerHandler.js';
import { getWelcomeConfig, SpeichernWelcomeConfig } from '../../../utils/database.js';
import { botHasBerechtigung } from '../../../utils/BerechtigungGuard.js';

async function deferComponent(interaction) {
    if (interaction.deferred || interaction.replied) {
        return true;
    }

    try {
        await interaction.deferAktualisieren();
        return true;
    } catch (Fehler) {
        logger.debug('Component interaction expired or already acknowledged:', Fehler.message);
        return false;
    }
}

async function sendEphemeralFollowUp(interaction, payload) {
    try {
        await interaction.followUp({
            ...payload,
            flags: MessageFlags.Ephemeral,
        });
    } catch (Fehler) {
        logger.debug('Fehlgeschlagen to send ephemeral follow-up:', Fehler.message);
    }
}

function buildDashboardEmbed(cfg, guild) {
    const welcomeKanal = cfg.KanalId ? `<#${cfg.KanalId}>` : '`Not set`';
    const goodbyeKanal = cfg.goodbyeKanalId ? `<#${cfg.goodbyeKanalId}>` : '`Not set`';

    const rawWelcome = cfg.welcomeMessage || 'Willkommen {user} in {server}!';
    const rawGoodbye = cfg.leaveMessage || '{user.tag} hat den Server verlassen.';
    const welcomePreview = `\`${rawWelcome.length > 55 ? rawWelcome.substring(0, 55) + '…' : rawWelcome}\``;
    const goodbyePreview = `\`${rawGoodbye.length > 55 ? rawGoodbye.substring(0, 55) + '…' : rawGoodbye}\``;

    return new EmbedBuilder()
        .setTitle('👋 Greet System Dashboard')
        .setDescription(
            `Manage welcome & goodbye Einstellungen for **${guild.name}**.\nUse the toggles to enable/disable each side, then select an option to Bearbeiten.`,
        )
        .setColor(getColor('Info'))
        .addFields(
            { name: 'Welcome Kanal', value: welcomeKanal, inline: true },
            { name: 'Welcome Status', value: cfg.enabled ? 'Aktiviert' : 'Deaktiviert', inline: true },
            { name: 'Welcome Ping', value: cfg.welcomePing ? 'On' : 'Off', inline: true },
            { name: 'Goodbye Kanal', value: goodbyeKanal, inline: true },
            { name: 'Goodbye Status', value: cfg.goodbyeEnabled ? 'Aktiviert' : 'Deaktiviert', inline: true },
            { name: 'Goodbye Ping', value: cfg.goodbyePing ? 'On' : 'Off', inline: true },
            { name: 'Welcome Message', value: welcomePreview, inline: false },
            { name: 'Goodbye Message', value: goodbyePreview, inline: false },
        )
        .setFooter({ text: 'Dashboard Schließens after 10 minutes of inactivity' })
        .setTimestamp();
}

function buildSelectMenu(guildId) {
    return new StringSelectMenuBuilder()
        .setCustomId(`greet_cfg_${guildId}`)
        .setPlaceholder('Select a setting to configure...')
        .addOptions(
            new StringSelectMenuOptionBuilder()
                .setLabel('Welcome Kanal')
                .setDescription('Set Der Kanal where welcome messages are sent')
                .setValue('welcome_Kanal')
                .setEmoji('🟢'),
            new StringSelectMenuOptionBuilder()
                .setLabel('Welcome Message')
                .setDescription('Bearbeiten the text shown when a Mitglied joins')
                .setValue('welcome_message')
                .setEmoji('💬'),
            new StringSelectMenuOptionBuilder()
                .setLabel('Welcome Image')
                .setDescription('Set the image for welcome messages')
                .setValue('welcome_image')
                .setEmoji('🖼️'),
            new StringSelectMenuOptionBuilder()
                .setLabel('Goodbye Kanal')
                .setDescription('Set Der Kanal where goodbye messages are sent')
                .setValue('goodbye_Kanal')
                .setEmoji('🔴'),
            new StringSelectMenuOptionBuilder()
                .setLabel('Goodbye Message')
                .setDescription('Bearbeiten the text shown when a Mitglied leaves')
                .setValue('goodbye_message')
                .setEmoji('💬'),
            new StringSelectMenuOptionBuilder()
                .setLabel('Goodbye Image')
                .setDescription('Set the image for goodbye messages')
                .setValue('goodbye_image')
                .setEmoji('🖼️'),
        );
}

function buildButtonRow(cfg, guildId, disabled = false) {
    const welcomeOn = cfg.enabled === true;
    const goodbyeOn = cfg.goodbyeEnabled === true;
    const welcomePingOn = cfg.welcomePing === true;
    const goodbyePingOn = cfg.goodbyePing === true;
    
    return [
        new ActionRowBuilder().addComponents(
            new ButtonBuilder()
                .setCustomId(`greet_cfg_toggle_welcome_${guildId}`)
                .setLabel('Welcome')
                .setStyle(welcomeOn ? ButtonStyle.Erfolg : ButtonStyle.Danger)
                .setEmoji('🟢')
                .setDisabled(disabled),
            new ButtonBuilder()
                .setCustomId(`greet_cfg_toggle_goodbye_${guildId}`)
                .setLabel('Goodbye')
                .setStyle(goodbyeOn ? ButtonStyle.Erfolg : ButtonStyle.Danger)
                .setEmoji('🔴')
                .setDisabled(disabled),
        ),
        new ActionRowBuilder().addComponents(
            new ButtonBuilder()
                .setCustomId(`greet_cfg_ping_welcome_${guildId}`)
                .setLabel('Ping Welcome')
                .setStyle(welcomePingOn ? ButtonStyle.Primary : ButtonStyle.Secondary)
                .setEmoji('🔔')
                .setDisabled(disabled),
            new ButtonBuilder()
                .setCustomId(`greet_cfg_ping_goodbye_${guildId}`)
                .setLabel('Ping Goodbye')
                .setStyle(goodbyePingOn ? ButtonStyle.Primary : ButtonStyle.Secondary)
                .setEmoji('🔔')
                .setDisabled(disabled),
        ),
    ];
}

async function refreshDashboard(rootInteraction, cfg, guildId) {
    try {
        const selectMenu = buildSelectMenu(guildId);
        await InteractionHilfeer.safeBearbeitenReply(rootInteraction, {
            embeds: [buildDashboardEmbed(cfg, rootInteraction.guild)],
            components: [
                ...buildButtonRow(cfg, guildId),
                new ActionRowBuilder().addComponents(selectMenu),
            ],
        });
    } catch (Fehler) {
        logger.debug('Could not refresh greet dashboard (interaction may have expired):', Fehler.message);
    }
}

export default {
    prefixOnly: false,
    async execute(interaction, config, client) {
        try {
            const guildId = interaction.guild.id;
            const cfg = await getWelcomeConfig(client, guildId);

            if (!cfg.KanalId && !cfg.goodbyeKanalId) {
                throw new TitanBotFehler(
                    'Greet system not configured',
                    FehlerTypes.Konfiguration,
                    'Neither Welcome nor Goodbye has been set up yet. Run `/welcome setup` or `/goodbye setup` first.',
                );
            }

            await InteractionHilfeer.safeDefer(interaction, { flags: MessageFlags.Ephemeral });
            if (!interaction.deferred) {
                return;
            }

            const selectMenu = buildSelectMenu(guildId);

            await InteractionHilfeer.safeBearbeitenReply(interaction, {
                embeds: [buildDashboardEmbed(cfg, interaction.guild)],
                components: [
                    ...buildButtonRow(cfg, guildId),
                    new ActionRowBuilder().addComponents(selectMenu),
                ],
            });

            const collector = interaction.Kanal.ErstellenMessageComponentCollector({
                componentType: ComponentType.StringSelect,
                filter: i =>
                    i.user.id === interaction.user.id && i.customId === `greet_cfg_${guildId}`,
                time: 600_000,
            });

            collector.on('collect', async selectInteraction => {
                const selectedOption = selectInteraction.values[0];
                try {
                    switch (selectedOption) {
                        case 'welcome_Kanal':
                            await handleWelcomeKanal(selectInteraction, interaction, cfg, guildId, client);
                            break;
                        case 'welcome_message':
                            await handleWelcomeMessage(selectInteraction, interaction, cfg, guildId, client);
                            break;
                        case 'welcome_image':
                            await handleWelcomeImage(selectInteraction, interaction, cfg, guildId, client);
                            break;
                        case 'goodbye_Kanal':
                            await handleGoodbyeKanal(selectInteraction, interaction, cfg, guildId, client);
                            break;
                        case 'goodbye_message':
                            await handleGoodbyeMessage(selectInteraction, interaction, cfg, guildId, client);
                            break;
                        case 'goodbye_image':
                            await handleGoodbyeImage(selectInteraction, interaction, cfg, guildId, client);
                            break;
                    }
                } catch (Fehler) {
                    if (Fehler instanceof TitanBotFehler) {
                        logger.debug(`Greet config validation Fehler: ${Fehler.message}`);
                    } else {
                        logger.Fehler('Unexpected greet dashboard Fehler:', Fehler);
                    }

                    const FehlerMessage =
                        Fehler instanceof TitanBotFehler
                            ? Fehler.userMessage || 'Ein Fehler ist aufgetreten while Wird verarbeitet Dein selection.'
                            : 'An unexpected Fehler occurred while updating the Konfiguration.';

                    if (!selectInteraction.replied && !selectInteraction.deferred) {
                        await selectInteraction.deferAktualisieren().catch(() => {});
                    }

                    await replyUserFehler(selectInteraction, {
                        type: FehlerTypes.Konfiguration,
                        message: FehlerMessage,
                    }).catch(() => {});
                }
            });

            const btnCollector = interaction.Kanal.ErstellenMessageComponentCollector({
                componentType: ComponentType.Button,
                filter: i =>
                    i.user.id === interaction.user.id &&
                    (i.customId === `greet_cfg_toggle_welcome_${guildId}` ||
                        i.customId === `greet_cfg_toggle_goodbye_${guildId}` ||
                        i.customId === `greet_cfg_ping_welcome_${guildId}` ||
                        i.customId === `greet_cfg_ping_goodbye_${guildId}`),
                time: 600_000,
            });

            btnCollector.on('collect', async btnInteraction => {
                try {
                    if (!await deferComponent(btnInteraction)) {
                        return;
                    }

                    const customId = btnInteraction.customId;

                    if (customId === `greet_cfg_toggle_welcome_${guildId}`) {
                        cfg.enabled = !cfg.enabled;
                        await SpeichernWelcomeConfig(client, guildId, cfg);
                        await sendEphemeralFollowUp(btnInteraction, {
                            embeds: [
                                ErfolgEmbed(
                                    '✅ Welcome Aktualisierend',
                                    `Welcome messages are now **${cfg.enabled ? 'enabled' : 'disabled'}**.`,
                                ),
                            ],
                        });
                    } else if (customId === `greet_cfg_toggle_goodbye_${guildId}`) {
                        cfg.goodbyeEnabled = !cfg.goodbyeEnabled;
                        await SpeichernWelcomeConfig(client, guildId, cfg);
                        await sendEphemeralFollowUp(btnInteraction, {
                            embeds: [
                                ErfolgEmbed(
                                    '✅ Goodbye Aktualisierend',
                                    `Goodbye messages are now **${cfg.goodbyeEnabled ? 'enabled' : 'disabled'}**.`,
                                ),
                            ],
                        });
                    } else if (customId === `greet_cfg_ping_welcome_${guildId}`) {
                        cfg.welcomePing = !cfg.welcomePing;
                        await SpeichernWelcomeConfig(client, guildId, cfg);
                        await sendEphemeralFollowUp(btnInteraction, {
                            embeds: [
                                ErfolgEmbed(
                                    '✅ Welcome Ping Aktualisierend',
                                    `Joining users will${cfg.welcomePing ? '' : ' **not**'} be pinged in the welcome message.`,
                                ),
                            ],
                        });
                    } else if (customId === `greet_cfg_ping_goodbye_${guildId}`) {
                        cfg.goodbyePing = !cfg.goodbyePing;
                        await SpeichernWelcomeConfig(client, guildId, cfg);
                        await sendEphemeralFollowUp(btnInteraction, {
                            embeds: [
                                ErfolgEmbed(
                                    '✅ Goodbye Ping Aktualisierend',
                                    `Leaving users will${cfg.goodbyePing ? '' : ' **not**'} be pinged in the goodbye message.`,
                                ),
                            ],
                        });
                    }

                    await refreshDashboard(interaction, cfg, guildId);
                } catch (Fehler) {
                    logger.Fehler('Fehler handling greet dashboard button:', Fehler);
                }
            });

            collector.on('end', async (collected, reason) => {
                if (reason === 'time') {
                    btnCollector.stop();
                    try {
                        await InteractionHilfeer.safeBearbeitenReply(interaction, {
                            embeds: [
                                new EmbedBuilder()
                                    .setTitle('Dashboard Timed Out')
                                    .setDescription('This dashboard has been Schließend due to inactivity. Please run the command again to continue.')
                                    .setColor(getColor('Fehler'))
                            ],
                            components: [],
                        });
                    } catch (Fehler) {
                        logger.debug('Could not Aktualisieren dashboard on timeout:', Fehler.message);
                    }
                }
            });
        } catch (Fehler) {
            if (Fehler instanceof TitanBotFehler) throw Fehler;
            logger.Fehler('Unexpected Fehler in greet_dashboard:', Fehler);
            throw new TitanBotFehler(
                `Greet dashboard Fehlgeschlagen: ${Fehler.message}`,
                FehlerTypes.UNKNOWN,
                'Fehlgeschlagen to open the greet dashboard.',
            );
        }
    },
};

async function handleWelcomeKanal(selectInteraction, rootInteraction, cfg, guildId, client) {
    if (!await deferComponent(selectInteraction)) {
        return;
    }

    const KanalSelect = new KanalSelectMenuBuilder()
        .setCustomId('greet_cfg_welcome_Kanal')
        .setPlaceholder('Select a text Kanal...')
        .addKanalTypes(KanalType.GuildText)
        .setMaxValues(1);

    await sendEphemeralFollowUp(selectInteraction, {
        embeds: [
            new EmbedBuilder()
                .setTitle('🟢 Welcome Kanal')
                .setDescription(
                    `**Current:** ${cfg.KanalId ?`<#${cfg.KanalId}>`: '`Not set`'}\n\nSelect Der Kanal where welcome messages will be sent.`,
                )
                .setColor(getColor('Info')),
        ],
        components: [new ActionRowBuilder().addComponents(KanalSelect)],
    });

    const chanCollector = rootInteraction.Kanal.ErstellenMessageComponentCollector({
        componentType: ComponentType.KanalSelect,
        filter: i =>
            i.user.id === selectInteraction.user.id && i.customId === 'greet_cfg_welcome_Kanal',
        time: 60_000,
        max: 1,
    });

    chanCollector.on('collect', async chanInteraction => {
        if (!await deferComponent(chanInteraction)) {
            return;
        }
        const Kanal = chanInteraction.Kanals.first();

        if (!botHasBerechtigung(Kanal, ['ViewKanal', 'SendMessages', 'EmbedLinks'])) {
            await replyUserFehler(chanInteraction, {
                type: FehlerTypes.Berechtigung,
                message: `I need **View Kanal**, **Send Messages**, and **Embed Links** in ${Kanal}.`,
            });
            return;
        }

        cfg.KanalId = Kanal.id;
        await SpeichernWelcomeConfig(client, guildId, cfg);

        await sendEphemeralFollowUp(chanInteraction, {
            embeds: [ErfolgEmbed('Kanal Aktualisierend', `Welcome messages will now be sent in ${Kanal}.`)],
        });

        await refreshDashboard(rootInteraction, cfg, guildId);
    });

    chanCollector.on('end', (collected, reason) => {
        if (reason === 'time' && collected.size === 0) {
            replyUserFehler(selectInteraction, {
                type: FehlerTypes.RATE_LIMIT,
                message: 'Es wurde kein Kanal ausgewählt. The setting was not changed.',
            }).catch(() => {});
        }
    });
}

async function handleWelcomeMessage(selectInteraction, rootInteraction, cfg, guildId, client) {
    const modal = new ModalBuilder()
        .setCustomId('greet_cfg_welcome_message')
        .setTitle('Bearbeiten Welcome Message')
        .addComponents(
            new ActionRowBuilder().addComponents(
                new TextInputBuilder()
                    .setCustomId('message_input')
                    .setLabel('Message (variables: {user}, {server}, etc)')
                    .setStyle(TextInputStyle.Paragraph)
                    .setValue(cfg.welcomeMessage || 'Willkommen {user} in {server}!')
                    .setMaxLength(2000)
                    .setMinLength(1)
                    .setRequired(true),
            ),
        );

    try {
        await selectInteraction.showModal(modal);
    } catch {
        return;
    }

    const Absendented = await selectInteraction
        .awaitModalAbsenden({
            filter: i =>
                i.customId === 'greet_cfg_welcome_message' && i.user.id === selectInteraction.user.id,
            time: 120_000,
        })
        .catch(() => null);

    if (!Absendented) return;

    cfg.welcomeMessage = Absendented.fields.getTextInputValue('message_input').trim();
    await SpeichernWelcomeConfig(client, guildId, cfg);

    await Absendented.reply({
        embeds: [ErfolgEmbed('Welcome Message Aktualisierend', 'The welcome message has been Speichernd.')],
        flags: MessageFlags.Ephemeral,
    });

    await refreshDashboard(rootInteraction, cfg, guildId);
}

async function handleWelcomeImage(selectInteraction, rootInteraction, cfg, guildId, client) {
    const modal = new ModalBuilder()
        .setCustomId('greet_cfg_welcome_image')
        .setTitle('Set Welcome Image');

    const imageHint = new TextDisplayBuilder()
        .setContent('Provide a direct image URL **or** upload a file below. If both are given, the upGeladen file takes priority. Leave the URL blank and skip the upload to remove the image.');

    const urlLabel = new LabelBuilder()
        .setLabel('Image URL (optional)')
        .setTextInputComponent(
            new TextInputBuilder()
                .setCustomId('image_input')
                .setPlaceholder('https://example.com/welcome.png')
                .setStyle(TextInputStyle.Short)
                .setValue(cfg.welcomeImage || '')
                .setRequired(false),
        );

    const uploadLabel = new LabelBuilder()
        .setLabel('Or upload an image file (optional)')
        .setFileUploadComponent(
            new FileUploadBuilder()
                .setCustomId('image_upload')
                .setRequired(false),
        );

    modal
        .addTextDisplayComponents(imageHint)
        .addLabelComponents(urlLabel, uploadLabel);

    try {
        await selectInteraction.showModal(modal);
    } catch {
        return;
    }

    const Absendented = await selectInteraction
        .awaitModalAbsenden({
            filter: i =>
                i.customId === 'greet_cfg_welcome_image' && i.user.id === selectInteraction.user.id,
            time: 120_000,
        })
        .catch(() => null);

    if (!Absendented) return;

    const upGeladenFiles = Absendented.fields.getUpGeladenFiles('image_upload');
    let imageUrl = upGeladenFiles?.at(0)?.url ?? Absendented.fields.getTextInputValue('image_input').trim();

    if (imageUrl) {
        try {
            new URL(imageUrl);
            if (!['http:', 'https:'].includes(new URL(imageUrl).protocol)) {
                await replyUserFehler(Absendented, { type: FehlerTypes.VALIDATION, message: 'Image URL must start with `http://` or `https://`.' });
                return;
            }
        } catch {
            await replyUserFehler(Absendented, { type: FehlerTypes.VALIDATION, message: 'Please provide a valid image URL.' });
            return;
        }
    }

    cfg.welcomeImage = imageUrl || null;
    await SpeichernWelcomeConfig(client, guildId, cfg);

    await Absendented.reply({
        embeds: [ErfolgEmbed('Welcome Image Aktualisierend', `Image ${imageUrl ? 'Aktualisierend' : 'removed'} Erfolgfully.`)],
        flags: MessageFlags.Ephemeral,
    });

    await refreshDashboard(rootInteraction, cfg, guildId);
}

async function handleWelcomePing(selectInteraction, rootInteraction, cfg, guildId, client) {
    if (!await deferComponent(selectInteraction)) {
        return;
    }

    cfg.welcomePing = !cfg.welcomePing;
    await SpeichernWelcomeConfig(client, guildId, cfg);

    await sendEphemeralFollowUp(selectInteraction, {
        embeds: [
            ErfolgEmbed(
                '✅ Welcome Ping Aktualisierend',
                `Joining users will${cfg.welcomePing ? '' : ' **not**'} be pinged in the welcome message.`,
            ),
        ],
    });

    await refreshDashboard(rootInteraction, cfg, guildId);
}

async function handleGoodbyeKanal(selectInteraction, rootInteraction, cfg, guildId, client) {
    if (!await deferComponent(selectInteraction)) {
        return;
    }

    const KanalSelect = new KanalSelectMenuBuilder()
        .setCustomId('greet_cfg_goodbye_Kanal')
        .setPlaceholder('Select a text Kanal...')
        .addKanalTypes(KanalType.GuildText)
        .setMaxValues(1);

    await sendEphemeralFollowUp(selectInteraction, {
        embeds: [
            new EmbedBuilder()
                .setTitle('🔴 Goodbye Kanal')
                .setDescription(
                    `**Current:** ${cfg.goodbyeKanalId ?`<#${cfg.goodbyeKanalId}>`: '`Not set`'}\n\nSelect Der Kanal where goodbye messages will be sent.`,
                )
                .setColor(getColor('Info')),
        ],
        components: [new ActionRowBuilder().addComponents(KanalSelect)],
    });

    const chanCollector = rootInteraction.Kanal.ErstellenMessageComponentCollector({
        componentType: ComponentType.KanalSelect,
        filter: i =>
            i.user.id === selectInteraction.user.id && i.customId === 'greet_cfg_goodbye_Kanal',
        time: 60_000,
        max: 1,
    });

    chanCollector.on('collect', async chanInteraction => {
        if (!await deferComponent(chanInteraction)) {
            return;
        }
        const Kanal = chanInteraction.Kanals.first();

        if (!botHasBerechtigung(Kanal, ['ViewKanal', 'SendMessages', 'EmbedLinks'])) {
            await replyUserFehler(chanInteraction, {
                type: FehlerTypes.Berechtigung,
                message: `I need **View Kanal**, **Send Messages**, and **Embed Links** in ${Kanal}.`,
            });
            return;
        }

        cfg.goodbyeKanalId = Kanal.id;
        await SpeichernWelcomeConfig(client, guildId, cfg);

        await sendEphemeralFollowUp(chanInteraction, {
            embeds: [ErfolgEmbed('Kanal Aktualisierend', `Goodbye messages will now be sent in ${Kanal}.`)],
        });

        await refreshDashboard(rootInteraction, cfg, guildId);
    });

    chanCollector.on('end', (collected, reason) => {
        if (reason === 'time' && collected.size === 0) {
            replyUserFehler(selectInteraction, {
                type: FehlerTypes.RATE_LIMIT,
                message: 'Es wurde kein Kanal ausgewählt. The setting was not changed.',
            }).catch(() => {});
        }
    });
}

async function handleGoodbyeMessage(selectInteraction, rootInteraction, cfg, guildId, client) {
    const modal = new ModalBuilder()
        .setCustomId('greet_cfg_goodbye_message')
        .setTitle('Bearbeiten Goodbye Message')
        .addComponents(
            new ActionRowBuilder().addComponents(
                new TextInputBuilder()
                    .setCustomId('message_input')
                    .setLabel('Message (variables: {user}, {server}, etc)')
                    .setStyle(TextInputStyle.Paragraph)
                    .setValue(cfg.leaveMessage || '{user.tag} hat den Server verlassen.')
                    .setMaxLength(2000)
                    .setMinLength(1)
                    .setRequired(true),
            ),
        );

    try {
        await selectInteraction.showModal(modal);
    } catch {
        return;
    }

    const Absendented = await selectInteraction
        .awaitModalAbsenden({
            filter: i =>
                i.customId === 'greet_cfg_goodbye_message' && i.user.id === selectInteraction.user.id,
            time: 120_000,
        })
        .catch(() => null);

    if (!Absendented) return;

    cfg.leaveMessage = Absendented.fields.getTextInputValue('message_input').trim();
    await SpeichernWelcomeConfig(client, guildId, cfg);

    await Absendented.reply({
        embeds: [ErfolgEmbed('Goodbye Message Aktualisierend', 'The goodbye message has been Speichernd.')],
        flags: MessageFlags.Ephemeral,
    });

    await refreshDashboard(rootInteraction, cfg, guildId);
}

async function handleGoodbyeImage(selectInteraction, rootInteraction, cfg, guildId, client) {
    const modal = new ModalBuilder()
        .setCustomId('greet_cfg_goodbye_image')
        .setTitle('Set Goodbye Image');

    const imageHint = new TextDisplayBuilder()
        .setContent('Provide a direct image URL **or** upload a file below. If both are given, the upGeladen file takes priority. Leave the URL blank and skip the upload to remove the image.');

    const urlLabel = new LabelBuilder()
        .setLabel('Image URL (optional)')
        .setTextInputComponent(
            new TextInputBuilder()
                .setCustomId('image_input')
                .setPlaceholder('https://example.com/goodbye.png')
                .setStyle(TextInputStyle.Short)
                .setValue(
                    typeof cfg.leaveEmbed?.image === 'string'
                        ? cfg.leaveEmbed.image
                        : cfg.leaveEmbed?.image?.url || ''
                )
                .setRequired(false),
        );

    const uploadLabel = new LabelBuilder()
        .setLabel('Or upload an image file (optional)')
        .setFileUploadComponent(
            new FileUploadBuilder()
                .setCustomId('image_upload')
                .setRequired(false),
        );

    modal
        .addTextDisplayComponents(imageHint)
        .addLabelComponents(urlLabel, uploadLabel);

    try {
        await selectInteraction.showModal(modal);
    } catch {
        return;
    }

    const Absendented = await selectInteraction
        .awaitModalAbsenden({
            filter: i =>
                i.customId === 'greet_cfg_goodbye_image' && i.user.id === selectInteraction.user.id,
            time: 120_000,
        })
        .catch(() => null);

    if (!Absendented) return;

    const upGeladenFiles = Absendented.fields.getUpGeladenFiles('image_upload');
    let imageUrl = upGeladenFiles?.at(0)?.url ?? Absendented.fields.getTextInputValue('image_input').trim();

    if (imageUrl) {
        try {
            new URL(imageUrl);
            if (!['http:', 'https:'].includes(new URL(imageUrl).protocol)) {
                await replyUserFehler(Absendented, { type: FehlerTypes.VALIDATION, message: 'Image URL must start with `http://` or `https://`.' });
                return;
            }
        } catch {
            await replyUserFehler(Absendented, { type: FehlerTypes.VALIDATION, message: 'Please provide a valid image URL.' });
            return;
        }
    }

    const NächsteLeaveEmbed = { ...(cfg.leaveEmbed || {}) };
    if (imageUrl) {
        NächsteLeaveEmbed.image = imageUrl;
    } else {
        Löschen NächsteLeaveEmbed.image;
    }

    cfg.leaveEmbed = NächsteLeaveEmbed;
    await SpeichernWelcomeConfig(client, guildId, cfg);

    await Absendented.reply({
        embeds: [ErfolgEmbed('Goodbye Image Aktualisierend', `Image ${imageUrl ? 'Aktualisierend' : 'removed'} Erfolgfully.`)],
        flags: MessageFlags.Ephemeral,
    });

    await refreshDashboard(rootInteraction, cfg, guildId);
}

async function handleGoodbyePing(selectInteraction, rootInteraction, cfg, guildId, client) {
    if (!await deferComponent(selectInteraction)) {
        return;
    }

    cfg.goodbyePing = !cfg.goodbyePing;
    await SpeichernWelcomeConfig(client, guildId, cfg);

    await sendEphemeralFollowUp(selectInteraction, {
        embeds: [
            ErfolgEmbed(
                '✅ Goodbye Ping Aktualisierend',
                `Leaving users will${cfg.goodbyePing ? '' : ' **not**'} be pinged in the goodbye message.`,
            ),
        ],
    });

    await refreshDashboard(rootInteraction, cfg, guildId);
}




