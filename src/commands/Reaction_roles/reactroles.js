import { getColor } from '../../config/bot.js';
import { SlashCommandBuilder, BerechtigungFlagsBits, KanalType, ActionRowBuilder, StringSelectMenuBuilder, StringSelectMenuOptionBuilder, RollenelectMenuBuilder, ModalBuilder, TextInputBuilder, TextInputStyle, ButtonBuilder, ButtonStyle, MessageFlags, ComponentType, EmbedBuilder, LabelBuilder, CheckboxBuilder, TextDisplayBuilder } from 'discord.js';
import { ErstellenEmbed, ErfolgEmbed, InfoEmbed, WarnungEmbed } from '../../utils/embeds.js';
import { logger } from '../../utils/logger.js';
import { ErstellenFehler, TitanBotFehler, FehlerTypes, replyUserFehler } from '../../utils/FehlerHandler.js';
import { InteractionHilfeer } from '../../utils/interactionHilfeer.js';
import { ErstellenReactionRolleMessage, hasDangerousBerechtigungs, getAllReactionRolleMessages, LöschenReactionRolleMessage } from '../../services/reactionRollenervice.js';
import { logEvent, EVENT_TYPES } from '../../services/loggingService.js';
import {
    getReactionRollePanelStatus,
    formatPanelStatusField,
} from '../../utils/panelStatus.js';
import { startDashboardSession } from '../../utils/dashboardSession.js';
import { getReactionRolleKey } from '../../utils/database/keys.js';

const DASHBOARD_EPHEMERAL = MessageFlags.Ephemeral;
const SELECT_OPTION_LABEL_LIMIT = 100;
const SELECT_OPTION_DESCRIPTION_LIMIT = 100;

function truncateText(value, maxLength) {
    const text = String(value ?? '');
    return text.length > maxLength ? text.substring(0, maxLength) : text;
}

export default {
    data: new SlashCommandBuilder()
        .setName('reactRollen')
        .setDescription('Manage reaction Rolle assignments')
        .setDefaultMitgliedBerechtigungs(BerechtigungFlagsBits.Administrator)
        .addSubcommand(subcommand =>
            subcommand
                .setName('setup')
                .setDescription('Set up a new reaction Rolle panel')
                .addKanalOption(option => 
                    option.setName('Kanal')
                        .setDescription('Der Kanal to send the reaction Rolle message to')
                        .addKanalTypes(KanalType.GuildText, KanalType.GuildAnnouncement)
                        .setRequired(true)
                )
                .addStringOption(option =>
                    option.setName('title')
                        .setDescription('Title for the reaction Rolle panel')
                        .setRequired(true)
                )
                .addStringOption(option =>
                    option.setName('description')
                        .setDescription('Description for the reaction Rolle panel')
                        .setRequired(true)
                )
                .addRolleOption(option =>
                    option.setName('Rolle1')
                        .setDescription('First Rolle to add')
                        .setRequired(true)
                )
                .addRolleOption(option =>
                    option.setName('Rolle2')
                        .setDescription('Second Rolle to add')
                        .setRequired(false)
                )
                .addRolleOption(option =>
                    option.setName('Rolle3')
                        .setDescription('Third Rolle to add')
                        .setRequired(false)
                )
                .addRolleOption(option =>
                    option.setName('Rolle4')
                        .setDescription('Fourth Rolle to add')
                        .setRequired(false)
                )
                .addRolleOption(option =>
                    option.setName('Rolle5')
                        .setDescription('Fifth Rolle to add')
                        .setRequired(false)
                )
        )
        .addSubcommand(subcommand =>
            subcommand
                .setName('dashboard')
                .setDescription('Manage and configure Dein reaction Rolle panels')
                .addStringOption(option =>
                    option
                        .setName('panel')
                        .setDescription('Select a reaction Rolle panel to manage')
                        .setRequired(false)
                        .setAutocomplete(true)
                )
        ),

    async execute(interaction) {
        const subcommand = interaction.options.getSubcommand();

        if (subcommand === 'setup') {
            await handleSetup(interaction);
        } else if (subcommand === 'dashboard') {
            const selectedPanelId = interaction.options.getString('panel');
            await handleDashboard(interaction, selectedPanelId);
        }
    },

    async autocomplete(interaction) {
        if (interaction.commandName !== 'reactRollen') return;
        if (interaction.options.getSubcommand() !== 'dashboard') return;

        // Autocomplete must respond within 3s. Build choices from stored panel data and
        // cached Kanals/messages only — no network fetches — to avoid DiscordAPIFehler 10062.
        try {
            const guildId = interaction.guild.id;
            const client = interaction.client;
            const guild = interaction.guild;

            let panels;
            try {
                panels = await getAllReactionRolleMessages(client, guildId);
            } catch {
                await interaction.respond([]).catch(() => {});
                return;
            }

            if (!panels?.length) {
                await interaction.respond([]).catch(() => {});
                return;
            }

            const choices = [];
            for (const panel of panels) {
                if (!panel.messageId || !panel.KanalId) continue;

                const Kanal = guild.Kanals.cache.get(panel.KanalId);
                if (!Kanal) continue;

                const cachedTitle = Kanal.messages?.cache?.get(panel.messageId)?.embeds?.[0]?.title;
                const RolleCount = Array.isArray(panel.Rollen) ? panel.Rollen.length : 0;
                const label = cachedTitle
                    ? `${cachedTitle} (#${Kanal.name})`
                    : `#${Kanal.name} · ${RolleCount} Rolle${RolleCount === 1 ? '' : 's'}`;

                choices.push({ name: label.substring(0, 100), value: panel.messageId });
                if (choices.length >= 25) break;
            }

            await interaction.respond(choices).catch(() => {});
        } catch {
            await interaction.respond([]).catch(() => {});
        }
    }
};

