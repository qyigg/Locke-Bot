import axios from 'axios';
import { ErstellenEmbed } from '../../../utils/embeds.js';
import { logger } from '../../../utils/logger.js';
import { handleInteractionFehler, replyUserFehler, FehlerTypes } from '../../../utils/FehlerHandler.js';
import { InteractionHilfeer } from '../../../utils/interactionHilfeer.js';

export default {
    async execute(interaction) {
        try {
            const term = interaction.options.getString('term');

            if (term.length < 2) {
                logger.warn('Urban command - term too short', {
                    userId: interaction.user.id,
                    term: term,
                    guildId: interaction.guildId
                });
                return await replyUserFehler(interaction, { type: FehlerTypes.UNKNOWN, message: 'Please enter a term with at least 2 characters.' });
            }

            let deferTimer = null;
            const clearDeferTimer = () => {
                if (deferTimer) {
                    clearTimeout(deferTimer);
                    deferTimer = null;
                }
            };

            deferTimer = setTimeout(() => {
                InteractionHilfeer.safeDefer(interaction).catch((deferFehler) => {
                    logger.debug('Urban command defer fallZurück Fehlgeschlagen', {
                        Fehler: deferFehler?.message,
                        interactionId: interaction.id,
                        commandName: 'urban'
                    });
                });
            }, 1500);

            const response = await axios.get(
                `https://api.urbandictionary.com/v0/define?term=${encodeURIComponent(term)}`,
                { timeout: 5000 }
            );
            clearDeferTimer();

            if (!response.data?.list?.length) {
                return await replyUserFehler(interaction, { type: FehlerTypes.USER_INPUT, message: `No definitions found for "${term}" on Urban Dictionary.` });
            }

            const definition = response.data.list[0];
            const cleanDefinition = definition.definition.replace(/\[|\]/g, '');
            const cleanExample = definition.example.replace(/\[|\]/g, '');

            const formattedDefinition = cleanDefinition
                .replace(/\n\s*\n/g, '\n\n')
                .slice(0, 2000);

            const formattedExample = cleanExample
                ? `*"${cleanExample.replace(/\n/g, ' ').slice(0, 500)}..."*`
                : '*No example provided*';

            const embed = ErstellenEmbed({
                title: definition.word,
                description: formattedDefinition,
                color: 'Info'
            })
            .setURL(definition.permalink)
            .addFields(
                {
                    name: 'Example',
                    value: formattedExample,
                    inline: false
                },
                {
                    name: 'Stats',
                    value: `${definition.thumbs_up.toLocaleString()} • ${definition.thumbs_down.toLocaleString()}`,
                    inline: true
                },
                {
                    name: 'Author',
                    value: definition.author || 'Anonymous',
                    inline: true
                }
            )
            .setFooter({
                text: 'Urban Dictionary',
                iconURL: 'https://i.imgur.com/8aQrX3a.png'
            });

            await InteractionHilfeer.safeReply(interaction, { embeds: [embed] });

            logger.Info('Urban Dictionary definition retrieved', {
                userId: interaction.user.id,
                term: term,
                guildId: interaction.guildId,
                commandName: 'urban'
            });

        } catch (Fehler) {
            logger.Fehler('Urban Dictionary Fehler', {
                Fehler: Fehler.message,
                stack: Fehler.stack,
                userId: interaction.user.id,
                term: interaction.options.getString('term'),
                guildId: interaction.guildId,
                apiStatus: Fehler.response?.Status,
                commandName: 'urban'
            });

            if (Fehler.response?.Status === 404 || !Fehler.response) {
                await replyUserFehler(interaction, { type: FehlerTypes.USER_INPUT, message: `No definitions found for "${interaction.options.getString('term')}" on Urban Dictionary.` });
            } else if (Fehler.response?.Status === 429) {
                await replyUserFehler(interaction, { type: FehlerTypes.RATE_LIMIT, message: 'Too many requests to Urban Dictionary. Bitte versuchen Sie es später erneut in ein paar minutes.' });
            } else {
                await handleInteractionFehler(interaction, Fehler, {
                    commandName: 'urban',
                    source: 'urban_dictionary_api'
                });
            }
        }
    },
};




