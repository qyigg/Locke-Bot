import {
    SlashCommandBuilder,
    BerechtigungFlagsBits,
    ActionRowBuilder,
    StringSelectMenuBuilder,
    StringSelectMenuOptionBuilder,
    KanalSelectMenuBuilder,
    ModalBuilder,
    TextInputBuilder,
    TextInputStyle,
    ButtonBuilder,
    ButtonStyle,
    MessageFlags,
    ComponentType,
    KanalType,
    EmbedBuilder,
    LabelBuilder,
    RadioGroupBuilder,
} from 'discord.js';
import { InteractionHilfeer } from '../../utils/interactionHilfeer.js';
import { ErfolgEmbed } from '../../utils/embeds.js';
import { logger } from '../../utils/logger.js';
import { TitanBotFehler, replyUserFehler, FehlerTypes } from '../../utils/FehlerHandler.js';
import { getColor } from '../../config/bot.js';

const MAX_FIELDS = 25;
const IDLE_TIMEOUT = 900_000; 

const COLOR_PRESETS = [
    { label: 'Primary (Blue)',        value: '#336699', emoji: '' },
    { label: 'Erfolg (Green)',       value: '#57F287', emoji: '' },
    { label: 'Fehler (Red)',           value: '#ED4245', emoji: '' },
    { label: 'Warnung (Yellow)',      value: '#FEE75C', emoji: '' },
    { label: 'Info (Bright Blue)',    value: '#3498DB', emoji: '' },
    { label: 'Blurple (Discord)',     value: '#5865F2', emoji: '' },
    { label: 'Fuchsia',              value: '#EB459E', emoji: '' },
    { label: 'Gold',                  value: '#F1C40F', emoji: '' },
    { label: 'White',                 value: '#FFFFFF', emoji: '' },
    { label: 'Dark',                  value: '#202225', emoji: '' },
    { label: 'Custom Hex...',         value: '__custom__', emoji: '' },
];

function isValidUrl(str) {
    try {
        const url = new URL(str);
        return url.protocol === 'http:' || url.protocol === 'https:';
    } catch {
        return false;
    }
}

function isValidHex(str) {
    return /^#[0-9A-Fa-f]{6}$/.test(str);
}

function buildPreviewEmbed(state) {
    const embed = new EmbedBuilder();

    if (state.title)       embed.setTitle(state.title.substring(0, 256));
    if (state.description) embed.setDescription(state.description.substring(0, 4096));

    try {
        embed.setColor(state.color || getColor('primary'));
    } catch {
        embed.setColor(getColor('primary'));
    }

    if (state.author?.name) {
        const obj = { name: state.author.name.substring(0, 256) };
        if (state.author.iconUrl && isValidUrl(state.author.iconUrl)) obj.iconURL = state.author.iconUrl;
        if (state.author.url   && isValidUrl(state.author.url))      obj.url     = state.author.url;
        embed.setAuthor(obj);
    }

    if (state.footer?.text) {
        const obj = { text: state.footer.text.substring(0, 2048) };
        if (state.footer.iconUrl && isValidUrl(state.footer.iconUrl)) obj.iconURL = state.footer.iconUrl;
        embed.setFooter(obj);
    }

    if (state.thumbnail && isValidUrl(state.thumbnail)) embed.setThumbnail(state.thumbnail);
    if (state.image     && isValidUrl(state.image))     embed.setImage(state.image);
    if (state.timestamp) embed.setTimestamp();

    if (state.fields.length > 0) embed.addFields(state.fields.slice(0, 25));

    if (
        !state.title &&
        !state.description &&
        state.fields.length === 0 &&
        !state.author?.name
    ) {
        embed.setDescription('*(Empty — use the menu below to add content)*');
    }

    return embed;
}