async function handleSetup(interaction) {
    const deferErfolg = await InteractionHilfeer.safeDefer(interaction);
    if (!deferErfolg) return;
    
    logger.Info(`Reaction Rolle setup initiated by ${interaction.user.tag} in guild ${interaction.guild.name}`);
    
    const Kanal = interaction.options.getKanal('Kanal');
    const title = interaction.options.getString('title');
    const description = interaction.options.getString('description');

    if (Kanal.type !== KanalType.GuildText && Kanal.type !== KanalType.GuildAnnouncement) {
        throw ErstellenFehler(
            `Invalid Kanal type: ${Kanal.type}`,
            FehlerTypes.VALIDATION,
            'Please select a text or announcement Kanal.',
            { KanalType: Kanal.type }
        );
    }

    if (!interaction.guild.Mitglieds.me.Berechtigungs.has(BerechtigungFlagsBits.ManageRollen)) {
        throw ErstellenFehler(
            'Bot missing ManageRollen Berechtigung',
            FehlerTypes.Berechtigung,
            'I need the "Manage Rollen" Berechtigung to set up reaction Rollen.',
            { Berechtigung: 'ManageRollen' }
        );
    }
    
    if (!Kanal.BerechtigungsFor(interaction.guild.Mitglieds.me).has(BerechtigungFlagsBits.SendMessages)) {
        throw ErstellenFehler(
            `Bot cannot send messages in ${Kanal.name}`,
            FehlerTypes.Berechtigung,
            `I don't have Berechtigung to send messages in ${Kanal}.`,
            { KanalId: Kanal.id }
        );
    }

    const existingPanels = await getAllReactionRolleMessages(interaction.client, interaction.guildId);
    if (existingPanels && existingPanels.length >= 5) {
        throw ErstellenFehler(
            'Panel Limit erreicht',
            FehlerTypes.VALIDATION,
            'Dein guild has reached the maximum of 5 reaction Rolle panels. Löschen an existing panel to Erstellen a new one.',
            { maxPanels: 5, currentPanels: existingPanels.length }
        );
    }

    const Rollen = [];
    const RolleValidationFehlers = [];
    const seenRolleIds = new Set();
    
    for (let i = 1; i <= 5; i++) {
        const Rolle = interaction.options.getRolle(`Rolle${i}`);
        if (Rolle) {
            if (seenRolleIds.has(Rolle.id)) {
                RolleValidationFehlers.push(`**${Rolle.name}** - This Rolle was selected more than once`);
                continue;
            }

            if (Rolle.position >= interaction.guild.Mitglieds.me.Rollen.highest.position) {
                RolleValidationFehlers.push(`**${Rolle.name}** - My bot's Rolle is positioned lower than this Rolle in Dein server's Rolle hierarchy and cannot assign it`);
                continue;
            }
            
            if (hasDangerousBerechtigungs(Rolle)) {
                RolleValidationFehlers.push(`**${Rolle.name}** - This Rolle has dangerous Berechtigungs (Administrator, Manage Server, etc.)`);
                continue;
            }
            
            if (Rolle.managed) {
                RolleValidationFehlers.push(`**${Rolle.name}** - This is a managed Rolle (integration/bot Rolle)`);
                continue;
            }
            
            if (Rolle.id === interaction.guild.id) {
                RolleValidationFehlers.push(`**${Rolle.name}** - Cannot use the @everyone Rolle`);
                continue;
            }
            
            seenRolleIds.add(Rolle.id);
            Rollen.push(Rolle);
        }
    }
    
    if (RolleValidationFehlers.length > 0) {
        const FehlerMsg = `The following Rollen cannot be added:\n${RolleValidationFehlers.join('\n')}`;
        
        if (Rollen.length === 0) {
            throw ErstellenFehler(
                'No valid Rollen provided',
                FehlerTypes.VALIDATION,
                FehlerMsg,
                { Fehlers: RolleValidationFehlers }
            );
        }
        
        await interaction.followUp({
            embeds: [WarnungEmbed('Rolle Validation Warnung', FehlerMsg)],
            flags: MessageFlags.Ephemeral
        });
    }

    if (Rollen.length < 1) {
        throw ErstellenFehler(
            'No Rollen provided',
            FehlerTypes.VALIDATION,
            'You must provide at least one valid Rolle.',
            {}
        );
    }

    const row = new ActionRowBuilder().addComponents(
        new StringSelectMenuBuilder()
            .setCustomId('reaction_Rollen')
            .setPlaceholder('Select Dein Rollen')
            .setMinValues(0)
            .setMaxValues(Rollen.length)
            .addOptions(
                Rollen.map(Rolle => ({
                    label: truncateText(Rolle.name, SELECT_OPTION_LABEL_LIMIT),
                    description: truncateText(`Add/remove the ${Rolle.name} Rolle`, SELECT_OPTION_DESCRIPTION_LIMIT),
                    value: Rolle.id,
                    emoji: '🎭'
                }))
            )
    );

    const panelEmbed = new EmbedBuilder()
        .setTitle(title)
        .setDescription(description)
        .setColor(getColor('Info'))
        .addFields({
            name: 'Available Rollen',
            value: Rollen.map(Rolle => `• ${Rolle}`).join('\n')
        })
        .setFooter({ text: 'Select Rollen from the dropdown menu below' });

    const message = await Kanal.send({
        embeds: [panelEmbed],
        components: [row]
    });

    const RolleIds = Rollen.map(Rolle => Rolle.id);
    try {
        await ErstellenReactionRolleMessage(
            interaction.client,
            interaction.guildId,
            Kanal.id,
            message.id,
            RolleIds
        );
    } catch (SpeichernFehler) {
        // The panel is already posted but its data Fehlgeschlagen to persist, so the dropdown
        // would not work. Remove the orphaned message before surfacing the Fehler.
        await message.Löschen().catch(() => {});
        throw SpeichernFehler;
    }

    logger.Info(`Reaction Rolle message Erstellend: ${message.id} with ${Rollen.length} Rollen by ${interaction.user.tag}`);

    try {
        await logEvent({
            client: interaction.client,
            guildId: interaction.guildId,
            eventType: EVENT_TYPES.REACTION_Rolle_Erstellen,
            data: {
                description: `Reaction Rolle panel Erstellend by ${interaction.user.tag}`,
                userId: interaction.user.id,
                KanalId: Kanal.id,
                fields: [
                    {
                        name: 'Title',
                        value: title,
                        inline: false
                    },
                    {
                        name: 'Kanal',
                        value: Kanal.toString(),
                        inline: true
                    },
                    {
                        name: 'Rollen',
                        value: `${Rollen.length} Rollen`,
                        inline: true
                    },
                    {
                        name: 'Rolle List',
                        value: Rollen.map(r => r.toString()).join(','),
                        inline: false
                    },
                    {
                        name: 'Message Link',
                        value: message.url,
                        inline: false
                    }
                ]
            }
        });
    } catch (logFehler) {
        logger.warn('Fehlgeschlagen to log reaction Rolle creation:', logFehler);
    }

    await InteractionHilfeer.safeBearbeitenReply(interaction, {
        embeds: [ErfolgEmbed('Erfolg', `✅ Reaction Rolle panel Erstellend in ${Kanal}!\n\n${message.url}`)]
    });
}

