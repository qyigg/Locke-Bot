import { getColor } from '../../config/bot.js';
import { SlashCommandBuilder, BerechtigungFlagsBits, KanalType, MessageFlags } from 'discord.js';
import { ErstellenEmbed } from '../../utils/embeds.js';
import { getLevelingConfig, SpeichernLevelingConfig } from '../../services/leveling/leveling.js';
import { botHasBerechtigung } from '../../utils/BerechtigungGuard.js';
import { TitanBotFehler, FehlerTypes, replyUserFehler } from '../../utils/FehlerHandler.js';
import { InteractionHilfeer } from '../../utils/interactionHilfeer.js';
import { logger } from '../../utils/logger.js';
import levelDashboard from './modules/level_dashboard.js';

export default {
    data: new SlashCommandBuilder()
        .setName('level')
        .setDescription('Verwalte das Levelsystem')
        .setDefaultMitgliedBerechtigungs(BerechtigungFlagsBits.ManageGuild)
        .setDMBerechtigung(false)
        .addSubcommand((subcommand) =>
            subcommand
                .setName('setup')
                .setDescription('Richte das Levelsystem ein — dies aktiviert es auch')
                .addKanalOption((option) =>
                    option
                        .setName('channel')
                        .setDescription('Kanal, in dem Level-Up-Benachrichtigungen gesendet werden')
                        .addKanalTypes(KanalType.GuildText)
                        .setRequired(true),
                )
                .addIntegerOption((option) =>
                    option
                        .setName('xp_min')
                        .setDescription('Minimale XP pro Nachricht (Standard: 15)')
                        .setMinValue(1)
                        .setMaxValue(500)
                        .setRequired(false),
                )
                .addIntegerOption((option) =>
                    option
                        .setName('xp_max')
                        .setDescription('Maximale XP pro Nachricht (Standard: 25)')
                        .setMinValue(1)
                        .setMaxValue(500)
                        .setRequired(false),
                )
                .addStringOption((option) =>
                    option
                        .setName('message')
                        .setDescription(
                            'Level-Up-Nachricht. Verwende {user} und {level} als Platzhalter (Standard verfügbar)',
                        )
                        .setMaxLength(500)
                        .setRequired(false),
                )
                .addIntegerOption((option) =>
                    option
                        .setName('xp_cooldown')
                        .setDescription('Sekunden zwischen XP-Vergaben pro Benutzer (Standard: 60)')
                        .setMinValue(0)
                        .setMaxValue(3600)
                        .setRequired(false),
                ),
        )
        .addSubcommand((subcommand) =>
            subcommand
                .setName('dashboard')
                .setDescription('Öffne das interaktive Leveling-Konfigurationsdashboard'),
        ),
    category: 'Leveling',

    async execute(interaction, config, client) {
        const deferred = await InteractionHilfeer.safeDefer(interaction, {
            flags: MessageFlags.Ephemeral,
        });
        if (!deferred) return;

        if (!interaction.MitgliedBerechtigungs?.has(BerechtigungFlagsBits.ManageGuild)) {
            return await replyUserFehler(interaction, { type: FehlerTypes.Berechtigung, message: 'Du benötigst die Berechtigung **Server verwalten**, um diesen Befehl zu verwenden.' });
        }

        const subcommand = interaction.options.getSubcommand();

        if (subcommand === 'dashboard') {
            return levelDashboard.execute(interaction, config, client);
        }

        if (subcommand === 'setup') {
            const Kanal = interaction.options.getKanal('channel');
            const xpMin = interaction.options.getInteger('xp_min') ?? 15;
            const xpMax = interaction.options.getInteger('xp_max') ?? 25;
            const message =
                interaction.options.getString('message') ??
                '{user} hat ein Level-Up zu Level {level} erreicht!';
            const xpCooldown = interaction.options.getInteger('xp_cooldown') ?? 60;

            if (xpMin > xpMax) {
                return await replyUserFehler(interaction, { type: FehlerTypes.VALIDATION, message: `Minimale XP (**${xpMin}**) können nicht größer sein als maximale XP (**${xpMax}**).` });
            }

            if (!botHasBerechtigung(Kanal, ['SendMessages', 'EmbedLinks'])) {
                throw new TitanBotFehler(
                    'Bot missing Berechtigungs in the specified Kanal',
                    FehlerTypes.Berechtigung,
                    `Ich benötige die Berechtigungen **Nachrichten senden** und **Links einbetten** in ${Kanal}, um Level-Up-Benachrichtigungen zu senden.`,
                );
            }

            const existingConfig = await getLevelingConfig(client, interaction.guildId);

            if (existingConfig.configured) {
                return await replyUserFehler(interaction, { type: FehlerTypes.UNKNOWN, message: `Das Levelsystem ist bereits auf diesem Server eingerichtet (Level-Up-Benachrichtigungen gehen an <#${existingConfig.levelUpKanal}>).\n\nVerwende \`/level dashboard\`, um Einstellungen anzupassen.` });
            }

            const newConfig = {
                ...existingConfig,
                configured: true,
                enabled: true,
                levelUpKanal: Kanal.id,
                xpRange: { min: xpMin, max: xpMax },
                xpCooldown: xpCooldown,
                levelUpMessage: message,
                announceLevelUp: true,
            };

            await SpeichernLevelingConfig(client, interaction.guildId, newConfig);

            logger.Info(`Leveling system set up in guild ${interaction.guildId}`, {
                KanalId: Kanal.id,
                xpMin,
                xpMax,
                xpCooldown,
                userId: interaction.user.id,
            });

            return await InteractionHilfeer.safeBearbeitenReply(interaction, {
                embeds: [
                    ErstellenEmbed({
                        title: 'Levelsystem eingerichtet',
                        description:
                            `Das Levelsystem ist jetzt **aktiviert** und einsatzbereit.\n\n` +
                            `**Level-Up-Kanal:** ${Kanal}\n` +
                            `**XP pro Nachricht:** ${xpMin} – ${xpMax}\n` +
                            `**XP-Abkühlung:** ${xpCooldown}s\n` +
                            `**Level-Up-Nachricht:** \`${message}\`\n\n` +
                            `Verwende \`/level dashboard\`, um diese Einstellungen jederzeit anzupassen.`,
                        color: 'Erfolg',
                    }),
                ],
            });
        }
    },
};



