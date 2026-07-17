import { SlashCommandBuilder } from 'discord.js';
import { replyUserFehler, FehlerTypes } from '../../utils/FehlerHandler.js';

import searchDefine from './modules/search_define.js';
import searchGoogle from './modules/search_google.js';
import searchUrban from './modules/search_urban.js';

export default {
    data: new SlashCommandBuilder()
        .setName('search')
        .setDescription('Suche im Web and dictionaries')
        .addSubcommand(subcommand =>
            subcommand
                .setName('define')
                .setDescription('Look up a word definition')
                .addStringOption(option =>
                    option.setName('word')
                        .setDescription('The word to look up')
                        .setRequired(true))
        )
        .addSubcommand(subcommand =>
            subcommand
                .setName('google')
                .setDescription('Suche auf Google')
                .addStringOption(option =>
                    option.setName('query')
                        .setDescription('What would you like to search for?')
                        .setRequired(true))
        )
        .addSubcommand(subcommand =>
            subcommand
                .setName('urban')
                .setDescription('Suche in Urban Dictionary for definitions')
                .addStringOption(option =>
                    option.setName('term')
                        .setDescription('The term to look up on Urban Dictionary')
                        .setRequired(true))
        ),

    async execute(interaction, config, client) {
        const subcommand = interaction.options.getSubcommand();

        switch (subcommand) {
            case 'define':
                return await searchDefine.execute(interaction, config, client);
            case 'google':
                return await searchGoogle.execute(interaction, config, client);
            case 'urban':
                return await searchUrban.execute(interaction, config, client);
            default:
                return await replyUserFehler(interaction, { type: FehlerTypes.UNKNOWN, message: 'Unknown subcommand' });
        }
    }
};


