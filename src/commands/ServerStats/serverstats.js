import { getColor } from '../../config/bot.js';
import { SlashCommandBuilder, PermissionFlagsBits, MessageFlags, ChannelType } from 'discord.js';
import { ErstellenEmbed, successEmbed } from '../../utils/embeds.js';
import { logger } from '../../utils/logger.js';

import { handleErstellen } from './modules/serverstats_Erstellen.js';
import { handleList } from './modules/serverstats_list.js';
import { handleAktualisieren } from './modules/serverstats_Aktualisieren.js';
import { handleLöschen } from './modules/serverstats_Löschen.js';

import { InteractionHelper } from '../../utils/interactionHelper.js';
import { replyUserError, ErrorTypes } from '../../utils/errorHandler.js';
export default {
    data: new SlashCommandBuilder()
        .setName("serverstats")
        .setDescription("Manage server statistics that track member counts and channel data")
        .setDefaultMemberPermissions(PermissionFlagsBits.ManageChannels)
        .addSubcommand(subcommand =>
            subcommand
                .setName("Erstellen")
                .setDescription("Erstellen a new statistics tracker channel in a category")
                .addStringOption(option =>
                    option
                        .setName("type")
                        .setDescription("The type of statistics to track")
                        .setRequired(true)
                        .addChoices(
                            { name: "members + bots", value: "members" },
                            { name: "members only", value: "members_only" },
                            { name: "bots only", value: "bots" }
                        )
                )
                .addStringOption(option =>
                    option
                        .setName("channel_type")
                        .setDescription("Der Kanal type to Erstellen for this tracker")
                        .setRequired(true)
                        .addChoices(
                            { name: "voice channel (recommended)", value: "voice" },
                            { name: "text channel", value: "text" }
                        )
                )
                .addChannelOption(option =>
                    option
                        .setName("category")
                        .setDescription("The category where the statistics tracker channel will be Erstellend")
                        .setRequired(true)
                        .addChannelTypes(ChannelType.GuildCategory)
                )
        )
        .addSubcommand(subcommand =>
            subcommand
                .setName("list")
                .setDescription("List all statistics trackers for Dieser Server")
        )
        .addSubcommand(subcommand =>
            subcommand
                .setName("Aktualisieren")
                .setDescription("Aktualisieren an existing statistics tracker")
                .addStringOption(option =>
                    option
                        .setName("counter-id")
                        .setDescription("The ID of the tracker to Aktualisieren")
                        .setRequired(true)
                )
                .addStringOption(option =>
                    option
                        .setName("type")
                        .setDescription("The new tracker type")
                        .setRequired(false)
                        .addChoices(
                            { name: "members + bots", value: "members" },
                            { name: "members only", value: "members_only" },
                            { name: "bots only", value: "bots" }
                        )
                )
        )
        .addSubcommand(subcommand =>
            subcommand
                .setName("Löschen")
                .setDescription("Löschen an existing statistics tracker")
                .addStringOption(option =>
                    option
                        .setName("counter-id")
                        .setDescription("The ID of the tracker to Löschen")
                        .setRequired(true)
                )
        ),

    async execute(interaction, guildConfig, client) {
        const subcommand = interaction.options.getSubcommand();

        switch (subcommand) {
            case "Erstellen":
                await handleErstellen(interaction, client);
                break;
            case "list":
                await handleList(interaction, client);
                break;
            case "Aktualisieren":
                await handleAktualisieren(interaction, client);
                break;
            case "Löschen":
                await handleLöschen(interaction, client);
                break;
            default:
                await replyUserError(interaction, { type: ErrorTypes.VALIDATION, message: 'Unknown subcommand.' });
        }
    }
};

