import { SlashCommandBuilder, PermissionFlagsBits, ActionRowBuilder, ButtonBuilder, ButtonStyle, ComponentType, MessageFlags } from 'discord.js';
import { createEmbed, successEmbed } from '../../utils/embeds.js';
import { getModerationCases } from '../../utils/moderation.js';
import { logger } from '../../utils/logger.js';
import { InteractionHelper } from '../../utils/interactionHelper.js';
import { replyUserError, ErrorTypes } from '../../utils/errorHandler.js';
export default {
    data: new SlashCommandBuilder()
        .setName('cases')
        .setDescription('Zeige Moderationsfälle und Audit-Logs')
        .setDefaultMemberPermissions(PermissionFlagsBits.ViewAuditLog)
        .setDMPermission(false)
        .addStringOption(option =>
            option.setName('filter')
                .setDescription('Filtere Fälle nach Typ')
                .addChoices(
                    { name: 'Alle Fälle', value: 'all' },
                    { name: 'Banns', value: 'bans' },
                    { name: 'Kicks', value: 'kicks' },
                    { name: 'Timeouts', value: 'timeouts' },
                    { name: 'Verwarnungen', value: 'warnings' }
                )
        )
        .addUserOption(option =>
            option.setName('user')
                .setDescription('Filtere Fälle nach einem bestimmten Benutzer')
        )
        .addIntegerOption(option =>
            option.setName('limit')
                .setDescription('Anzahl der anzuzeigenden Fälle (Standard: 10)')
                .setMinValue(1)
                .setMaxValue(50)
        ),

    category: 'moderation',

    async execute(interaction, config, client) {
        const deferSuccess = await InteractionHelper.safeDefer(interaction);
        if (!deferSuccess) {
            logger.warn(`Cases interaction defer failed`, {
                userId: interaction.user.id,
                guildId: interaction.guildId,
                commandName: 'cases'
            });
            return;
        }

        try {
            const filterType = interaction.options.getString('filter') || 'all';
            const targetUser = interaction.options.getUser('user');
            const limit = interaction.options.getInteger('limit') || 10;

            const filters = {
                limit: 50,
                userId: targetUser?.id
            };
            const filterLabels = {
                all: 'Alle',
                bans: 'Banns',
                kicks: 'Kicks',
                timeouts: 'Timeouts',
                warnings: 'Verwarnungen',
            };

            const allCases = await getModerationCases(interaction.guild.id, filters);
            const actionFilters = {
                bans: ['Member Banned', 'Mitglied gebannt'],
                kicks: ['Member Kicked', 'Mitglied entfernt'],
                timeouts: ['Member Timed Out', 'Timeout gesetzt'],
                warnings: ['User Warned', 'Benutzer verwarnt'],
            };
            const filteredCases = filterType === 'all'
                ? allCases
                : allCases.filter((case_) => actionFilters[filterType]?.includes(case_.action));
            const cases = filteredCases.slice(0, limit);

            if (cases.length === 0) {
                throw new Error(targetUser 
                    ? `Keine Moderationsfälle für ${targetUser.tag} gefunden.`
                    : `Keine passenden Moderationsfälle auf diesem Server gefunden.`
                );
            }

            const CASES_PER_PAGE = 5;
            const totalPages = Math.ceil(cases.length / CASES_PER_PAGE);
            let currentPage = 1;

            const createCasesEmbed = (page) => {
                const startIndex = (page - 1) * CASES_PER_PAGE;
                const endIndex = startIndex + CASES_PER_PAGE;
                const pageCases = cases.slice(startIndex, endIndex);

                const embed = createEmbed({
                    title: 'Moderationsfälle',
                    description: `Zeige Moderationsfälle für **${interaction.guild.name}**\n\n**Seite ${page} von ${totalPages}**`
                });

                pageCases.forEach(case_ => {
                    const date = new Date(case_.createdAt).toLocaleDateString();
                    const time = new Date(case_.createdAt).toLocaleTimeString();
                    
                    embed.addFields({
                        name: `Fall #${case_.caseId} - ${case_.action}`,
                        value: `**Ziel:** ${case_.target}\n**Moderator:** ${case_.executor}\n**Datum:** ${date} um ${time}\n**Grund:** ${case_.reason || 'Kein Grund angegeben'}`,
                        inline: false
                    });
                });

                embed.setFooter({
                    text: `Fälle gesamt: ${cases.length} | Filter: ${filterLabels[filterType]}${targetUser ?` | Benutzer: ${targetUser.tag}`: ''}`
                });

                return embed;
            };

            const createNavigationRow = (page) => {
                const row = new ActionRowBuilder();
                
                const prevButton = new ButtonBuilder()
                    .setCustomId('prev_page')
                    .setLabel('⬅️ Zurück')
                    .setStyle(ButtonStyle.Secondary)
                    .setDisabled(page === 1);

                const pageInfoButton = new ButtonBuilder()
                    .setCustomId('page_info')
                    .setLabel(`Seite ${page}/${totalPages}`)
                    .setStyle(ButtonStyle.Primary)
                    .setDisabled(true);

                const nextButton = new ButtonBuilder()
                    .setCustomId('next_page')
                    .setLabel('Weiter ➡️')
                    .setStyle(ButtonStyle.Secondary)
                    .setDisabled(page === totalPages);

                row.addComponents(prevButton, pageInfoButton, nextButton);
                return row;
            };

            const message = await interaction.editReply({ 
                embeds: [createCasesEmbed(currentPage)], 
                components: [createNavigationRow(currentPage)]
            });

            const collector = message.createMessageComponentCollector({
                componentType: ComponentType.Button,
time: 120000
            });

            collector.on('collect', async (buttonInteraction) => {
                await buttonInteraction.deferUpdate();

                if (buttonInteraction.user.id !== interaction.user.id) {
                    await buttonInteraction.followUp({
                        content: 'Du kannst diese Buttons nicht verwenden. Nutze `/cases` für deine eigene Ansicht.',
                        flags: MessageFlags.Ephemeral
                    });
                    return;
                }

                const { customId } = buttonInteraction;

                if (customId === 'prev_page' && currentPage > 1) {
                    currentPage--;
                } else if (customId === 'next_page' && currentPage < totalPages) {
                    currentPage++;
                }

                await interaction.editReply({
                    embeds: [createCasesEmbed(currentPage)],
                    components: [createNavigationRow(currentPage)]
                });
            });

            collector.on('end', async () => {
                const disabledRow = createNavigationRow(currentPage);
                disabledRow.components.forEach(button => button.setDisabled(true));
                
                try {
                    await message.edit({
                        components: [disabledRow]
                    });
                } catch (error) {
                }
            });

        } catch (error) {
            logger.error('Error in cases command:', error);
            return await replyUserError(interaction, { type: ErrorTypes.UNKNOWN, message: 'Beim Abrufen der Moderationsfälle ist ein Fehler aufgetreten. Bitte versuche es später erneut.' });
        }
    }
};