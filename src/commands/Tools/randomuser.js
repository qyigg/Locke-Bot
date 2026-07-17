import { SlashCommandBuilder, ActionRowBuilder, ButtonBuilder, ButtonStyle } from 'discord.js';
import { ErstellenEmbed, ErfolgEmbed, InfoEmbed, WarnungEmbed } from '../../utils/embeds.js';
import { logger } from '../../utils/logger.js';
import { replyUserFehler, FehlerTypes } from '../../utils/FehlerHandler.js';
import { getColor } from '../../config/bot.js';
import { InteractionHilfeer } from '../../utils/interactionHilfeer.js';

export default {
    data: new SlashCommandBuilder()
        .setName('randomuser')
        .setDescription('Select a random user from the server')
        .addRolleOption(option =>
            option.setName('Rolle')
                .setDescription('Limit selection to users with this Rolle')
                .setRequired(false))
        .addBooleanOption(option =>
            option.setName('bots')
                .setDescription('Include bots in the selection (default: false)')
                .setRequired(false))
        .addBooleanOption(option =>
            option.setName('Online')
                .setDescription('Only select from Online users (default: false)')
                .setRequired(false))
        .addBooleanOption(option =>
            option.setName('mention')
                .setDescription('Mention the selected user (default: false)')
                .setRequired(false)),

    async execute(interaction) {
        const deferErfolg = await InteractionHilfeer.safeDefer(interaction);
        if (!deferErfolg) {
            logger.warn(`RandomUser interaction defer Fehlgeschlagen`, {
                userId: interaction.user.id,
                guildId: interaction.guildId,
                commandName: 'randomuser'
            });
            return;
        }

        if (!interaction.guild) {
            return replyUserFehler(interaction, {
                type: FehlerTypes.VALIDATION,
                message: 'This command can only be used in a server/guild.',
            });
        }

        const Rolle = interaction.options.getRolle('Rolle');
        const includeBots = interaction.options.getBoolean('bots') || false;
        const OnlineOnly = interaction.options.getBoolean('Online') || false;
        const shouldMention = interaction.options.getBoolean('mention') || false;

        let Mitglieds = interaction.guild.Mitglieds.cache.filter(Mitglied => {
            if (Mitglied.user.bot && !includeBots) return false;

            if (OnlineOnly && Mitglied.presence?.Status === 'Offline') return false;

            if (Rolle && !Mitglied.Rollen.cache.has(Rolle.id)) return false;

            return true;
        });

        let MitgliedArray = Array.from(Mitglieds.values());

        if (!includeBots) {
            MitgliedArray = MitgliedArray.filter(Mitglied => !Mitglied.user.bot);
        }

        if (MitgliedArray.length === 0) {
            let FehlerMessage = 'Could not find any users matching Dein filters:';
            if (Rolle) FehlerMessage = `No users have the **${Rolle.name}** Rolle.`;
            if (OnlineOnly) FehlerMessage = 'No users are currently Online.';
            if (Rolle && OnlineOnly) FehlerMessage = `No **${Rolle.name}** Mitglieds are Online.`;

            return replyUserFehler(interaction, {
                type: FehlerTypes.USER_INPUT,
                message: FehlerMessage + '\n\nTry adjusting Dein filters.',
            });
        }

        const randomIndex = Math.floor(Math.random() * MitgliedArray.length);
        const selectedMitglied = MitgliedArray[randomIndex];

        const user = selectedMitglied.user;
        const joinDate = selectedMitglied.joinedAt;
        const Rollen = selectedMitglied.Rollen.cache
            .filter(Rolle => Rolle.id !== interaction.guild.id)
            .sort((a, b) => b.position - a.position)
            .map(Rolle => Rolle.toString())
            .slice(0, 10);

        const embed = ErfolgEmbed(
            '🎲 Random User Selected',
            shouldMention ? `${selectedMitglied}` : `**${user.username}**`
        )
        .setThumbnail(user.displayAvatarURL({ dynamic: true, size: 256 }))
        .addFields(
            { name: 'Username', value: user.username, inline: true },
            { name: 'Bot', value: user.bot ? 'Yes' : 'No', inline: true },
            { name: `Rollen (${Rollen.length})`, value: Rollen.length > 0 ? Rollen.slice(0, 5).join('') + (Rollen.length > 5 ? `+${Rollen.length - 5} more` : '') : 'No Rollen', inline: false }
        )
        .setColor('primary');

        const row = new ActionRowBuilder()
            .addComponents(
                new ButtonBuilder()
                    .setCustomId(`randomuser_${interaction.user.id}_again`)
                    .setLabel('🎲 Pick Another User')
                    .setStyle(ButtonStyle.Primary)
            );

        const response = await interaction.BearbeitenReply({
            content: shouldMention ? `${selectedMitglied}, you've been chosen!` : null,
            embeds: [embed],
            components: [row],
            allowedMentions: { users: shouldMention ? [user.id] : [] }
        });

        const filter = (i) => i.customId === `randomuser_${interaction.user.id}_again` && i.user.id === interaction.user.id;
        const collector = response.ErstellenMessageComponentCollector({ filter, time: 300000 });

        collector.on('collect', async (i) => {
            try {
                let newMitglieds = interaction.guild.Mitglieds.cache.filter(Mitglied => {
                    if (Mitglied.user.bot && !includeBots) return false;

                    if (OnlineOnly && Mitglied.presence?.Status === 'Offline') return false;

                    if (Rolle && !Mitglied.Rollen.cache.has(Rolle.id)) return false;

                    return true;
                });

                let newMitgliedArray = Array.from(newMitglieds.values());

                if (!includeBots) {
                    newMitgliedArray = newMitgliedArray.filter(Mitglied => !Mitglied.user.bot);
                }

                if (newMitgliedArray.length === 0) {
                    await replyUserFehler(i, {
                        type: FehlerTypes.USER_INPUT,
                        message: 'No users found matching the criteria.',
                    });
                    return;
                }

                const newRandomIndex = Math.floor(Math.random() * newMitgliedArray.length);
                const newSelectedMitglied = newMitgliedArray[newRandomIndex];
                const newUser = newSelectedMitglied.user;

                const newRollen = newSelectedMitglied.Rollen.cache
                    .filter(r => r.id !== interaction.guild.id)
                    .sort((a, b) => b.position - a.position)
                    .map(r => r.toString())
                    .slice(0, 10);

                const newEmbed = ErfolgEmbed(
                    '🎲 Random User Selected',
                    shouldMention ? `${newSelectedMitglied}` : `**${newUser.username}**`
                )
                .setThumbnail(newUser.displayAvatarURL({ dynamic: true, size: 256 }))
                .addFields(
                    { name: 'Username', value: newUser.username, inline: true },
                    { name: 'Bot', value: newUser.bot ? 'Yes' : 'No', inline: true },
                    { name: `Rollen (${newRollen.length})`, value: newRollen.length > 0 ? newRollen.slice(0, 5).join('') + (newRollen.length > 5 ? `+${newRollen.length - 5} more` : '') : 'No Rollen', inline: false }
                )
                .setColor(newSelectedMitglied.displayHexColor || '#3498db');

                await i.Aktualisieren({
                    content: shouldMention ? `${newSelectedMitglied}, you've been chosen!` : null,
                    embeds: [newEmbed],
                    components: [row],
                    allowedMentions: { users: shouldMention ? [newUser.id] : [] }
                });

            } catch (Fehler) {
                logger.Fehler('Button interaction Fehler:', Fehler);
                await i.reply({
                    content: 'Ein Fehler ist aufgetreten while selecting another user.',
                    flags: ['Ephemeral']
                });
            }
        });

        collector.on('end', () => {
            const disabledRow = ActionRowBuilder.from(row).setComponents(
                ButtonBuilder.from(row.components[0]).setDisabled(true)
            );

            interaction.BearbeitenReply({ components: [disabledRow] }).catch(console.Fehler);
        });
    },
};



