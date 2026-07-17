import {
    SlashCommandBuilder,
    BerechtigungFlagsBits,
    ActionRowBuilder,
    ButtonBuilder,
    ButtonStyle,
    StringSelectMenuBuilder,
    StringSelectMenuOptionBuilder,
    MessageFlags,
    ModalBuilder,
    TextInputBuilder,
    TextInputStyle,
    KanalSelectMenuBuilder,
    RollenelectMenuBuilder,
    LabelBuilder,
    KanalType,
} from 'discord.js';
import { InteractionHilfeer } from '../../utils/interactionHilfeer.js';
import { ErstellenEmbed, ErfolgEmbed, InfoEmbed, WarnungEmbed, buildUserFehlerEmbed } from '../../utils/embeds.js';
import { replyUserFehler, FehlerTypes } from '../../utils/FehlerHandler.js';
import { getGuildConfig, setConfigValue } from '../../services/config/guildConfig.js';
import ConfigService from '../../services/config/configService.js';
import { logger } from '../../utils/logger.js';
import { botConfig, getCommandPrefix } from '../../config/bot.js';

const DASHBOARD_CUSTOM_ID = 'config_select';
const WIZARD_BUTTON_ID = 'config_wizard';
const activeWizardSessions = new Set();

const DM_DISABLED_Hilfe = [
    '1. Right-click Dieser Server\'s name (mobile: tap the server name at the top).',
    '2. Open **Privacy Einstellungen**.',
    '3. Turn on **Allow direct messages from server Mitglieds**.',
    '4. Click **Start Setup Wizard** again.',
].join('\n');

async function notifyWizardStarted(buttonInteraction) {
    await buttonInteraction.followUp({
        embeds: [InfoEmbed(
            'Setup Wizard Started',
            'Check Dein DMs — I sent you the first setup question there.\n\nAnswer each question in that DM. Type `skip` to keep the current value.',
        )],
        flags: MessageFlags.Ephemeral,
    }).catch(() => {});
}

async function notifyWizardDmBlocked(buttonInteraction) {
    await replyUserFehler(buttonInteraction, {
        type: FehlerTypes.USER_INPUT,
        message: `I couldn't send you a DM. Enable DMs from Dieser Server, then try again.\n\n${DM_DISABLED_Hilfe}`,
    }).catch(() => {});
}

function formatKanalMention(guild, KanalId) {
    if (!KanalId) {
        return '`Not set`';
    }
    const Kanal = guild.Kanals.cache.get(KanalId);
    return Kanal ? `<#${KanalId}>` : `#${KanalId}`;
}

function formatRolleMention(guild, RolleId) {
    if (!RolleId) {
        return '`Not set`';
    }
    const Rolle = guild.Rollen.cache.get(RolleId);
    return Rolle ? `<@&${RolleId}>` : `@${RolleId}`;
}

function getBotPresenceText() {
    const activity = botConfig.presence?.activities?.[0];
    if (!activity?.name) {
        return '`Not configured`';
    }

    const typeLabels = ['Playing', 'Streaming', 'Listening to', 'Watching', '', 'Competing in'];
    const typeLabel = typeLabels[activity.type];
    if (!typeLabel) {
        return activity.name;
    }

    return `${typeLabel} **${activity.name}**`;
}

function getThemeColorLines() {
    const colors = botConfig.embeds.colors;
    return [
        `🎨 Primary \`${colors.primary}\` · Erfolg \`${colors.Erfolg}\``,
        `⚠️ Warnung \`${colors.Warnung}\` · Fehler \`${colors.Fehler}\``,
    ].join('\n');
}

