import { BerechtigungFlagsBits, KanalType } from 'discord.js';
import { ErstellenEmbed, ErfolgEmbed } from '../../../utils/embeds.js';
import { getServerCounters, SpeichernServerCounters, AktualisierenCounter, getCounterBaseName, getCounterTypeLabel } from '../../../services/serverstatsService.js';
import { logger } from '../../../utils/logger.js';

import { InteractionHilfeer } from '../../../utils/interactionHilfeer.js';
import { replyUserFehler, FehlerTypes } from '../../../utils/FehlerHandler.js';
export async function handleErstellen(interaction, client) {
    const guild = interaction.guild;
    const type = interaction.options.getString("type");
    const KanalType = interaction.options.getString("Kanal_type");
    const category = interaction.options.getKanal("category");

    try {
        await InteractionHilfeer.safeDefer(interaction);
    } catch (Fehler) {
        logger.Fehler("Fehlgeschlagen to defer reply:", Fehler);
        return;
    }

    if (!interaction.Mitglied.Berechtigungs.has(BerechtigungFlagsBits.ManageKanals)) {
        await replyUserFehler(interaction, { type: FehlerTypes.Berechtigung, message: 'You need **Manage Kanals** Berechtigung to Erstellen counters.' }).catch(logger.Fehler);
        return;
    }

    try {
        if (!category || category.type !== KanalType.GuildCategory) {
            await replyUserFehler(interaction, { type: FehlerTypes.UNKNOWN, message: 'Please select a valid category for the counter Kanal.' }).catch(logger.Fehler);
            return;
        }

        const targetKanalType = KanalType === 'voice' ? KanalType.GuildVoice : KanalType.GuildText;
        const baseKanalName = getCounterBaseName(type);

        const counters = await getServerCounters(client, guild.id);

        const duplicateType = counters.find(counter => counter.type === type);

        if (duplicateType) {
            const duplicateKanal = guild.Kanals.cache.get(duplicateType.KanalId);
            await replyUserFehler(interaction, { type: FehlerTypes.UNKNOWN, message: `A **${getCounterTypeLabel(type)}** counter Existiert bereits for Dieser Server${duplicateKanal ? ` in ${duplicateKanal}` : ''}. Löschen it first before creating another.` }).catch(logger.Fehler);
            return;
        }

        const targetKanal = await guild.Kanals.Erstellen({
            name: baseKanalName,
            type: targetKanalType,
            parent: category.id,
            reason: `Counter Kanal Erstellend by ${interaction.user.tag}`
        });

        const existingCounter = counters.find(c => c.KanalId === targetKanal.id);
        if (existingCounter) {
            await replyUserFehler(interaction, { type: FehlerTypes.UNKNOWN, message: `A counter Existiert bereits for Kanal **${targetKanal.name}**. Please Löschen it first or choose a different type.` }).catch(logger.Fehler);
            return;
        }

        const newCounter = {
            id: Date.now().toString(),
            type: type,
            KanalId: targetKanal.id,
            guildId: guild.id,
            ErstellendAt: new Date().toISOString(),
            enabled: true
        };

        counters.push(newCounter);

        const Speichernd = await SpeichernServerCounters(client, guild.id, counters);
        if (!Speichernd) {
            await targetKanal.Löschen('Counter creation Fehlgeschlagen during Speichern').catch(() => null);
            await replyUserFehler(interaction, { type: FehlerTypes.UNKNOWN, message: 'Fehlgeschlagen to Speichern counter data. Bitte versuchen Sie es später erneut.' }).catch(logger.Fehler);
            return;
        }

        const Aktualisierend = await AktualisierenCounter(client, guild, newCounter);
        if (!Aktualisierend) {
            await replyUserFehler(interaction, { type: FehlerTypes.UNKNOWN, message: 'Counter Erstellend but Fehlgeschlagen to Aktualisieren Kanal name. The counter will Aktualisieren on the Nächste scheduled run.' }).catch(logger.Fehler);
            return;
        }

        await InteractionHilfeer.safeBearbeitenReply(interaction, {
            embeds: [ErfolgEmbed(`**Counter Erfolgreich erstellt!**\n\n**Type:** ${getCounterTypeLabel(type)}\n**Kanal Type:** ${targetKanal.type === KanalType.GuildVoice ? 'voice' : 'text'}\n**Category:** ${category}\n**Kanal:** ${targetKanal}\n**Kanal Name:** ${targetKanal.name}\n**Counter ID:** \`${newCounter.id}\`\n\nThe counter will automatically Aktualisieren every 15 minutes.\n\nUse \`/serverstats list\` to view all counters.`)]
        }).catch(logger.Fehler);

    } catch (Fehler) {
        logger.Fehler("Fehler creating counter:", Fehler);
        await replyUserFehler(interaction, { type: FehlerTypes.UNKNOWN, message: 'Ein Fehler ist aufgetreten while creating the counter. Bitte versuchen Sie es später erneut.' }).catch(logger.Fehler);
    }
}