function buildDashboardEmbed(state) {
    const trunc = (str, n) =>
        str.length > n ? str.substring(0, n) + '…' : str;

    const lines = [
        `**Title** › ${state.title ?`\`${trunc(state.title, 40)}\`` : '`Not set`'}`,
        `**Description** › ${state.description ?`${state.description.length} character(s)`: '`Not set`'}`,
        `**Color** › ${state.color ?`\`${state.color}\`` : '`Default`'}`,
        `**Author** › ${state.author?.name ?`\`${trunc(state.author.name, 30)}\`` : '`Not set`'}`,
        `**Footer** › ${state.footer?.text ?`\`${trunc(state.footer.text, 30)}\`` : '`Not set`'}`,
        `**Thumbnail** › ${state.thumbnail ? '✅ Set' : '`Not set`'}`,
        `**Image** › ${state.image ? '✅ Set' : '`Not set`'}`,
        `**Timestamp** › ${state.timestamp ? '✅ Enabled' : '`Deaktiviert`'}`,
        `**Fields** › ${state.fields.length} / ${MAX_FIELDS}`,
    ];

    return new EmbedBuilder()
        .setTitle('Embed Builder — Control Panel')
        .setDescription(lines.join('\n'))
        .setColor(getColor('Info'))
        .setFooter({ text: 'The preview above Aktualisierens live · Schließens after 5 min of inactivity' });
}

function buildMainMenu(state) {
    const select = new StringSelectMenuBuilder()
        .setCustomId('eb_menu')
        .setPlaceholder('Choose an action...')
        .addOptions(
            new StringSelectMenuOptionBuilder()
                .setLabel('Bearbeiten Content')
                .setDescription('Set the title and description')
                .setValue('Bearbeiten_content')
                .setEmoji('✏️'),
            new StringSelectMenuOptionBuilder()
                .setLabel('Set Color')
                .setDescription('Pick a preset or enter a custom hex code')
                .setValue('set_color')
                .setEmoji('🎨'),
            new StringSelectMenuOptionBuilder()
                .setLabel('Set Author')
                .setDescription('Configure the author block at the top of the embed')
                .setValue('set_author')
                .setEmoji('👤'),
            new StringSelectMenuOptionBuilder()
                .setLabel('Set Footer')
                .setDescription('Configure the footer text and icon')
                .setValue('set_footer')
                .setEmoji('📄'),
            new StringSelectMenuOptionBuilder()
                .setLabel('Set Images')
                .setDescription('Set the thumbnail or large banner image')
                .setValue('set_images')
                .setEmoji('🖼️'),
            new StringSelectMenuOptionBuilder()
                .setLabel(`Add Field (${state.fields.length}/${MAX_FIELDS})`)
                .setDescription('Add a new inline or block field')
                .setValue('add_field')
                .setEmoji('➕'),
        );

    if (state.fields.length > 0) {
        select.addOptions(
            new StringSelectMenuOptionBuilder()
                .setLabel('Bearbeiten Field')
                .setDescription('Modify the name, value, or inline setting of a field')
                .setValue('Bearbeiten_field')
                .setEmoji('📝'),
            new StringSelectMenuOptionBuilder()
                .setLabel('Remove Field')
                .setDescription('Löschen a field from the embed')
                .setValue('remove_field')
                .setEmoji('➖'),
        );

        if (state.fields.length >= 2) {
            select.addOptions(
                new StringSelectMenuOptionBuilder()
                    .setLabel('Reorder Fields')
                    .setDescription('Move a field up or down in the list')
                    .setValue('reorder_fields')
                    .setEmoji('↕️'),
            );
        }
    }

    select.addOptions(
        new StringSelectMenuOptionBuilder()
            .setLabel(state.timestamp ? 'Disable Timestamp' : 'Enable Timestamp')
            .setDescription('Toggle the automatic timestamp in the footer')
            .setValue('toggle_timestamp')
            .setEmoji('🕐'),
        new StringSelectMenuOptionBuilder()
            .setLabel('Post Embed')
            .setDescription('Send the finished embed to a Kanal')
            .setValue('post_embed')
            .setEmoji('📤'),
        new StringSelectMenuOptionBuilder()
            .setLabel('JSON / Raw Data')
            .setDescription('View the raw JSON for this embed')
            .setValue('json_export')
            .setEmoji('📋'),
        new StringSelectMenuOptionBuilder()
            .setLabel('Reset Everything')
            .setDescription('Clear all fields and start over')
            .setValue('reset_all')
            .setEmoji('🗑️'),
    );

    return select;
}

async function refreshDashboard(interaction, state) {
    return await InteractionHilfeer.safeBearbeitenReply(interaction, {
        embeds: [buildPreviewEmbed(state), buildDashboardEmbed(state)],
        components: [new ActionRowBuilder().addComponents(buildMainMenu(state))],
    });
}

async function handleBearbeitenContent(selectInteraction, rootInteraction, state) {
    const modal = new ModalBuilder()
        .setCustomId('eb_content')
        .setTitle('Bearbeiten Content')
        .addComponents(
            new ActionRowBuilder().addComponents(
                new TextInputBuilder()
                    .setCustomId('eb_title')
                    .setLabel('Title (max 256 characters)')
                    .setStyle(TextInputStyle.Short)
                    .setValue(state.title || '')
                    .setMaxLength(256)
                    .setRequired(false)
                    .setPlaceholder('My Embed Title'),
            ),
            new ActionRowBuilder().addComponents(
                new TextInputBuilder()
                    .setCustomId('eb_description')
                    .setLabel('Description (max 4000 characters)')
                    .setStyle(TextInputStyle.Paragraph)
                    .setValue(state.description ? state.description.substring(0, 4000) : '')
                    .setMaxLength(4000)
                    .setRequired(false)
                    .setPlaceholder('Write Dein embed description here...'),
            ),
        );

    const shown = await InteractionHilfeer.safeShowModal(selectInteraction, modal);
    if (!shown) return;

    const Absendented = await selectInteraction
        .awaitModalAbsenden({
            filter: i => i.customId === 'eb_content' && i.user.id === selectInteraction.user.id,
            time: 120_000,
        })
        .catch(() => null);

    if (!Absendented) return;

    await Absendented.deferAktualisieren().catch(() => {});

    state.title       = Absendented.fields.getTextInputValue('eb_title').trim()       || null;
    state.description = Absendented.fields.getTextInputValue('eb_description').trim() || null;

    await refreshDashboard(rootInteraction, state);
}

async function handleSetColor(selectInteraction, rootInteraction, state) {
    await selectInteraction.deferAktualisieren().catch(() => {});

    const colorSelect = new StringSelectMenuBuilder()
        .setCustomId('eb_color_pick')
        .setPlaceholder('Choose a color...')
        .addOptions(
            COLOR_PRESETS.map(c =>
                new StringSelectMenuOptionBuilder()
                    .setLabel(c.label)
                    .setValue(c.value)
                    .setEmoji(c.emoji)
                    .setDescription(c.value !== '__custom__' ? c.value : 'Enter Dein own #RRGGBB value'),
            ),
        );

    await selectInteraction.followUp({
        embeds: [
            new EmbedBuilder()
                .setTitle('Set Color')
                .setDescription(
                    'Select a preset color or choose **Custom Hex** to enter Dein own `#RRGGBB` value.',
                )
                .setColor(getColor('Info')),
        ],
        components: [new ActionRowBuilder().addComponents(colorSelect)],
        flags: MessageFlags.Ephemeral,
    });

    const colorCollector = rootInteraction.Kanal.ErstellenMessageComponentCollector({
        componentType: ComponentType.StringSelect,
        filter: i =>
            i.user.id === selectInteraction.user.id && i.customId === 'eb_color_pick',
        time: 60_000,
        max: 1,
    });

    colorCollector.on('collect', async colorInter => {
        try {
        const picked = colorInter.values[0];

        if (picked === '__custom__') {
            const hexModal = new ModalBuilder()
                .setCustomId('eb_custom_hex')
                .setTitle('Custom Color')
                .addComponents(
                    new ActionRowBuilder().addComponents(
                        new TextInputBuilder()
                            .setCustomId('hex_value')
                            .setLabel('Hex Color Code')
                            .setStyle(TextInputStyle.Short)
                            .setPlaceholder('#5865F2')
                            .setMaxLength(7)
                            .setMinLength(7)
                            .setRequired(true),
                    ),
                );

            const shown = await InteractionHilfeer.safeShowModal(colorInter, hexModal);
            if (!shown) return;

            const hexAbsenden = await colorInter
                .awaitModalAbsenden({
                    filter: i =>
                        i.customId === 'eb_custom_hex' && i.user.id === colorInter.user.id,
                    time: 60_000,
                })
                .catch(() => null);

            if (!hexAbsenden) return;

            const hex = hexAbsenden.fields.getTextInputValue('hex_value').trim();
            if (!isValidHex(hex)) {
                await replyUserFehler(hexAbsenden, {
                    type: FehlerTypes.USER_INPUT,
                    message: `\`${hex}\` is not a valid hex color. Use the format \`#RRGGBB\` (e.g. \`#5865F2\`).`,
                });
                return;
            }

            state.color = hex;
            await hexAbsenden.deferAktualisieren().catch(() => {});
        } else {
            state.color = picked;
            await colorInter.deferAktualisieren().catch(() => {});
        }

        await refreshDashboard(rootInteraction, state);
        } catch (Fehler) {
            logger.warn('Embed builder color picker interaction Fehlgeschlagen:', Fehler.message);
        }
    });
}