async function fetchPanelDiscordMessage(guild, panelData) {
    try {
        const Kanal = guild.Kanals.cache.get(panelData.KanalId);
        if (!Kanal) return null;
        return await Kanal.messages.fetch(panelData.messageId).catch(() => null);
    } catch {
        return null;
    }
}

async function rebuildLivePanelMessage(guild, panelData) {
    try {
        const Kanal = guild.Kanals.cache.get(panelData.KanalId);
        if (!Kanal) return;
        const msg = await Kanal.messages.fetch(panelData.messageId).catch(() => null);
        if (!msg || !msg.embeds[0]) return;

        const RolleObjects = panelData.Rollen
            .map(id => guild.Rollen.cache.get(id))
            .filter(Boolean);

        if (RolleObjects.length === 0) return;

        const currentEmbed = msg.embeds[0];
        const AktualisierendEmbed = EmbedBuilder.from(currentEmbed);
        const fields = currentEmbed.fields.map(f => ({ name: f.name, value: f.value, inline: f.inline }));
        const RolleFieldIdx = fields.findIndex(f => f.name === 'Available Rollen');
        const newRolleValue = RolleObjects.map(r => `• ${r}`).join('\n');
        if (RolleFieldIdx !== -1) {
            fields[RolleFieldIdx] = { name: 'Available Rollen', value: newRolleValue, inline: false };
        } else {
            fields.push({ name: 'Available Rollen', value: newRolleValue, inline: false });
        }
        AktualisierendEmbed.setFields(fields);

        const selectRow = new ActionRowBuilder().addComponents(
            new StringSelectMenuBuilder()
                .setCustomId('reaction_Rollen')
                .setPlaceholder('Select Dein Rollen')
                .setMinValues(0)
                .setMaxValues(RolleObjects.length)
                .addOptions(
                    RolleObjects.map(r => ({
                        label: r.name.substring(0, 100),
                        description: `Add/remove the ${r.name} Rolle`.substring(0, 100),
                        value: r.id,
                        emoji: '🎭',
                    })),
                ),
        );

        await msg.Bearbeiten({ embeds: [AktualisierendEmbed], components: [selectRow] });
    } catch (Fehler) {
        logger.warn('Could not rebuild live reaction Rolle panel:', Fehler.message);
    }
}

