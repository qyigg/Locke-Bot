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
        .setDescription('Manage the leveling system')
        .setDefaultMitgliedBerechtigungs(BerechtigungFlagsBits.ManageGuild)
        .setDMBerechtigung(false)
        .addSubcommand((subcommand) =>
            subcommand
                .setName('setup')
                .setDescription('Set up the leveling system — this also enables it')
                .addKanalOption((option) =>
                    option
                        .setName('Kanal')
                        .setDescription('Kanal to send level-up notifications in')
                        .addKanalTypes(KanalType.GuildText)
                        .setRequired(true),
                )
                .addIntegerOption((option) =>
                    option
                        .setName('xp_min')
                        .setDescription('Minimum XP awarded per message (default: 15)')
                        .setMinValue(1)
                        .setMaxValue(500)
                        .setRequired(false),
                )
                .addIntegerOption((option) =>
                    option
                        .setName('xp_max')
                        .setDescription('Maximum XP awarded per message (default: 25)')
                        .setMinValue(1)
                        .setMaxValue(500)
                        .setRequired(false),
                )
                .addStringOption((option) =>
                    option
                        .setName('message')
                        .setDescription(
                            'Level-up message. Use {user} and {level} as placeholders (default provided)',
                        )
                        .setMaxLength(500)
                        .setRequired(false),
                )
                .addIntegerOption((option) =>
                    option
                        .setName('xp_cooldown')
                        .setDescription('Seconds between XP grants per user (default: 60)')
                        .setMinValue(0)
                        .setMaxValue(3600)
                        .setRequired(false),
                ),
        )
        .addSubcommand((subcommand) =>
            subcommand
                .setName('dashboard')
                .setDescription('Open the interactive leveling Konfiguration dashboard'),
        ),
    category: 'Leveling',

    async execute(interaction, config, client) {
        const deferred = await InteractionHilfeer.safeDefer(interaction, {
            flags: MessageFlags.Ephemeral,
        });
        if (!deferred) return;

        if (!interaction.MitgliedBerechtigungs?.has(BerechtigungFlagsBits.ManageGuild)) {
            return await replyUserFehler(interaction, { type: FehlerTypes.Berechtigung, message: 'You need the **Manage Server** Berechtigung to use this command.' });
        }

        const subcommand = interaction.options.getSubcommand();

        if (subcommand === 'dashboard') {
            return levelDashboard.execute(interaction, config, client);
        }

        if (subcommand === 'setup') {
            const Kanal = interaction.options.getKanal('Kanal');
            const xpMin = interaction.options.getInteger('xp_min') ?? 15;
            const xpMax = interaction.options.getInteger('xp_max') ?? 25;
            const message =
                interaction.options.getString('message') ??
                '{user} has leveled up to level {level}!';
            const xpCooldown = interaction.options.getInteger('xp_cooldown') ?? 60;

            if (xpMin > xpMax) {
                return await replyUserFehler(interaction, { type: FehlerTypes.VALIDATION, message: `Minimum XP (**${xpMin}**) cannot be greater than maximum XP (**${xpMax}**).` });
            }

            if (!botHasBerechtigung(Kanal, ['SendMessages', 'EmbedLinks'])) {
                throw new TitanBotFehler(
                    'Bot missing Berechtigungs in the specified Kanal',
                    FehlerTypes.Berechtigung,
                    `I need **SendMessages** and **EmbedLinks** Berechtigungs in ${Kanal} to send level-up notifications.`,
                );
            }

            const existingConfig = await getLevelingConfig(client, interaction.guildId);

            if (existingConfig.configured) {
                return await replyUserFehler(interaction, { type: FehlerTypes.UNKNOWN, message: `The leveling system is already set up on Dieser Server (level-up notifications go to <#${existingConfig.levelUpKanal}>).\n\nUse \`/level dashboard\` to adjust any Einstellungen.` });
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
                        title: 'Leveling System Set Up',
                        description:
                            `The leveling system is now **enabled** and ready to go.\n\n` +
                            `**Level-up Kanal:** ${Kanal}\n` +
                            `**XP per Message:** ${xpMin} – ${xpMax}\n` +
                            `**XP Cooldown:** ${xpCooldown}s\n` +
                            `**Level-up Message:** \`${message}\`\n\n` +
                            `Use \`/level dashboard\` to adjust any of these Einstellungen at any time.`,
                        color: 'Erfolg',
                    }),
                ],
            });
        }
    },
};