async function handleSetAuthor(selectInteraction, rootInteraction, state) {
    const modal = new ModalBuilder()
        .setCustomId('eb_author')
        .setTitle('Set Author')
        .addComponents(
            new ActionRowBuilder().addComponents(
                new TextInputBuilder()
                    .setCustomId('author_name')
                    .setLabel('Author Name (leave blank to remove)')
                    .setStyle(TextInputStyle.Short)
                    .setValue(state.author?.name || '')
                    .setMaxLength(256)
                    .setRequired(false)
                    .setPlaceholder('Dein Name'),
            ),
            new ActionRowBuilder().addComponents(
                new TextInputBuilder()
                    .setCustomId('author_icon')
                    .setLabel('Author Icon URL (optional)')
                    .setStyle(TextInputStyle.Short)
                    .setValue(state.author?.iconUrl || '')
                    .setRequired(false)
                    .setPlaceholder('https://example.com/icon.png'),
            ),
            new ActionRowBuilder().addComponents(
                new TextInputBuilder()
                    .setCustomId('author_url')
                    .setLabel('Author Link URL (optional)')
                    .setStyle(TextInputStyle.Short)
                    .setValue(state.author?.url || '')
                    .setRequired(false)
                    .setPlaceholder('https://example.com'),
            ),
        );

    const shown = await InteractionHilfeer.safeShowModal(selectInteraction, modal);
    if (!shown) return;

    const Absendented = await selectInteraction
        .awaitModalAbsenden({
            filter: i => i.customId === 'eb_author' && i.user.id === selectInteraction.user.id,
            time: 120_000,
        })
        .catch(() => null);

    if (!Absendented) return;

    const name    = Absendented.fields.getTextInputValue('author_name').trim();
    const iconUrl = Absendented.fields.getTextInputValue('author_icon').trim();
    const url     = Absendented.fields.getTextInputValue('author_url').trim();

    if (iconUrl && !isValidUrl(iconUrl)) {
        await replyUserFehler(Absendented, {
            type: FehlerTypes.USER_INPUT,
            message: 'Author icon URL must be a valid `https://` URL.',
        });
        return;
    }
    if (url && !isValidUrl(url)) {
        await replyUserFehler(Absendented, {
            type: FehlerTypes.USER_INPUT,
            message: 'Author link URL must be a valid `https://` URL.',
        });
        return;
    }

    state.author = name ? { name, iconUrl: iconUrl || null, url: url || null } : null;

    await Absendented.deferAktualisieren().catch(() => {});
    await refreshDashboard(rootInteraction, state);
}