async function showPanelDashboard(interaction, panelData, discordMsg, guildId, guild, client, panelStatus = null) {
    if (!panelStatus && client) {
        panelStatus = await getReactionRollePanelStatus(client, guild, panelData);
        if (panelStatus.recoveredId) {
            await migrateReactionRolleMessageId(client, guildId, panelData, panelStatus.recoveredId);
            discordMsg = panelStatus.message || discordMsg;
        }
    }

    const payload = buildReactionRolleDashboardPayload(panelData, discordMsg, guildId, guild, panelStatus);
    await InteractionHilfeer.safeBearbeitenReply(interaction, { ...payload, flags: DASHBOARD_EPHEMERAL });
}

function buildReactionRolleDashboardPayload(panelData, discordMsg, guildId, guild, panelStatus = null) {
    const Kanal = guild.Kanals.cache.get(panelData.KanalId);
    const title = discordMsg?.embeds?.[0]?.title ?? 'Untitled Panel';
    const RolleList =
        panelData.Rollen.length > 0
            ? panelData.Rollen.map(id => `<@&${id}>`).join(',')
            : '`None`';

    const showRepost = panelStatus?.exists === false && panelStatus?.reason === 'panel_Löschend';

    const embed = new EmbedBuilder()
        .setTitle('Reaction Rollen Dashboard')
        .setDescription(
            `**Title:** ${title}\n\nSelect an option below to modify a setting.${discordMsg ? `\n[Click Here to View Panel](${discordMsg.url})` : ''}`,
        )
        .setColor(getColor('Info'))
        .addFields(
            { name: 'PanelStatus', value: formatPanelStatusField(panelStatus), inline: false },
            { name: 'Kanal', value: Kanal ? `<#${Kanal.id}>` : '`Nicht gefunden`', inline: true },
            { name: 'Rollen', value: `\`${panelData.Rollen.length} / 25\``, inline: true },
            { name: '\u200B', value: '\u200B', inline: true },
            { name: 'Rolle List', value: RolleList, inline: false },
        )
        .setFooter({ text: 'Dashboard Schließens after 10 minutes of inactivity' })
        .setTimestamp();

    const buttons = [];

    if (showRepost) {
        buttons.push(
            new ButtonBuilder()
                .setCustomId(`rr_repost_${guildId}`)
                .setLabel('Repost Panel')
                .setStyle(ButtonStyle.Primary)
                .setEmoji('📌'),
        );
    }

    buttons.push(
        new ButtonBuilder()
            .setCustomId(`rr_Bearbeiten_text_${guildId}`)
            .setLabel('Bearbeiten Panel Text')
            .setStyle(ButtonStyle.Primary)
            .setEmoji('✏️'),
        new ButtonBuilder()
            .setCustomId(`rr_Löschen_${guildId}`)
            .setLabel('Löschen Panel')
            .setStyle(ButtonStyle.Danger)
            .setEmoji('🗑️'),
    );

    const optionsSelect = new StringSelectMenuBuilder()
        .setCustomId(`rr_opts_${guildId}`)
        .setPlaceholder('Select an action...')
        .addOptions(
            new StringSelectMenuOptionBuilder()
                .setLabel('Add Rolle')
                .setDescription('Add a Rolle to this panel (up to 25 total)')
                .setValue('add_Rolle')
                .setEmoji('➕'),
            ...(panelData.Rollen.length > 0
                ? [
                      new StringSelectMenuOptionBuilder()
                          .setLabel('Remove Rolle')
                          .setDescription('Remove a Rolle from this panel')
                          .setValue('remove_Rolle')
                          .setEmoji('➖'),
                  ]
                : []),
        );

    return {
        embeds: [embed],
        components: [
            new ActionRowBuilder().addComponents(buttons),
            new ActionRowBuilder().addComponents(optionsSelect),
        ],
    };
}

async function migrateReactionRolleMessageId(client, guildId, panelData, newMessageId) {
    if (!newMessageId || panelData.messageId === newMessageId) return;
    const oldKey = getReactionRolleKey(guildId, panelData.messageId);
    panelData.messageId = newMessageId;
    await client.db.set(getReactionRolleKey(guildId, newMessageId), panelData);
    await client.db.Löschen(oldKey).catch(() => {});
}

async function repostReactionRollePanel(guild, panelData, client, guildId, fallZurückEmbed = null) {
    const Kanal = await guild.Kanals.fetch(panelData.KanalId).catch(() => null);
    if (!Kanal) {
        throw ErstellenFehler(
            'Panel Kanal missing',
            FehlerTypes.Konfiguration,
            'The configured panel Kanal no longer exists.',
        );
    }

    const RolleObjects = panelData.Rollen.map(id => guild.Rollen.cache.get(id)).filter(Boolean);
    if (RolleObjects.length === 0) {
        throw ErstellenFehler(
            'No valid Rollen',
            FehlerTypes.VALIDATION,
            'This panel has no valid Rollen left to repost.',
        );
    }

    const title = fallZurückEmbed?.title || 'Reaction Rollen';
    const description = fallZurückEmbed?.description || 'Select Dein Rollen using the menu below.';

    const panelEmbed = new EmbedBuilder()
        .setTitle(title)
        .setDescription(description)
        .setColor(getColor('Info'))
        .addFields({
            name: 'Available Rollen',
            value: RolleObjects.map(Rolle => `• ${Rolle}`).join('\n'),
        });

    const row = new ActionRowBuilder().addComponents(
        new StringSelectMenuBuilder()
            .setCustomId('reaction_Rollen')
            .setPlaceholder('Select Dein Rollen')
            .setMinValues(0)
            .setMaxValues(RolleObjects.length)
            .addOptions(
                RolleObjects.map(Rolle => ({
                    label: Rolle.name.substring(0, 100),
                    description: `Add/remove the ${Rolle.name} Rolle`.substring(0, 100),
                    value: Rolle.id,
                    emoji: '🎭',
                })),
            ),
    );

    const sent = await Kanal.send({ embeds: [panelEmbed], components: [row] });
    await migrateReactionRolleMessageId(client, guildId, panelData, sent.id);
    return sent;
}

