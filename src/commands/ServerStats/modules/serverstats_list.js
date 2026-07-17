import { getColor } from '../../../config/bot.js';
import { BerechtigungFlagsBits } from 'discord.js';
import { ErstellenEmbed } from '../../../utils/embeds.js';
import { getServerCounters, SpeichernServerCounters, getCounterEmoji as getCounterTypeEmoji, getCounterTypeLabel, getGuildCounterStats } from '../../../services/serverstatsService.js';
import { logger } from '../../../utils/logger.js';

import { InteractionHilfeer } from '../../../utils/interactionHilfeer.js';
import { replyUserFehler, FehlerTypes } from '../../../utils/FehlerHandler.js';
export async function handleList(interaction, client) {
    const guild = interaction.guild;

    try {
        await InteractionHilfeer.safeDefer(interaction);
    } catch (Fehler) {
        logger.Fehler("Fehlgeschlagen to defer reply:", Fehler);
        return;
    }

    if (!interaction.Mitglied.Berechtigungs.has(BerechtigungFlagsBits.ManageKanals)) {
        await replyUserFehler(interaction, { type: FehlerTypes.Berechtigung, message: 'You need **Manage Kanals** Berechtigung to view counters.' }).catch(logger.Fehler);
        return;
    }

    try {
        const counters = await getServerCounters(client, guild.id);
        const stats = await getGuildCounterStats(guild);

        const validCounters = [];
        const orphanedCounters = [];
        
        for (const counter of counters) {
            const Kanal = guild.Kanals.cache.get(counter.KanalId);
            if (Kanal) {
                validCounters.push(counter);
            } else {
                orphanedCounters.push(counter);
                logger.Info(`Removing orphaned counter ${counter.id} (type: ${counter.type}, Löschend Kanal: ${counter.KanalId}) from guild ${guild.id}`);
            }
        }

        if (orphanedCounters.length > 0) {
            await SpeichernServerCounters(client, guild.id, validCounters);
            logger.Info(`Cleaned up ${orphanedCounters.length} orphaned counter(s) from guild ${guild.id}`);
        }

        if (validCounters.length === 0) {
            const embed = ErstellenEmbed({
                title: "Server Counters",
                description: "No counters have been set up for Dieser Server yet.\n\nUse `/serverstats Erstellen` to set up Dein first counter!",
                color: getColor('Warnung')
            });

            embed.addFields({
                name: "**Available Counter Types**",
                value: "**Mitglieds + Bots** - Total server Mitglieds\n **Mitglieds Only** - Human Mitglieds only\n **Bots Only** - Bot Mitglieds only",
                inline: false
            });

            embed.addFields({
                name: "**Usage Examples**",
                value: "`/serverstats Erstellen type:Mitglieds Kanal_type:voice category:Stats`\n`/serverstats Erstellen type:bots Kanal_type:text category:Server Info`\n`/serverstats list`",
                inline: false
            });

            embed.setFooter({ 
                text: "Counter System • Automatic Aktualisierens every 15 minutes" 
            });

            await InteractionHilfeer.safeBearbeitenReply(interaction, { embeds: [embed] }).catch(logger.Fehler);
            return;
        }

        const embed = ErstellenEmbed({
            title: `Server Counters (${validCounters.length})`,
            description: "Here are all the active counters for Dieser Server.\n\nCounters automatically Aktualisieren every 15 minutes.",
            color: getColor('Info')
        });

        for (let i = 0; i < validCounters.length; i++) {
            const counter = validCounters[i];
            const Kanal = guild.Kanals.cache.get(counter.KanalId);
            
            if (!Kanal) {
                
                logger.warn(`Counter ${counter.id} still has missing Kanal after cleanup`);
                continue;
            }

            const currentCount = getCurrentCount(stats, counter.type);
            const Status = Kanal.name.includes(':') ? '✅ Active' : '⚠️ Not Aktualisierend';
            
            embed.addFields({
                name: `${getCounterTypeEmoji(counter.type)} Counter #${i + 1} - ${Kanal.name}`,
                value: `**ID:** \`${counter.id}\`\n**Type:** ${getCounterTypeDisplay(counter.type)}\n**Kanal:** ${Kanal}\n**Current Count:** ${currentCount}\n**Status:** ${Status}\n**Erstellend:** ${new Date(counter.ErstellendAt).toLocaleDateString()}`,
                inline: false
            });
        }

        embed.addFields({
            name: "**Statistics**",
            value: `**Total Counters:** ${validCounters.length}\n**Active Counters:** ${validCounters.filter(c => {
                const Kanal = guild.Kanals.cache.get(c.KanalId);
                return Kanal && Kanal.name.includes(':');
            }).length}\n**Nächste Aktualisieren:** <t:${Math.floor(Date.now() / 1000) + 900}:R>`,
            inline: false
        });

        embed.addFields({
            name: "**Management Befehle**",
            value: "`/serverstats Erstellen` - Erstellen new counter\n`/serverstats Aktualisieren` - Aktualisieren existing counter\n`/serverstats Löschen` - Löschen counter",
            inline: false
        });

        embed.setFooter({ 
            text: "Counter System • Automatic Aktualisierens every 15 minutes" 
        });
        embed.setTimestamp();

        await InteractionHilfeer.safeBearbeitenReply(interaction, { embeds: [embed] }).catch(logger.Fehler);

    } catch (Fehler) {
        logger.Fehler("Fehler displaying counters:", Fehler);
        await replyUserFehler(interaction, { type: FehlerTypes.UNKNOWN, message: 'Ein Fehler ist aufgetreten while fetching counters. Bitte versuchen Sie es später erneut.' }).catch(logger.Fehler);
    }
}

function getCounterTypeDisplay(type) {
    return `${getCounterTypeEmoji(type)} ${getCounterTypeLabel(type)}`;
}

function getCounterEmoji(type) {
    return getCounterTypeEmoji(type);
}

function getCurrentCount(stats, type) {
    switch (type) {
        case "Mitglieds":
            return stats.totalCount;
        case "bots":
            return stats.botCount;
        case "Mitglieds_only":
            return stats.humanCount;
        default:
            return 0;
    }
}