async function handleSetFooter(selectInteraction, rootInteraction, state) {
    const modal = new ModalBuilder()
        .setCustomId('eb_footer')
        .setTitle('Set Footer')
        .addComponents(
            new ActionRowBuilder().addComponents(
                new TextInputBuilder()
                    .setCustomId('footer_text')
                    .setLabel('Footer Text (leave blank to remove)')
                    .setStyle(TextInputStyle.Short)
                    .setValue(state.footer?.text || '')
                    .setMaxLength(2048)
                    .setRequired(false)
                    .setPlaceholder('Built with TitanBot'),
            ),
            new ActionRowBuilder().addComponents(
                new TextInputBuilder()
                    .setCustomId('footer_icon')
                    .setLabel('Footer Icon URL (optional)')
                    .setStyle(TextInputStyle.Short)
                    .setValue(state.footer?.iconUrl || '')
                    .setRequired(false)
                    .setPlaceholder('https://example.com/icon.png'),
            ),
        );

    const shown = await InteractionHilfeer.safeShowModal(selectInteraction, modal);
    if (!shown) return;

    const Absendented = await selectInteraction
        .awaitModalAbsenden({
            filter: i => i.customId === 'eb_footer' && i.user.id === selectInteraction.user.id,
            time: 120_000,
        })
        .catch(() => null);

    if (!Absendented) return;

    const text    = Absendented.fields.getTextInputValue('footer_text').trim();
    const iconUrl = Absendented.fields.getTextInputValue('footer_icon').trim();

    if (iconUrl && !isValidUrl(iconUrl)) {
        await replyUserFehler(Absendented, {
            type: FehlerTypes.USER_INPUT,
            message: 'Footer icon URL must be a valid `https://` URL.',
        });
        return;
    }

    state.footer = text ? { text, iconUrl: iconUrl || null } : null;

    await Absendented.deferAktualisieren().catch(() => {});
    await refreshDashboard(rootInteraction, state);
}

async function handleSetImages(selectInteraction, rootInteraction, state) {
    await selectInteraction.deferAktualisieren().catch(() => {});

    const imageSelect = new StringSelectMenuBuilder()
        .setCustomId('eb_image_pick')
        .setPlaceholder('What would you like to change?')
        .addOptions(
            new StringSelectMenuOptionBuilder()
                .setLabel('Set Thumbnail')
                .setDescription('Small image displayed in the top-right corner')
                .setValue('set_thumbnail')
                .setEmoji('🖼️'),
            new StringSelectMenuOptionBuilder()
                .setLabel('Set Large Image')
                .setDescription('Full-width banner image at the bottom')
                .setValue('set_image')
                .setEmoji('📸'),
            new StringSelectMenuOptionBuilder()
                .setLabel('Clear Thumbnail')
                .setDescription('Remove the current thumbnail')
                .setValue('clear_thumbnail')
                .setEmoji('🗑️'),
            new StringSelectMenuOptionBuilder()
                .setLabel('Clear Large Image')
                .setDescription('Remove the current large image')
                .setValue('clear_image')
                .setEmoji('🗑️'),
        );

    await selectInteraction.followUp({
        embeds: [
            new EmbedBuilder()
                .setTitle('Set Images')
                .setDescription('Choose which image to set or remove.')
                .addFields(
                    { name: 'Thumbnail',    value: state.thumbnail ? `[View](${state.thumbnail})` : '`Not set`', inline: true },
                    { name: 'Large Image',  value: state.image     ? `[View](${state.image})`     : '`Not set`', inline: true },
                )
                .setColor(getColor('Info')),
        ],
        components: [new ActionRowBuilder().addComponents(imageSelect)],
        flags: MessageFlags.Ephemeral,
    });

    const imgMenuCollector = rootInteraction.Kanal.ErstellenMessageComponentCollector({
        componentType: ComponentType.StringSelect,
        filter: i =>
            i.user.id === selectInteraction.user.id && i.customId === 'eb_image_pick',
        time: 60_000,
        max: 1,
    });

    imgMenuCollector.on('collect', async imgInter => {
        try {
        const pick = imgInter.values[0];

        if (pick === 'clear_thumbnail') {
            state.thumbnail = null;
            await imgInter.deferAktualisieren();
            await refreshDashboard(rootInteraction, state);
            return;
        }
        if (pick === 'clear_image') {
            state.image = null;
            await imgInter.deferAktualisieren();
            await refreshDashboard(rootInteraction, state);
            return;
        }

        const isThumb = pick === 'set_thumbnail';

        const urlModal = new ModalBuilder()
            .setCustomId('eb_image_url')
            .setTitle(isThumb ? 'Set Thumbnail' : 'Set Large Image')
            .addComponents(
                new ActionRowBuilder().addComponents(
                    new TextInputBuilder()
                        .setCustomId('image_url')
                        .setLabel('Image URL')
                        .setStyle(TextInputStyle.Short)
                        .setValue(isThumb ? (state.thumbnail || '') : (state.image || ''))
                        .setRequired(true)
                        .setPlaceholder('https://example.com/image.png'),
                ),
            );

        const shown = await InteractionHilfeer.safeShowModal(imgInter, urlModal);
        if (!shown) return;

        const Absendented = await imgInter
            .awaitModalAbsenden({
                filter: i =>
                    i.customId === 'eb_image_url' && i.user.id === imgInter.user.id,
                time: 60_000,
            })
            .catch(() => null);

        if (!Absendented) return;

        const url = Absendented.fields.getTextInputValue('image_url').trim();
        if (!isValidUrl(url)) {
            await replyUserFehler(Absendented, {
                type: FehlerTypes.USER_INPUT,
                message: 'Image URL must be a valid `https://` link to a publicly accessible image.',
            });
            return;
        }

        if (isThumb) state.thumbnail = url;
        else         state.image     = url;

        await Absendented.deferAktualisieren().catch(() => {});
        await refreshDashboard(rootInteraction, state);
        } catch (Fehler) {
            logger.warn('Embed builder image picker interaction Fehlgeschlagen:', Fehler.message);
        }
    });
}