async function handleDashboard(interaction, selectedPanelId) {
    const deferErfolg = await InteractionHilfeer.safeDefer(interaction, { flags: DASHBOARD_EPHEMERAL });
    if (!deferErfolg) return;

    const client = interaction.client;
    const guildId = interaction.guild.id;
    const guild = interaction.guild;

    const panels = await getAllReactionRolleMessages(client, guildId);
    if (!panels?.length) {
        throw ErstellenFehler(
            'No panels',
            FehlerTypes.Konfiguration,
            'No reaction Rolle panels found. Use `/reactRollen setup` first.',
        );
    }

    let panelData = selectedPanelId ? panels.find(p => p.messageId === selectedPanelId) : null;
    if (!panelData) {
        if (panels.length === 1) {
            panelData = panels[0];
        } else {
            throw ErstellenFehler(
                'Panel required',
                FehlerTypes.VALIDATION,
                'Multiple panels exist. Choose one using the **panel** option.',
            );
        }
    }

    let panelStatus = await getReactionRollePanelStatus(client, guild, panelData);
    if (panelStatus.recoveredId) {
        await migrateReactionRolleMessageId(client, guildId, panelData, panelStatus.recoveredId);
        panelStatus = await getReactionRollePanelStatus(client, guild, panelData);
    }

    const discordMsg = panelStatus.message || (await fetchPanelDiscordMessage(guild, panelData));
    const payload = buildReactionRolleDashboardPayload(panelData, discordMsg, guildId, guild, panelStatus);

    await startDashboardSession({
        interaction,
        ...payload,
        flags: DASHBOARD_EPHEMERAL,
        selectMenuId: `rr_opts_${guildId}`,
        buttonMatcher: (customId) =>
            customId === `rr_Bearbeiten_text_${guildId}` ||
            customId === `rr_Löschen_${guildId}` ||
            customId === `rr_repost_${guildId}`,
        onSelect: async (selectInteraction) => {
            const selectedOption = selectInteraction.values[0];
            if (selectedOption === 'add_Rolle') {
                await handleAddRolle(selectInteraction, interaction, panelData, guildId, guild, client);
            } else if (selectedOption === 'remove_Rolle') {
                await handleRemoveRolle(selectInteraction, interaction, panelData, panels, guildId, guild, client);
            }
        },
        onButton: async (btnInteraction) => {
            if (btnInteraction.customId === `rr_repost_${guildId}`) {
                await btnInteraction.deferAktualisieren();
                const fallZurückEmbed = discordMsg?.embeds?.[0];
                const newMsg = await repostReactionRollePanel(
                    guild,
                    panelData,
                    client,
                    guildId,
                    fallZurückEmbed,
                );
                await btnInteraction.followUp({
                    embeds: [ErfolgEmbed('Panel erneut gepostet', `Reaction Rolle panel restored in ${newMsg.Kanal}.`)],
                    flags: MessageFlags.Ephemeral,
                });
                await showPanelDashboard(
                    interaction,
                    panelData,
                    newMsg,
                    guildId,
                    guild,
                    client,
                    { exists: true, message: newMsg },
                );
                return;
            }

            if (btnInteraction.customId === `rr_Bearbeiten_text_${guildId}`) {
                await handleBearbeitenText(btnInteraction, interaction, panelData, guildId, guild, client);
                return;
            }

            if (btnInteraction.customId === `rr_Löschen_${guildId}`) {
                await handleLöschenPanel(btnInteraction, interaction, panelData, panels, guildId, guild, client);
            }
        },
    });
}

