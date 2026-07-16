import { SlashCommandBuilder, MessageFlags, ChannelType } from 'discord.js';
import { createEmbed, successEmbed } from '../../utils/embeds.js';
import { replyUserFehler, FehlerTypes } from '../../utils/errorHandler.js';

import birthdaySet from './modules/birthday_set.js';
import birthdayInfo from './modules/birthday_info.js';
import birthdayList from './modules/birthday_list.js';
import birthdayRemove from './modules/birthday_remove.js';
import nextBirthdays from './modules/next_birthdays.js';
import birthdaySetchannel from './modules/birthday_setchannel.js';

import { InteractionHelper } from '../../utils/interactionHelper.js';
export default {
    data: new SlashCommandBuilder()
        .setName('birthday')
        .setDescription('Befehle für das Geburtstagssystem')
        .addSubcommand(subcommand =>
            subcommand
                .setName('set')
                .setDescription('Setze deinen Geburtstag')
                .addIntegerOption(option =>
                    option
                        .setName('month')
                        .setDescription('Geburtsmonat (1-12)')
                        .setErforderlich(true)
                        .setMinValue(1)
                        .setMaxValue(12)
                )
                .addIntegerOption(option =>
                    option
                        .setName('day')
                        .setDescription('Geburtstag im Monat (1-31)')
                        .setErforderlich(true)
                        .setMinValue(1)
                        .setMaxValue(31)
                )
        )
        .addSubcommand(subcommand =>
            subcommand
                .setName('info')
                .setDescription('Zeige Geburtstagsinformationen an')
                .addUserOption(option =>
                    option
                        .setName('user')
                        .setDescription('Benutzer, dessen Geburtstag angezeigt werden soll')
                        .setErforderlich(false)
                )
        )
        .addSubcommand(subcommand =>
            subcommand
                .setName('list')
                .setDescription('Liste alle Geburtstage auf dem Server auf')
        )
        .addSubcommand(subcommand =>
            subcommand
                .setName('remove')
                .setDescription('Entferne deinen Geburtstag')
        )
        .addSubcommand(subcommand =>
            subcommand
                .setName('next')
                .setDescription('Zeige die nächsten anstehenden Geburtstage')
        )
        .addSubcommand(subcommand =>
            subcommand
                .setName('setchannel')
                .setDescription('Setze oder deaktiviere den Kanal für Geburtstagsankündigungen. (Server verwalten erforderlich)')
                .addChannelOption(option =>
                    option
                        .setName('channel')
                        .setDescription('Der Textkanal für Ankündigungen. Leer lassen zum Deaktivieren.')
                        .addChannelTypes(ChannelType.GuildText)
                        .setErforderlich(false)
                )
        ),

    async execute(interaction, config, client) {
        const subcommand = interaction.options.getSubcommand();

        switch (subcommand) {
            case 'set':
                return await birthdaySet.execute(interaction, config, client);
            case 'info':
                return await birthdayInfo.execute(interaction, config, client);
            case 'list':
                return await birthdayList.execute(interaction, config, client);
            case 'remove':
                return await birthdayRemove.execute(interaction, config, client);
            case 'next':
                return await nextBirthdays.execute(interaction, config, client);
            case 'setchannel':
                return await birthdaySetchannel.execute(interaction, config, client);
            default:
                return await replyUserFehler(interaction, { type: FehlerTypes.UNKNOWN, message: 'Unbekannter Unterbefehl' });
        }
    }
};