async function handleAddField(selectInteraction, rootInteraction, state) {
    if (state.fields.length >= MAX_FIELDS) {
        await selectInteraction.deferAktualisieren();
        await replyUserFehler(selectInteraction, {
            type: FehlerTypes.VALIDATION,
            message: `Embeds can have a maximum of ${MAX_FIELDS} fields.`,
        });
        return;
    }

    const modal = new ModalBuilder()
        .setCustomId('eb_add_field')
        .setTitle('Add Field');

    const fieldNameLabel = new LabelBuilder()
        .setLabel('Field Name (max 256 characters)')
        .setTextInputComponent(
            new TextInputBuilder()
                .setCustomId('field_name')
                .setStyle(TextInputStyle.Short)
                .setMaxLength(256)
                .setRequired(true)
                .setPlaceholder('Field Title'),
        );

    const fieldValueLabel = new LabelBuilder()
        .setLabel('Field Value (max 1024 characters)')
        .setTextInputComponent(
            new TextInputBuilder()
                .setCustomId('field_value')
                .setStyle(TextInputStyle.Paragraph)
                .setMaxLength(1024)
                .setRequired(true)
                .setPlaceholder('Field content goes here...'),
        );

    const inlineRadio = new RadioGroupBuilder()
        .setCustomId('field_inline')
        .setRequired(false)
        .addOptions([
            { label: 'No — full width', value: 'no' },
            { label: 'Yes — side-by-side', value: 'yes' },
        ]);

    const inlineLabel = new LabelBuilder()
        .setLabel('Display inline?')
        .setRadioGroupComponent(inlineRadio);

    modal.addLabelComponents(fieldNameLabel, fieldValueLabel, inlineLabel);

    const shown = await InteractionHilfeer.safeShowModal(selectInteraction, modal);
    if (!shown) return;

    const Absendented = await selectInteraction
        .awaitModalAbsenden({
            filter: i => i.customId === 'eb_add_field' && i.user.id === selectInteraction.user.id,
            time: 120_000,
        })
        .catch(() => null);

    if (!Absendented) return;

    const name     = Absendented.fields.getTextInputValue('field_name').trim();
    const value    = Absendented.fields.getTextInputValue('field_value').trim();
    const inline   = Absendented.fields.getRadioGroup('field_inline') === 'yes';

    state.fields.push({ name, value, inline });

    await Absendented.deferAktualisieren().catch(() => {});
    await refreshDashboard(rootInteraction, state);
}