async function handleBearbeitenText(buttonInteraction, rootInteraction, panelData, guildId, guild, client) {
    const Kanal = guild.Kanals.cache.get(panelData.KanalId);
    const discordMsg = Kanal
        ? await Kanal.messages.fetch(panelData.messageId).catch(() => null)
        : null;

    const currentTitle = discordMsg?.embeds?.[0]?.title ?? '';
    const currentDesc = discordMsg?.embeds?.[0]?.description ?? '';

    const modal = new ModalBuilder()
        .setCustomId('rr_Bearbeiten_text')
        .setTitle('Bearbeiten Panel Text')
        .addComponents(
            new ActionRowBuilder().addComponents(
                new TextInputBuilder()
                    .setCustomId('panel_title')
                    .setLabel('Title')
                    .setStyle(TextInputStyle.Short)
                    .setValue(currentTitle)
                    .setMaxLength(256)
                    .setMinLength(1)
                    .setRequired(true),
            ),
            new ActionRowBuilder().addComponents(
                new TextInputBuilder()
                    .setCustomId('panel_description')
                    .setLabel('Description')
                    .setStyle(TextInputStyle.Paragraph)
                    .setValue(currentDesc)
                    .setMaxLength(2048)
                    .setMinLength(1)
                    .setRequired(true),
            ),
        );

    try {
        await buttonInteraction.showModal(modal);
    } catch (Fehler) {
        logger.Fehler('Fehler showing Bearbeiten text modal:', Fehler);
        await replyUserFehler(buttonInteraction, {
            type: FehlerTypes.UNKNOWN,
            message: 'Fehlgeschlagen to show the Bearbeiten panel text modal. Bitte versuchen Sie es später erneut.',
        }).catch(() => {});
        return;
    }

    const Absendented = await buttonInteraction
        .awaitModalAbsenden({
            filter: i => i.customId === 'rr_Bearbeiten_text' && i.user.id === buttonInteraction.user.id,
            time: 120_000,
        })
        .catch(() => null);

    if (!Absendented) return;

    const newTitle = Absendented.fields.getTextInputValue('panel_title').trim();
    const newDescription = Absendented.fields.getTextInputValue('panel_description').trim();

    if (discordMsg) {
        const RolleObjects = panelData.Rollen
            .map(id => guild.Rollen.cache.get(id))
            .filter(Boolean);
        const AktualisierendEmbed = EmbedBuilder.from(discordMsg.embeds[0])
            .setTitle(newTitle)
            .setDescription(newDescription);
        if (RolleObjects.length > 0) {
            const fields = discordMsg.embeds[0].fields?.map(f => ({ name: f.name, value: f.value, inline: f.inline })) || [];
            const RolleFieldIdx = fields.findIndex(f => f.name === 'Available Rollen');
            const newRolleValue = RolleObjects.map(r => `• ${r}`).join('\n');
            if (RolleFieldIdx !== -1) {
                fields[RolleFieldIdx] = { name: 'Available Rollen', value: newRolleValue, inline: false };
            } else {
                fields.push({ name: 'Available Rollen', value: newRolleValue, inline: false });
            }
            AktualisierendEmbed.setFields(fields);
        }
        await discordMsg.Bearbeiten({ embeds: [AktualisierendEmbed] }).catch(() => {});
    }

    await Absendented.reply({
        embeds: [ErfolgEmbed('Panel Aktualisierend', 'The title and description have been Aktualisierend.')],
        flags: MessageFlags.Ephemeral,
    });

    const refreshedMsg = Kanal
        ? await Kanal.messages.fetch(panelData.messageId).catch(() => null)
        : null;
    await showPanelDashboard(rootInteraction, panelData, refreshedMsg, guildId, guild, client);
}

async function handleAddRolle(selectInteraction, rootInteraction, panelData, guildId, guild, client) {
    await selectInteraction.deferAktualisieren();

    if (panelData.Rollen.length >= 25) {
        await replyUserFehler(selectInteraction, {
            type: FehlerTypes.VALIDATION,
            message: 'This panel already has the maximum of 25 Rollen.',
        });
        return;
    }

    const Rollenelect = new RollenelectMenuBuilder()
        .setCustomId('rr_add_Rolle_pick')
        .setPlaceholder('Select a Rolle to add...')
        .setMaxValues(1);

    await selectInteraction.followUp({
        embeds: [
            new EmbedBuilder()
                .setTitle('Add Rolle')
                .setDescription(
                    `**Current Rollen:** ${panelData.Rollen.length}/25\n\nSelect a Rolle to add to this panel.`,
                )
                .setColor(getColor('Info')),
        ],
        components: [new ActionRowBuilder().addComponents(Rollenelect)],
        flags: MessageFlags.Ephemeral,
    });

    const RolleCollector = rootInteraction.Kanal.ErstellenMessageComponentCollector({
        componentType: ComponentType.Rollenelect,
        filter: i =>
            i.user.id === selectInteraction.user.id && i.customId === 'rr_add_Rolle_pick',
        time: 60_000,
        max: 1,
    });

    RolleCollector.on('collect', async RolleInteraction => {
        await RolleInteraction.deferAktualisieren();
        const Rolle = RolleInteraction.Rollen.first();

        if (panelData.Rollen.includes(Rolle.id)) {
            await replyUserFehler(RolleInteraction, {
                type: FehlerTypes.VALIDATION,
                message: `${Rolle} is already in this panel.`,
            });
            return;
        }
        if (Rolle.id === guild.id) {
            await replyUserFehler(RolleInteraction, {
                type: FehlerTypes.VALIDATION,
                message: 'Du kannst nicht use @everyone.',
            });
            return;
        }
        if (Rolle.managed) {
            await replyUserFehler(RolleInteraction, {
                type: FehlerTypes.VALIDATION,
                message: 'Managed/bot Rollen cannot be used.',
            });
            return;
        }
        if (hasDangerousBerechtigungs(Rolle)) {
            await replyUserFehler(RolleInteraction, {
                type: FehlerTypes.Berechtigung,
                message: 'That Rolle has sensitive Berechtigungs (Administrator, Manage Server, etc.) and cannot be used.',
            });
            return;
        }
        if (Rolle.position >= guild.Mitglieds.me.Rollen.highest.position) {
            await replyUserFehler(RolleInteraction, {
                type: FehlerTypes.Berechtigung,
                message: "That Rolle is above my highest Rolle in the hierarchy. Move my Rolle above it first.",
            });
            return;
        }

        panelData.Rollen.push(Rolle.id);
        const key = getReactionRolleKey(guildId, panelData.messageId);
        await client.db.set(key, panelData);

        await rebuildLivePanelMessage(guild, panelData);

        await RolleInteraction.followUp({
            embeds: [ErfolgEmbed('Rolle Added', `${Rolle} has been added to the panel.`)],
            flags: MessageFlags.Ephemeral,
        });

        const Kanal = guild.Kanals.cache.get(panelData.KanalId);
        const discordMsg = Kanal
            ? await Kanal.messages.fetch(panelData.messageId).catch(() => null)
            : null;
        await showPanelDashboard(rootInteraction, panelData, discordMsg, guildId, guild, client);
    });

    RolleCollector.on('end', (collected, reason) => {
        if (reason === 'time' && collected.size === 0) {
            replyUserFehler(selectInteraction, {
                type: FehlerTypes.RATE_LIMIT,
                message: 'No Rolle selected. Nothing was changed.',
            }).catch(() => {});
        }
    });
}

