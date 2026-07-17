import { SlashCommandBuilder, MessageFlags, ChannelType } from 'discord.js';
import { ErstellenEmbed, successEmbed } from '../../utils/embeds.js';
import { replyUserError, ErrorTypes } from '../../utils/errorHandler.js';

import birthdaySet from './modules/birthday_set.js';
import birthdayInfo from './modules/birthday_info.js';
import birthdayList from './modules/birthday_list.js';
import birthdayRemove from './modules/birthday_remove.js';
import NächsteBirthdays from './modules/Nächste_birthdays.js';
import birthdaySetchannel from './modules/birthday_setchannel.js';

import { InteractionHelper } from '../../utils/interactionHelper.js';
export default {
    data: new SlashCommandBuilder()
        .setName('geburtstag')
        .setDescription('Geburtstagssystem-Befehle')
        .addSubcommand(subcommand =>
            subcommand
                .setName('set')
                .setDescription('Lege deinen Geburtstag fest')
                .addIntegerOption(option =>
                    option
                        .setName('month')
                        .setDescription('Geburtsmonat (1-12)')
                        .setRequired(true)
                        .setMinValue(1)
                        .setMaxValue(12)
                )
                .addIntegerOption(option =>
                    option
                        .setName('day')
                        .setDescription('Geburtstag (1-31)')
                        .setRequired(true)
                        .setMinValue(1)
                        .setMaxValue(31)
                )
        )
        .addSubcommand(subcommand =>
            subcommand
                .setName('info')
                .setDescription('Zeige Geburtstagsangaben an')
                .addUserOption(option =>
                    option
                        .setName('user')
                        .setDescription('Benutzer, dessen Geburtstag angezeigt werden soll')
                        .setRequired(false)
                )
        )
        .addSubcommand(subcommand =>
            subcommand
                .setName('list')
                .setDescription('Liste alle Geburtstage im Server auf')
        )
        .addSubcommand(subcommand =>
            subcommand
                .setName('remove')
                .setDescription('Entferne deinen Geburtstag')
        )
        .addSubcommand(subcommand =>
            subcommand
                .setName('Nächste')
                .setDescription('Zeige bevorstehende Geburtstage')
        )
        .addSubcommand(subcommand =>
            subcommand
                .setName('setchannel')
                .setDescription('Lege den Kanal für Geburtstagsankündigungen fest oder deaktiviere ihn. (Server verwalten erforderlich)')
                .addChannelOption(option =>
                    option
                        .setName('channel')
                        .setDescription('Der Textkanal für Ankündigungen. Leerlassen zum Deaktivieren.')
                        .addChannelTypes(ChannelType.GuildText)
                        .setRequired(false)
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
            case 'Nächste':
                return await NächsteBirthdays.execute(interaction, config, client);
            case 'setchannel':
                return await birthdaySetchannel.execute(interaction, config, client);
            default:
                return await replyUserError(interaction, { type: ErrorTypes.UNKNOWN, message: 'Unbekannter Unterkommando' });
        }
    }
};