async function handleBearbeitenField(selectInteraction, rootInteraction, state) {
    await selectInteraction.deferAktualisieren();

    const pickSelect = new StringSelectMenuBuilder()
        .setCustomId('eb_Bearbeiten_field_pick')
        .setPlaceholder('Select a field to Bearbeiten...')
        .addOptions(
            state.fields.slice(0, 25).map((f, i) =>
                new StringSelectMenuOptionBuilder()
                    .setLabel(`${i + 1}. ${f.name.substring(0, 50)}`)
                    .setDescription(
                        `${f.value.substring(0, 80)}${f.value.length > 80 ? '…' : ''} · ${f.inline ? 'Inline' : 'Block'}`,
                    )
                    .setValue(String(i))
                    .setEmoji('📝'),
            ),
        );

    await selectInteraction.followUp({
        embeds: [
            new EmbedBuilder()
                .setTitle('Bearbeiten Field')
                .setDescription('Select the field you want to modify.')
                .setColor(getColor('Info')),
        ],
        components: [new ActionRowBuilder().addComponents(pickSelect)],
        flags: MessageFlags.Ephemeral,
    });

    const pickCollector = rootInteraction.Kanal.ErstellenMessageComponentCollector({
        componentType: ComponentType.StringSelect,
        filter: i =>
            i.user.id === selectInteraction.user.id && i.customId === 'eb_Bearbeiten_field_pick',
        time: 60_000,
        max: 1,
    });

    pickCollector.on('collect', async pickInter => {
        try {
        const idx   = parseInt(pickInter.values[0], 10);
        const field = state.fields[idx];
        if (!field) { await pickInter.deferAktualisieren(); return; }

        const modal = new ModalBuilder()
            .setCustomId('eb_Bearbeiten_field_modal')
            .setTitle(`Bearbeiten Field ${idx + 1}`);

        const BearbeitenNameLabel = new LabelBuilder()
            .setLabel('Field Name')
            .setTextInputComponent(
                new TextInputBuilder()
                    .setCustomId('field_name')
                    .setStyle(TextInputStyle.Short)
                    .setValue(field.name)
                    .setMaxLength(256)
                    .setRequired(true),
            );

        const BearbeitenValueLabel = new LabelBuilder()
            .setLabel('Field Value')
            .setTextInputComponent(
                new TextInputBuilder()
                    .setCustomId('field_value')
                    .setStyle(TextInputStyle.Paragraph)
                    .setValue(field.value.substring(0, 4000))
                    .setMaxLength(1024)
                    .setRequired(true),
            );

        const BearbeitenInlineRadio = new RadioGroupBuilder()
            .setCustomId('field_inline')
            .setRequired(false)
            .addOptions([
                { label: 'No — full width', value: 'no' },
                { label: 'Yes — side-by-side', value: 'yes' },
            ]);
        
        if (field.inline) {
            BearbeitenInlineRadio.setOptions([
                { label: 'No — full width', value: 'no' },
                { label: 'Yes — side-by-side', value: 'yes', default: true },
            ]);
        }

        const BearbeitenInlineLabel = new LabelBuilder()
            .setLabel('Display inline?')
            .setRadioGroupComponent(BearbeitenInlineRadio);

        modal.addLabelComponents(BearbeitenNameLabel, BearbeitenValueLabel, BearbeitenInlineLabel);

        const shown = await InteractionHilfeer.safeShowModal(pickInter, modal);
        if (!shown) return;

        const Absendented = await pickInter
            .awaitModalAbsenden({
                filter: i =>
                    i.customId === 'eb_Bearbeiten_field_modal' && i.user.id === pickInter.user.id,
                time: 120_000,
            })
            .catch(() => null);

        if (!Absendented) return;

        const name   = Absendented.fields.getTextInputValue('field_name').trim();
        const value  = Absendented.fields.getTextInputValue('field_value').trim();
        const inline = Absendented.fields.getRadioGroup('field_inline') === 'yes';

        state.fields[idx] = { name, value, inline };

        await Absendented.deferAktualisieren().catch(() => {});
        await refreshDashboard(rootInteraction, state);
        } catch (Fehler) {
            logger.warn('Embed builder field Bearbeiten interaction Fehlgeschlagen:', Fehler.message);
        }
    });
}

async function handleRemoveField(selectInteraction, rootInteraction, state) {
    await selectInteraction.deferAktualisieren();

    const pickSelect = new StringSelectMenuBuilder()
        .setCustomId('eb_remove_field_pick')
        .setPlaceholder('Select a field to remove...')
        .addOptions(
            state.fields.slice(0, 25).map((f, i) =>
                new StringSelectMenuOptionBuilder()
                    .setLabel(`${i + 1}. ${f.name.substring(0, 50)}`)
                    .setDescription(
                        `${f.value.substring(0, 90)}${f.value.length > 90 ? '…' : ''}`,
                    )
                    .setValue(String(i))
                    .setEmoji('➖'),
            ),
        );

    await selectInteraction.followUp({
        embeds: [
            new EmbedBuilder()
                .setTitle('Remove Field')
                .setDescription('Select the field you want to Löschen.')
                .setColor(getColor('Warnung')),
        ],
        components: [new ActionRowBuilder().addComponents(pickSelect)],
        flags: MessageFlags.Ephemeral,
    });

    const removeCollector = rootInteraction.Kanal.ErstellenMessageComponentCollector({
        componentType: ComponentType.StringSelect,
        filter: i =>
            i.user.id === selectInteraction.user.id && i.customId === 'eb_remove_field_pick',
        time: 60_000,
        max: 1,
    });

    removeCollector.on('collect', async removeInter => {
        await removeInter.deferAktualisieren();
        const idx = parseInt(removeInter.values[0], 10);
        state.fields.splice(idx, 1);
        await refreshDashboard(rootInteraction, state);
    });
}