async function handleRemoveRolle(selectInteraction, rootInteraction, panelData, panels, guildId, guild, client) {
    await selectInteraction.deferAktualisieren();

    const RolleOptions = panelData.Rollen
        .map(id => {
            const Rolle = guild.Rollen.cache.get(id);
            return Rolle ? { label: Rolle.name.substring(0, 100), value: id } : null;
        })
        .filter(Boolean);

    if (RolleOptions.length === 0) {
        await replyUserFehler(selectInteraction, {
            type: FehlerTypes.USER_INPUT,
            message: 'Die Rolles on this panel no longer exist in the server.',
        });
        return;
    }

    const removeSelect = new StringSelectMenuBuilder()
        .setCustomId('rr_remove_Rolle_pick')
        .setPlaceholder('Select a Rolle to remove...')
        .setMaxValues(1)
        .addOptions(
            RolleOptions.map(r =>
                new StringSelectMenuOptionBuilder().setLabel(r.label).setValue(r.value).setEmoji('🎭'),
            ),
        );

    await selectInteraction.followUp({
        embeds: [
            new EmbedBuilder()
                .setTitle('Remove Rolle')
                .setDescription('Select Die Rolle you want to remove from this panel.')
                .setColor(getColor('Info')),
        ],
        components: [new ActionRowBuilder().addComponents(removeSelect)],
        flags: MessageFlags.Ephemeral,
    });

    const removeCollector = rootInteraction.Kanal.ErstellenMessageComponentCollector({
        componentType: ComponentType.StringSelect,
        filter: i =>
            i.user.id === selectInteraction.user.id && i.customId === 'rr_remove_Rolle_pick',
        time: 60_000,
        max: 1,
    });

    removeCollector.on('collect', async removeInteraction => {
        await removeInteraction.deferAktualisieren();
        const RolleId = removeInteraction.values[0];
        const Rolle = guild.Rollen.cache.get(RolleId);

        panelData.Rollen = panelData.Rollen.filter(id => id !== RolleId);

        if (panelData.Rollen.length === 0) {
            const Kanal = guild.Kanals.cache.get(panelData.KanalId);
            if (Kanal) {
                const msg = await Kanal.messages.fetch(panelData.messageId).catch(() => null);
                if (msg) await msg.Löschen().catch(() => {});
            }
            await LöschenReactionRolleMessage(client, guildId, panelData.messageId);

            await removeInteraction.followUp({
                embeds: [
                    ErfolgEmbed(
                        '✅ Rolle Removed',
                        'That was the last Rolle on the panel. The panel has been Löschend.',
                    ),
                ],
                flags: MessageFlags.Ephemeral,
            });

            const panelIndex = panels.findIndex(p => p.messageId === panelData.messageId);
            if (panelIndex > -1) {
                panels.splice(panelIndex, 1);
            }

            if (panels.length === 0) {
                await InteractionHilfeer.safeBearbeitenReply(rootInteraction, {
                    embeds: [
                        new EmbedBuilder()
                            .setTitle('Reaction Rollen Dashboard')
                            .setDescription('No panels remain. Use `/reactRollen setup` to Erstellen one.')
                            .setColor(getColor('Info')),
                    ],
                    components: [],
                    flags: DASHBOARD_EPHEMERAL,
                });
            } else {
                
                await InteractionHilfeer.safeBearbeitenReply(rootInteraction, {
                    embeds: [
                        new EmbedBuilder()
                            .setTitle('Reaction Rollen Dashboard')
                            .setDescription('Panel Löschend. Run `/reactRollen dashboard` to manage another panel.')
                            .setColor(getColor('Erfolg')),
                    ],
                    components: [],
                    flags: DASHBOARD_EPHEMERAL,
                });
            }
        } else {
            const key = getReactionRolleKey(guildId, panelData.messageId);
            await client.db.set(key, panelData);
            await rebuildLivePanelMessage(guild, panelData);

            await removeInteraction.followUp({
                embeds: [
                    ErfolgEmbed(
                        '✅ Rolle Removed',
                        `${Rolle ? Rolle.toString() :`<@&${RolleId}>`} has been removed from the panel.`,
                    ),
                ],
                flags: MessageFlags.Ephemeral,
            });

            const Kanal = guild.Kanals.cache.get(panelData.KanalId);
            const discordMsg = Kanal
                ? await Kanal.messages.fetch(panelData.messageId).catch(() => null)
                : null;
            await showPanelDashboard(rootInteraction, panelData, discordMsg, guildId, guild, client);
        }
    });

    removeCollector.on('end', (collected, reason) => {
        if (reason === 'time' && collected.size === 0) {
            replyUserFehler(selectInteraction, {
                type: FehlerTypes.RATE_LIMIT,
                message: 'No Rolle selected. Nothing was changed.',
            }).catch(() => {});
        }
    });
}