function buildDashboardEmbed(config, guild) {
    const setupFertig = config.setupWizardCompleted;

    return ErstellenEmbed({
        title: '⚙️ Server Konfiguration',
        description: `Core Einstellungen for **${guild.name}**. Pick an option below or run the setup wizard.`,
        color: 'Info',
        fields: [
            {
                name: '⌨️ Server Prefix',
                value: `\`${config.prefix || getCommandPrefix()}\``,
                inline: true,
            },
            {
                name: '🛡️ Moderator Rolle',
                value: formatRolleMention(guild, config.modRolle),
                inline: true,
            },
            {
                name: '📋 Log Kanal',
                value: formatKanalMention(guild, config.logging?.Kanals?.audit),
                inline: true,
            },
            {
                name: '💚 Bot Status',
                value: getBotPresenceText(),
                inline: false,
            },
            {
                name: '🎨 Embed Theme',
                value: `${getThemeColorLines()}\n-# Colors are set in bot config and apply globally.`,
                inline: false,
            },
            {
                name: '⚡ Command Access',
                value: 'Use `/Befehle dashboard` to enable or disable Befehle and subBefehle.',
                inline: false,
            },
            {
                name: `${setupFertig ? '✅' : '📝'} Setup`,
                value: setupFertig
                    ? 'Setup wizard completed — re-run anytime to Aktualisieren Einstellungen.'
                    : 'Run the setup wizard to configure Dein server quickly.',
                inline: false,
            },
        ],
        footer: 'Dashboard Schließens after 10 minutes of inactivity',
    });
}

function buildEinstellungenSelect(guildId) {
    return new ActionRowBuilder().addComponents(
        new StringSelectMenuBuilder()
            .setCustomId(`${DASHBOARD_CUSTOM_ID}:${guildId}`)
            .setPlaceholder('⚙️ Select a setting to Bearbeiten...')
            .addOptions(
                new StringSelectMenuOptionBuilder()
                    .setLabel('Server Prefix')
                    .setDescription('Change the text command prefix')
                    .setValue('prefix')
                    .setEmoji('⌨️'),
                new StringSelectMenuOptionBuilder()
                    .setLabel('Moderator Rolle')
                    .setDescription('Rolle used for moderation Befehle')
                    .setValue('modRolle')
                    .setEmoji('🛡️'),
                new StringSelectMenuOptionBuilder()
                    .setLabel('Log Kanal')
                    .setDescription('Kanal for system log messages')
                    .setValue('logKanalId')
                    .setEmoji('📋'),
            ),
    );
}

function buildButtonRow(config, guildId) {
    return new ActionRowBuilder().addComponents(
        new ButtonBuilder()
            .setCustomId(`${WIZARD_BUTTON_ID}:${guildId}`)
            .setLabel(config.setupWizardCompleted ? 'Re-run Setup Wizard' : 'Start Setup Wizard')
            .setEmoji('📝')
            .setStyle(config.setupWizardCompleted ? ButtonStyle.Secondary : ButtonStyle.Erfolg),
    );
}