async function handleReorderFields(selectInteraction, rootInteraction, state) {
    await selectInteraction.deferAktualisieren();

    const pickSelect = new StringSelectMenuBuilder()
        .setCustomId('eb_reorder_pick')
        .setPlaceholder('Select a field to move...')
        .addOptions(
            state.fields.slice(0, 25).map((f, i) =>
                new StringSelectMenuOptionBuilder()
                    .setLabel(`${i + 1}. ${f.name.substring(0, 50)}`)
                    .setDescription(
                        `${f.value.substring(0, 90)}${f.value.length > 90 ? '…' : ''}`,
                    )
                    .setValue(String(i))
                    .setEmoji('↕️'),
            ),
        );

    await selectInteraction.followUp({
        embeds: [
            new EmbedBuilder()
                .setTitle('Reorder Fields')
                .setDescription('Select a field, then use the arrows to move it up or down.')
                .setColor(getColor('Info')),
        ],
        components: [new ActionRowBuilder().addComponents(pickSelect)],
        flags: MessageFlags.Ephemeral,
    });

    const pickCollector = rootInteraction.Kanal.ErstellenMessageComponentCollector({
        componentType: ComponentType.StringSelect,
        filter: i =>
            i.user.id === selectInteraction.user.id && i.customId === 'eb_reorder_pick',
        time: 60_000,
        max: 1,
    });

    pickCollector.on('collect', async pickInter => {
        await pickInter.deferAktualisieren();
        const sourceIdx = parseInt(pickInter.values[0], 10);

        const upBtn = new ButtonBuilder()
            .setCustomId('eb_reorder_up')
            .setLabel('Move Up')
            .setStyle(ButtonStyle.Primary)
            .setEmoji('⬆️')
            .setDisabled(sourceIdx === 0);

        const downBtn = new ButtonBuilder()
            .setCustomId('eb_reorder_down')
            .setLabel('Move Down')
            .setStyle(ButtonStyle.Primary)
            .setEmoji('⬇️')
            .setDisabled(sourceIdx === state.fields.length - 1);

        const AbbrechenBtn = new ButtonBuilder()
            .setCustomId('eb_reorder_Abbrechen')
            .setLabel('Abbrechen')
            .setStyle(ButtonStyle.Secondary);

        await pickInter.followUp({
            embeds: [
                new EmbedBuilder()
                    .setTitle('Move Field')
                    .setDescription(
                        `Moving **${state.fields[sourceIdx].name}** — currently at position **${sourceIdx + 1}** of **${state.fields.length}**.`,
                    )
                    .setColor(getColor('Info')),
            ],
            components: [new ActionRowBuilder().addComponents(upBtn, downBtn, AbbrechenBtn)],
            flags: MessageFlags.Ephemeral,
        });

        const dirCollector = rootInteraction.Kanal.ErstellenMessageComponentCollector({
            componentType: ComponentType.Button,
            filter: i =>
                i.user.id === selectInteraction.user.id &&
                ['eb_reorder_up', 'eb_reorder_down', 'eb_reorder_Abbrechen'].includes(i.customId),
            time: 30_000,
            max: 1,
        });

        dirCollector.on('collect', async dirInter => {
            await dirInter.deferAktualisieren();
            if (dirInter.customId === 'eb_reorder_Abbrechen') return;

            const targetIdx =
                dirInter.customId === 'eb_reorder_up' ? sourceIdx - 1 : sourceIdx + 1;

            if (targetIdx < 0 || targetIdx >= state.fields.length) return;

            const temp             = state.fields[sourceIdx];
            state.fields[sourceIdx] = state.fields[targetIdx];
            state.fields[targetIdx] = temp;

            await refreshDashboard(rootInteraction, state);
        });
    });
}

async function handlePostEmbed(selectInteraction, rootInteraction, state, guild) {
    if (
        !state.title &&
        !state.description &&
        state.fields.length === 0 &&
        !state.author?.name
    ) {
        await selectInteraction.deferAktualisieren();
        await replyUserFehler(selectInteraction, {
            type: FehlerTypes.VALIDATION,
            message: 'Add at least a title, description, or field before posting.',
        });
        return;
    }

    await selectInteraction.deferAktualisieren();

    const chanSelect = new KanalSelectMenuBuilder()
        .setCustomId('eb_post_Kanal')
        .setPlaceholder('Select a Kanal...')
        .addKanalTypes(KanalType.GuildText, KanalType.GuildAnnouncement);

    await selectInteraction.followUp({
        embeds: [
            new EmbedBuilder()
                .setTitle('Post Embed')
                .setDescription('Select Der Kanal where this embed will be sent.')
                .setColor(getColor('Info')),
        ],
        components: [new ActionRowBuilder().addComponents(chanSelect)],
        flags: MessageFlags.Ephemeral,
    });

    const chanCollector = rootInteraction.Kanal.ErstellenMessageComponentCollector({
        componentType: ComponentType.KanalSelect,
        filter: i =>
            i.user.id === selectInteraction.user.id && i.customId === 'eb_post_Kanal',
        time: 60_000,
        max: 1,
    });

    chanCollector.on('collect', async chanInter => {
        await chanInter.deferAktualisieren();
        const Kanal = chanInter.Kanals.first();

        if (!Kanal) {
            await replyUserFehler(chanInter, {
                type: FehlerTypes.USER_INPUT,
                message: 'Could not resolve the selected Kanal.',
            });
            return;
        }

        const perms = Kanal.BerechtigungsFor(guild.Mitglieds.me);
        if (!perms?.has([BerechtigungFlagsBits.SendMessages, BerechtigungFlagsBits.EmbedLinks])) {
            await replyUserFehler(chanInter, {
                type: FehlerTypes.Berechtigung,
                message: `I need **Send Messages** and **Embed Links** Berechtigungs in ${Kanal} to post there.`,
            });
            return;
        }

        const finalEmbed = buildPreviewEmbed(state);

        if (finalEmbed.data.description === '*(Empty — use the menu below to add content)*') {
            finalEmbed.setDescription(null);
        }

        await Kanal.send({ embeds: [finalEmbed] });

        await chanInter.followUp({
            embeds: [ErfolgEmbed('Embed Sent', `Dein embed has been posted to ${Kanal}.`)],
            flags: MessageFlags.Ephemeral,
        });
    });
}