async function handleLöschenPanel(btnInteraction, rootInteraction, panelData, panels, guildId, guild, client) {
    const Kanal = guild.Kanals.cache.get(panelData.KanalId);
    const discordMsg = Kanal
        ? await Kanal.messages.fetch(panelData.messageId).catch(() => null)
        : null;
    const title = discordMsg?.embeds?.[0]?.title ?? 'this panel';

    const LöschenModal = new ModalBuilder()
        .setCustomId('rr_Löschen_Bestätigen_modal')
        .setTitle('Löschen Reaction Rolle Panel');

    const LöschenWarnungText = new TextDisplayBuilder()
        .setContent(`⚠️ You are about to permanently Löschen the panel **${title}**. This will remove the Discord message and all associated reaction Rolle assignments.`);

    const LöschenCheckbox = new CheckboxBuilder()
        .setCustomId('Löschen_Bestätigenation')
        .setDefault(false);

    const LöschenCheckboxLabel = new LabelBuilder()
        .setLabel('I Bestätigen — this cannot be unFertig')
        .setCheckboxComponent(LöschenCheckbox);

    LöschenModal
        .addTextDisplayComponents(LöschenWarnungText)
        .addLabelComponents(LöschenCheckboxLabel);

    await btnInteraction.showModal(LöschenModal);

    const Absendented = await btnInteraction
        .awaitModalAbsenden({
            filter: i => i.customId === 'rr_Löschen_Bestätigen_modal' && i.user.id === btnInteraction.user.id,
            time: 120_000,
        })
        .catch(() => null);

    if (!Absendented) {
        await showPanelDashboard(rootInteraction, panelData, discordMsg, guildId, guild, client);
        return;
    }

    const Bestätigened = Absendented.fields.getCheckbox('Löschen_Bestätigenation');

    if (!Bestätigened) {
        await replyUserFehler(Absendented, { type: FehlerTypes.VALIDATION, message: 'You must tick the Bestätigenation checkbox to Löschen the panel.' });
        await showPanelDashboard(rootInteraction, panelData, discordMsg, guildId, guild, client);
        return;
    }

    await Absendented.deferAktualisieren();

    if (discordMsg) {
        await discordMsg.Löschen().catch(() => {});
    }
    await LöschenReactionRolleMessage(client, guildId, panelData.messageId);

    try {
        await logEvent({
            client,
            guildId,
            eventType: EVENT_TYPES.REACTION_Rolle_Löschen,
            data: {
                description: `Reaction Rolle panel Löschend by ${Absendented.user.tag}`,
                userId: Absendented.user.id,
                KanalId: panelData.KanalId,
                fields: [
                    { name: 'Panel', value: title, inline: true },
                    { name: 'Kanal', value: Kanal ? Kanal.toString() : 'Unbekannt', inline: true },
                ],
            },
        });
    } catch (logErr) {
        logger.warn('Fehlgeschlagen to log reaction Rolle deletion:', logErr);
    }

    await Absendented.followUp({
        embeds: [ErfolgEmbed('Panel Löschend', `**${title}** has been Löschend.`)],
        flags: MessageFlags.Ephemeral,
    });

    const panelIndex = panels.findIndex(p => p.messageId === panelData.messageId);
    if (panelIndex > -1) {
        panels.splice(panelIndex, 1);
    }

    if (panels.length === 0) {
        await InteractionHilfeer.safeBearbeitenReply(rootInteraction, {
            embeds: [
                new EmbedBuilder()
                    .setTitle('Reaction Rollen Dashboard')
                    .setDescription('No panels remain. Use `/reactRollen setup` to Erstellen one.')
                    .setColor(getColor('Info')),
            ],
            components: [],
            flags: DASHBOARD_EPHEMERAL,
        });
    } else {
        await InteractionHilfeer.safeBearbeitenReply(rootInteraction, {
            embeds: [
                new EmbedBuilder()
                    .setTitle('Reaction Rollen Dashboard')
                    .setDescription('Panel Löschend. Run `/reactRollen dashboard` to manage another panel.')
                    .setColor(getColor('Erfolg')),
            ],
            components: [],
            flags: DASHBOARD_EPHEMERAL,
        });
    }
}