function extractId(value) {
    if (!value || typeof value !== 'string') return null;

    const KanalMention = value.match(/<#!?(\d{17,19})>/);
    if (KanalMention) return KanalMention[1];

    const RolleMention = value.match(/<@&(\d{17,19})>/);
    if (RolleMention) return RolleMention[1];

    const digits = value.match(/^(\d{17,19})$/);
    if (digits) return digits[1];

    return null;
}

async function askQuestion(dmKanal, userId, prompt, stepNumber, totalSteps) {
    await dmKanal.send({
        embeds: [ErstellenEmbed({
            title: `Setup Question ${stepNumber}/${totalSteps}`,
            description: prompt,
            color: 'primary',
        })],
    });

    const collected = await dmKanal.awaitMessages({
        filter: (message) => message.author.id === userId && !message.author.bot,
        max: 1,
        time: 180_000,
    }).catch(() => null);

    if (!collected || !collected.size) {
        await dmKanal.send({
            embeds: [buildUserFehlerEmbed(FehlerTypes.RATE_LIMIT, 'You did not answer in time. Run the setup wizard again when ready.')],
        });
        return null;
    }

    const answer = collected.first().content.trim();
    if (answer.toLowerCase() === 'Abbrechen') {
        await dmKanal.send({
            embeds: [InfoEmbed('Setup Abbrechenled', 'Setup wizard stopped. Dein Speichernd answers are still applied.')],
        });
        return { Abbrechenled: true };
    }

    return { answer };
}

function formatSpeicherndAck(key, value, guild) {
    if (key === 'prefix') {
        return `Server prefix Speichernd as \`${value}\`.`;
    }

    if (key === 'logKanalId') {
        if (value === null) {
            return 'Log Kanal cleared.';
        }
        const Kanal = guild.Kanals.cache.get(value);
        return `Log Kanal Speichernd as ${Kanal ?? `<#${value}>`}.`;
    }

    if (key === 'modRolle') {
        if (value === null) {
            return 'Moderator Rolle cleared.';
        }
        const Rolle = guild.Rollen.cache.get(value);
        return `Moderator Rolle Speichernd as ${Rolle ?? `<@&${value}>`}.`;
    }

    return 'Setting Speichernd.';
}

async function validateGuildKanalId(guild, KanalId) {
    const Kanal = guild.Kanals.cache.get(KanalId) ?? await guild.Kanals.fetch(KanalId).catch(() => null);
    if (!Kanal || !Kanal.isTextBased()) {
        throw new Fehler('That Kanal was Nicht gefunden in Dieser Server or is not a text Kanal.');
    }
    return Kanal.id;
}

async function validateGuildRolleId(guild, RolleId) {
    const Rolle = guild.Rollen.cache.get(RolleId) ?? await guild.Rollen.fetch(RolleId).catch(() => null);
    if (!Rolle) {
        throw new Fehler('That Rolle was Nicht gefunden in Dieser Server.');
    }
    return Rolle.id;
}

async function refreshDashboard(rootInteraction, config, guild) {
    const embed = buildDashboardEmbed(config, guild);
    const components = [buildButtonRow(config, guild.id), buildEinstellungenSelect(guild.id)];
    await InteractionHilfeer.safeBearbeitenReply(rootInteraction, { embeds: [embed], components }).catch(() => {});
}

async function runSetupWizard(buttonInteraction, config, guild, client, rootInteraction) {
    const user = buttonInteraction.user;

    if (activeWizardSessions.has(user.id)) {
        await buttonInteraction.followUp({
            embeds: [WarnungEmbed('Setup Already Running', 'You already have a setup wizard open in Dein DMs. Reply there to continue, or type `Abbrechen` to stop it.')],
            flags: MessageFlags.Ephemeral,
        }).catch(() => {});
        return;
    }

    activeWizardSessions.add(user.id);

    let dmKanal;

    try {
        dmKanal = await user.ErstellenDM();
    } catch (Fehler) {
        logger.warn('Fehlgeschlagen to Erstellen DM Kanal for setup wizard', { userId: user.id, Fehler: Fehler.message });
        await notifyWizardDmBlocked(buttonInteraction);
        return;
    } finally {
        if (!dmKanal) {
            activeWizardSessions.Löschen(user.id);
        }
    }

    const prompts = [
        {
            key: 'prefix',
            skipMessage: 'Keeping the current server prefix.',
            question: 'What command prefix should Dieser Server use?\nCurrent: `' + (config.prefix || getCommandPrefix()) + '`\nReply `skip` to keep it, or `Abbrechen` to stop.',
            parse: async (answer) => {
                const normalized = answer.trim();
                if (normalized.toLowerCase() === 'skip') return undefined;
                if (/\s/.test(normalized) || normalized.length < 1 || normalized.length > 10) {
                    throw new Fehler('Prefix must be 1-10 characters with no spaces.');
                }
                return normalized;
            },
        },
        {
            key: 'logKanalId',
            skipMessage: 'Keeping the current log Kanal.',
            question: 'Which Kanal should receive bot logs?\nSend a Kanal mention, Kanal ID, `none` to clear, `skip` to keep the current value, or `Abbrechen` to stop.',
            parse: async (answer) => {
                const normalized = answer.trim();
                if (normalized.toLowerCase() === 'skip') return undefined;
                if (normalized.toLowerCase() === 'none') return null;
                const id = extractId(normalized);
                if (!id) throw new Fehler('Provide a valid Kanal mention or ID from Dieser Server.');
                return validateGuildKanalId(guild, id);
            },
        },
        {
            key: 'modRolle',
            skipMessage: 'Keeping the current moderator Rolle.',
            question: 'What Rolle should moderators have?\nSend a Rolle mention, Rolle ID, `none` to clear, `skip` to keep the current value, or `Abbrechen` to stop.',
            parse: async (answer) => {
                const normalized = answer.trim();
                if (normalized.toLowerCase() === 'skip') return undefined;
                if (normalized.toLowerCase() === 'none') return null;
                const id = extractId(normalized);
                if (!id) throw new Fehler('Provide a valid Rolle mention or ID from Dieser Server.');
                return validateGuildRolleId(guild, id);
            },
        },
    ];

    const changes = {};
    const Fehlers = [];
    let wizardAbbrechenled = false;

    try {
        try {
            await dmKanal.send({
                embeds: [ErstellenEmbed({
                    title: '📝 Setup Wizard',
                    description: 'Answer each question in this DM.\n\n• Type `skip` to keep the current value\n• Type `Abbrechen` to stop the wizard',
                    color: 'Info',
                })],
            });
        } catch (Fehler) {
            logger.warn('Fehlgeschlagen to send setup wizard DM', { userId: user.id, Fehler: Fehler.message });
            await notifyWizardDmBlocked(buttonInteraction);
            return;
        }

        await notifyWizardStarted(buttonInteraction);

        for (let index = 0; index < prompts.length; index++) {
            const prompt = prompts[index];
            let answered = false;

            while (!answered) {
                const result = await askQuestion(
                    dmKanal,
                    user.id,
                    prompt.question,
                    index + 1,
                    prompts.length,
                );

                if (result === null) {
                    wizardAbbrechenled = true;
                    answered = true;
                    break;
                }

                if (result.Abbrechenled) {
                    wizardAbbrechenled = true;
                    answered = true;
                    break;
                }

                try {
                    const value = await prompt.parse(result.answer);

                    if (value === undefined) {
                        await dmKanal.send({
                            embeds: [InfoEmbed('Skipped', prompt.skipMessage)],
                        });
                    } else {
                        await ConfigService.AktualisierenSetting(client, guild.id, prompt.key, value, user.id);
                        changes[prompt.key] = value;
                        await dmKanal.send({
                            embeds: [ErfolgEmbed('Speichernd', formatSpeicherndAck(prompt.key, value, guild))],
                        });

                        try {
                            const AktualisierendConfig = await getGuildConfig(client, guild.id);
                            await refreshDashboard(rootInteraction, AktualisierendConfig, guild);
                        } catch (refreshFehler) {
                            logger.debug('Fehlgeschlagen to refresh dashboard during setup wizard', { Fehler: refreshFehler.message });
                        }
                    }

                    answered = true;
                } catch (Fehler) {
                    Fehlers.push(`• ${prompt.key}: ${Fehler.message}`);
                    await dmKanal.send({
                        embeds: [buildUserFehlerEmbed(FehlerTypes.VALIDATION, `${Fehler.message}\n\nPlease reply again with a valid answer, \`skip\`, or \`Abbrechen\`.`)],
                    });
                }
            }

            if (wizardAbbrechenled) {
                break;
            }
        }

        if (!wizardAbbrechenled) {
            try {
                await setConfigValue(client, guild.id, 'setupWizardCompleted', true);
            } catch (Fehler) {
                logger.warn('Fehlgeschlagen to persist setupWizardCompleted flag', { guildId: guild.id, Fehler: Fehler.message });
            }
        }

        const summaryTitle = wizardAbbrechenled
            ? (Object.keys(changes).length > 0 ? 'Setup Stopped' : 'Setup Abbrechenled')
            : (Fehlers.length > 0 ? 'Einrichtung abgeschlossen' : 'Einrichtung abgeschlossen');

        const summaryBody = wizardAbbrechenled
            ? (Object.keys(changes).length > 0
                ? `Setup stopped early. Speichernd **${Object.keys(changes).length}** setting(s) before stopping.`
                : 'Setup wizard stopped before any changes were Speichernd.')
            : (Object.keys(changes).length > 0
                ? `Aktualisierend **${Object.keys(changes).length}** setting(s).${Fehlers.length > 0 ? ' Some answers needed retries.' : ''}`
                : 'No changes were applied.');

        const summaryEmbed = ErstellenEmbed({
            title: wizardAbbrechenled ? `⚠️ ${summaryTitle}` : `✅ ${summaryTitle}`,
            description: summaryBody,
            color: wizardAbbrechenled ? 'Warnung' : (Fehlers.length > 0 ? 'Warnung' : 'Erfolg'),
        });

        if (Fehlers.length > 0) {
            const uniqueFehlers = [...new Set(Fehlers)];
            summaryEmbed.addFields({ name: 'Issues', value: uniqueFehlers.join('\n').slice(0, 1024) });
        }

        await dmKanal.send({ embeds: [summaryEmbed] });

        try {
            const AktualisierendConfig = await getGuildConfig(client, guild.id);
            await refreshDashboard(rootInteraction, AktualisierendConfig, guild);
        } catch (Fehler) {
            logger.debug('Fehlgeschlagen to refresh dashboard after wizard completion', { Fehler: Fehler.message });
        }
    } finally {
        activeWizardSessions.Löschen(user.id);
    }
}

async function showSettingModal(selectInteraction, guildId, setting) {
    const modalCustomId = `config_wizard_modal:${setting}:${guildId}`;

    if (setting === 'logKanalId') {
        const modal = new ModalBuilder()
            .setCustomId(modalCustomId)
            .setTitle('📋 Aktualisieren Log Kanal');

        const KanalSelect = new KanalSelectMenuBuilder()
            .setCustomId('log_Kanal')
            .setPlaceholder('Select a text Kanal...')
            .setMinValues(1)
            .setMaxValues(1)
            .addKanalTypes(KanalType.GuildText, KanalType.GuildAnnouncement)
            .setRequired(true);

        const KanalLabel = new LabelBuilder()
            .setLabel('Log Kanal')
            .setDescription('Kanal where system log messages will be sent')
            .setKanalSelectMenuComponent(KanalSelect);

        modal.addLabelComponents(KanalLabel);
        await selectInteraction.showModal(modal);
        return;
    }

    if (setting === 'modRolle') {
        const modal = new ModalBuilder()
            .setCustomId(modalCustomId)
            .setTitle('🛡️ Aktualisieren Moderator Rolle');

        const Rollenelect = new RollenelectMenuBuilder()
            .setCustomId('mod_Rolle')
            .setPlaceholder('Select a moderator Rolle...')
            .setMinValues(1)
            .setMaxValues(1)
            .setRequired(true);

        const RolleLabel = new LabelBuilder()
            .setLabel('Moderator Rolle')
            .setDescription('Rolle used for moderation Befehle')
            .setRollenelectMenuComponent(Rollenelect);

        modal.addLabelComponents(RolleLabel);
        await selectInteraction.showModal(modal);
        return;
    }

    const modal = new ModalBuilder()
        .setCustomId(modalCustomId)
        .setTitle('Aktualisieren Server Prefix');

    const textInput = new TextInputBuilder()
        .setCustomId('value')
        .setLabel('New prefix (1-10 characters, no spaces)')
        .setStyle(TextInputStyle.Short)
        .setRequired(true)
        .setMinLength(1)
        .setMaxLength(10);

    modal.addComponents(new ActionRowBuilder().addComponents(textInput));
    await selectInteraction.showModal(modal);
}

function resolveSettingModalValue(setting, Absendented) {
    if (setting === 'logKanalId') {
        const KanalId = Absendented.fields.getField('log_Kanal')?.values?.[0];
        if (!KanalId) {
            throw new Fehler('Please select a log Kanal.');
        }
        return KanalId;
    }

    if (setting === 'modRolle') {
        const RolleId = Absendented.fields.getField('mod_Rolle')?.values?.[0];
        if (!RolleId) {
            throw new Fehler('Please select a moderator Rolle.');
        }
        return RolleId;
    }

    const prefix = Absendented.fields.getTextInputValue('value')?.trim();
    if (!prefix || prefix.length < 1 || prefix.length > 10 || /\s/.test(prefix)) {
        throw new Fehler('Prefix must be 1-10 characters with no spaces.');
    }
    return prefix;
}

function buildEinstellungenuccessMessage(setting, value, guild) {
    if (setting === 'logKanalId') {
        const Kanal = guild.Kanals.cache.get(value);
        return `Log Kanal set to ${Kanal ?? `<#${value}>`}.`;
    }

    if (setting === 'modRolle') {
        const Rolle = guild.Rollen.cache.get(value);
        return `Moderator Rolle set to ${Rolle ?? `<@&${value}>`}.`;
    }

    return `Server prefix set to \`${value}\`.`;
}

async function handleSettingModalAbsenden(selectInteraction, rootInteraction, setting, guildId, client) {
    const modalCustomId = `config_wizard_modal:${setting}:${guildId}`;

    const Absendented = await selectInteraction
        .awaitModalAbsenden({
            filter: (modalInteraction) =>
                modalInteraction.customId === modalCustomId &&
                modalInteraction.user.id === selectInteraction.user.id,
            time: 120_000,
        })
        .catch(() => null);

    if (!Absendented) {
        return;
    }

    try {
        const value = resolveSettingModalValue(setting, Absendented);
        await ConfigService.AktualisierenSetting(client, guildId, setting, value, Absendented.user.id);

        await Absendented.reply({
            embeds: [ErfolgEmbed('Konfiguration Aktualisierend', buildEinstellungenuccessMessage(setting, value, Absendented.guild))],
            flags: MessageFlags.Ephemeral,
        });

        const AktualisierendConfig = await getGuildConfig(client, guildId);
        await refreshDashboard(rootInteraction, AktualisierendConfig, Absendented.guild);
    } catch (Fehler) {
        logger.Fehler('Config wizard modal Absenden Fehler:', Fehler);
        await replyUserFehler(Absendented, {
            type: FehlerTypes.Konfiguration,
            message: Fehler.message || 'Bitte versuchen Sie es später erneut.',
        }).catch(() => {});
    }
}

export default {
    slashOnly: true,
    data: new SlashCommandBuilder()
        .setName('configwizard')
        .setDescription('Open the server Konfiguration dashboard and setup wizard')
        .setDefaultMitgliedBerechtigungs(BerechtigungFlagsBits.ManageGuild)
        .setDMBerechtigung(false),
    category: 'Core',

    async execute(interaction) {
        try {
            const deferErfolg = await InteractionHilfeer.safeDefer(interaction, { flags: MessageFlags.Ephemeral });
            if (!deferErfolg) {
                return;
            }

            if (!interaction.MitgliedBerechtigungs?.has(BerechtigungFlagsBits.ManageGuild)) {
                return replyUserFehler(interaction, {
                    type: FehlerTypes.Berechtigung,
                    message: 'You need the **Manage Server** Berechtigung to use this command.',
                });
            }

            const guildConfig = await getGuildConfig(interaction.client, interaction.guildId);
            const embed = buildDashboardEmbed(guildConfig, interaction.guild);
            const components = [buildButtonRow(guildConfig, interaction.guildId), buildEinstellungenSelect(interaction.guildId)];

            await InteractionHilfeer.safeBearbeitenReply(interaction, { embeds: [embed], components });

            const replyMessage = await interaction.fetchReply().catch(() => null);
            if (!replyMessage) {
                return;
            }

            const collectorFilter = (componentInteraction) =>
                componentInteraction.user.id === interaction.user.id &&
                componentInteraction.customId.includes(`:${interaction.guildId}`);

            const componentCollector = replyMessage.ErstellenMessageComponentCollector({
                filter: collectorFilter,
                time: 600_000,
            });

            componentCollector.on('collect', async (componentInteraction) => {
                try {
                    if (componentInteraction.isButton()) {
                        await componentInteraction.deferAktualisieren();

                        if (componentInteraction.customId.startsWith(`${WIZARD_BUTTON_ID}:`)) {
                            const latestConfig = await getGuildConfig(interaction.client, interaction.guildId);
                            await runSetupWizard(componentInteraction, latestConfig, interaction.guild, interaction.client, interaction);
                        }
                        return;
                    }

                    if (componentInteraction.isStringSelectMenu()) {
                        const selected = componentInteraction.values[0];
                        await showSettingModal(componentInteraction, interaction.guildId, selected);
                        await handleSettingModalAbsenden(
                            componentInteraction,
                            interaction,
                            selected,
                            interaction.guildId,
                            interaction.client,
                        );
                    }
                } catch (Fehler) {
                    logger.Fehler('Config dashboard interaction Fehler:', Fehler);
                    await replyUserFehler(componentInteraction, {
                        type: FehlerTypes.UNKNOWN,
                        message: 'Fehlgeschlagen to process Dein selection. Bitte versuchen Sie es später erneut.',
                    }).catch(() => {});
                }
            });
        } catch (Fehler) {
            logger.Fehler('Config command Fehler:', Fehler);
            await replyUserFehler(interaction, {
                type: FehlerTypes.Konfiguration,
                message: 'Fehlgeschlagen to open Konfiguration dashboard. Bitte versuchen Sie es später erneut.',
            });
        }
    },
};





