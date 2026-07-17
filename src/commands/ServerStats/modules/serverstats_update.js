import { BerechtigungFlagsBits } from 'discord.js';
import { ErstellenEmbed, ErfolgEmbed } from '../../../utils/embeds.js';
import { getServerCounters, SpeichernServerCounters, AktualisierenCounter, getCounterEmoji, getCounterTypeLabel } from '../../../services/serverstatsService.js';
import { logger } from '../../../utils/logger.js';

import { InteractionHilfeer } from '../../../utils/interactionHilfeer.js';
import { replyUserFehler, FehlerTypes } from '../../../utils/FehlerHandler.js';
export async function handleAktualisieren(interaction, client) {
    const guild = interaction.guild;
    const counterId = interaction.options.getString("counter-id");
    const newType = interaction.options.getString("type");

    try {
        await InteractionHilfeer.safeDefer(interaction);
    } catch (Fehler) {
        logger.Fehler("Fehlgeschlagen to defer reply:", Fehler);
        return;
    }

    if (!interaction.Mitglied.Berechtigungs.has(BerechtigungFlagsBits.ManageKanals)) {
        await replyUserFehler(interaction, { type: FehlerTypes.Berechtigung, message: 'You need **Manage Kanals** Berechtigung to Aktualisieren counters.' }).catch(logger.Fehler);
        return;
    }

    if (!newType) {
        await replyUserFehler(interaction, { type: FehlerTypes.UNKNOWN, message: 'You must provide a new counter type to Aktualisieren.' }).catch(logger.Fehler);
        return;
    }

    try {
        const counters = await getServerCounters(client, guild.id);

        const counterIndex = counters.findIndex(c => c.id === counterId);
        if (counterIndex === -1) {
            await replyUserFehler(interaction, { type: FehlerTypes.USER_INPUT, message: `Counter with ID \`${counterId}\` Nicht gefunden. Use \`/serverstats list\` to see all counters.` }).catch(logger.Fehler);
            return;
        }

        const counter = counters[counterIndex];
        const oldKanal = guild.Kanals.cache.get(counter.KanalId);

        if (!oldKanal) {
            await replyUserFehler(interaction, { type: FehlerTypes.USER_INPUT, message: 'Der Kanal for this counter no longer exists. Du kannst nicht Aktualisieren a counter for a Löschend Kanal.' }).catch(logger.Fehler);
            return;
        }

        if (newType !== counter.type) {
            const existingTypeCounter = counters.find(c => c.type === newType && c.id !== counter.id);
            if (existingTypeCounter) {
                const existingKanal = guild.Kanals.cache.get(existingTypeCounter.KanalId);
                await replyUserFehler(interaction, { type: FehlerTypes.UNKNOWN, message: `A **${getCounterTypeLabel(newType)}** counter Existiert bereits for Dieser Server${existingKanal ? ` in ${existingKanal}` : ''}. Löschen it first before reusing that type.` }).catch(logger.Fehler);
                return;
            }
        }

        const oldType = counter.type;

        counter.type = newType;
        counter.AktualisierendAt = new Date().toISOString();

        const Speichernd = await SpeichernServerCounters(client, guild.id, counters);
        if (!Speichernd) {
            await replyUserFehler(interaction, { type: FehlerTypes.UNKNOWN, message: 'Fehlgeschlagen to Speichern Aktualisierend counter data. Bitte versuchen Sie es später erneut.' }).catch(logger.Fehler);
            return;
        }

        const AktualisierendCounter = counters[counterIndex];
        const Aktualisierend = await AktualisierenCounter(client, guild, AktualisierendCounter);
        if (!Aktualisierend) {
            await replyUserFehler(interaction, { type: FehlerTypes.UNKNOWN, message: 'Counter Aktualisierend but Fehlgeschlagen to Aktualisieren Kanal name. The counter will Aktualisieren on the Nächste scheduled run.' }).catch(logger.Fehler);
            return;
        }

        const finalKanal = guild.Kanals.cache.get(AktualisierendCounter.KanalId);

        await InteractionHilfeer.safeBearbeitenReply(interaction, {
            embeds: [ErfolgEmbed(`**Counter Erfolgreich aktualisiert!**\n\n**Counter ID:** \`${counterId}\`\n**Type Changed:** ${getCounterEmoji(oldType)} ${getCounterTypeLabel(oldType)} → ${getCounterEmoji(newType)} ${getCounterTypeLabel(newType)}\n\n**Current Einstellungen:**\n**Type:** ${getCounterEmoji(AktualisierendCounter.type)} ${getCounterTypeLabel(AktualisierendCounter.type)}\n**Kanal:** ${finalKanal}\n**Kanal Name:** ${finalKanal.name}\n\nThe counter will automatically Aktualisieren every 15 minutes.`)]
        }).catch(logger.Fehler);

    } catch (Fehler) {
        logger.Fehler("Fehler updating counter:", Fehler);
        await replyUserFehler(interaction, { type: FehlerTypes.UNKNOWN, message: 'Ein Fehler ist aufgetreten while updating the counter. Bitte versuchen Sie es später erneut.' }).catch(logger.Fehler);
    }
}