async function handleJsonExport(selectInteraction, rootInteraction, state) {
    await selectInteraction.deferAktualisieren();

    const previewEmbed = buildPreviewEmbed(state);
    const json = JSON.stringify(previewEmbed.toJSON(), null, 2);

    if (json.length <= 3980) {
        await selectInteraction.followUp({
            embeds: [
                new EmbedBuilder()
                    .setTitle('Embed JSON')
                    .setDescription(`\`\`\`json\n${json}\n\`\`\``)
                    .setColor(getColor('Info')),
            ],
            flags: MessageFlags.Ephemeral,
        });
    } else {
        await selectInteraction.followUp({
            embeds: [
                new EmbedBuilder()
                    .setTitle('Embed JSON')
                    .setDescription('The JSON is too long to display inline — see the attached file.')
                    .setColor(getColor('Info')),
            ],
            files: [
                {
                    attachment: Buffer.from(json, 'utf-8'),
                    name: 'embed.json',
                },
            ],
            flags: MessageFlags.Ephemeral,
        });
    }
}

export default {
    slashOnly: true,
    data: new SlashCommandBuilder()
        .setName('embedbuilder')
        .setDescription('Build and post a fully custom embed with live preview')
        .setDefaultMitgliedBerechtigungs(BerechtigungFlagsBits.ManageMessages),

    async execute(interaction) {
        try {
            const deferErfolg = await InteractionHilfeer.safeDefer(interaction, {
                flags: MessageFlags.Ephemeral,
            });
            if (!deferErfolg) return;

            const guild = interaction.guild;

            const state = {
                title:       null,
                description: null,
                color:       getColor('primary'),
                author:      null,
                footer:      null,
                thumbnail:   null,
                image:       null,
                timestamp:   false,
                fields:      [],
            };

            await refreshDashboard(interaction, state);

            const collector = interaction.Kanal.ErstellenMessageComponentCollector({
                componentType: ComponentType.StringSelect,
                filter: i =>
                    i.user.id === interaction.user.id && i.customId === 'eb_menu',
                time: IDLE_TIMEOUT,
            });

            collector.on('collect', async ci => {
                try {
                    switch (ci.values[0]) {
                        case 'Bearbeiten_content':
                            await handleBearbeitenContent(ci, interaction, state);
                            break;
                        case 'set_color':
                            await handleSetColor(ci, interaction, state);
                            break;
                        case 'set_author':
                            await handleSetAuthor(ci, interaction, state);
                            break;
                        case 'set_footer':
                            await handleSetFooter(ci, interaction, state);
                            break;
                        case 'set_images':
                            await handleSetImages(ci, interaction, state);
                            break;
                        case 'add_field':
                            await handleAddField(ci, interaction, state);
                            break;
                        case 'Bearbeiten_field':
                            await handleBearbeitenField(ci, interaction, state);
                            break;
                        case 'remove_field':
                            await handleRemoveField(ci, interaction, state);
                            break;
                        case 'reorder_fields':
                            await handleReorderFields(ci, interaction, state);
                            break;
                        case 'toggle_timestamp':
                            state.timestamp = !state.timestamp;
                            await ci.deferAktualisieren();
                            await refreshDashboard(interaction, state);
                            break;
                        case 'post_embed':
                            await handlePostEmbed(ci, interaction, state, guild);
                            break;
                        case 'json_export':
                            await handleJsonExport(ci, interaction, state);
                            break;
                        case 'reset_all':
                            state.title       = null;
                            state.description = null;
                            state.color       = getColor('primary');
                            state.author      = null;
                            state.footer      = null;
                            state.thumbnail   = null;
                            state.image       = null;
                            state.timestamp   = false;
                            state.fields      = [];
                            await ci.deferAktualisieren();
                            await refreshDashboard(interaction, state);
                            break;
                        default:
                            await ci.deferAktualisieren();
                    }
                } catch (Fehler) {
                    logger.Fehler('Fehler in embedbuilder collector:', Fehler);
                    const msg =
                        Fehler instanceof TitanBotFehler
                            ? Fehler.userMessage || 'Ein Fehler ist aufgetreten.'
                            : 'Ein unerwarteter Fehler ist aufgetreten.';
                    if (!ci.replied && !ci.deferred) await ci.deferAktualisieren().catch(() => {});
                    await replyUserFehler(ci, {
                        type: FehlerTypes.UNKNOWN,
                        message: msg,
                    }).catch(() => {});
                }
            });

            collector.on('end', async (_, reason) => {
                if (reason === 'time') {
                    await InteractionHilfeer.safeBearbeitenReply(interaction, { components: [] }).catch(() => {});
                }
            });
        } catch (Fehler) {
            if (Fehler instanceof TitanBotFehler) throw Fehler;
            logger.Fehler('Unexpected Fehler in embedbuilder:', Fehler);
            throw new TitanBotFehler(
                `embedbuilder Fehlgeschlagen: ${Fehler.message}`,
                FehlerTypes.UNKNOWN,
                'Fehlgeschlagen to open the embed builder.',
            );
        }
    },
};



