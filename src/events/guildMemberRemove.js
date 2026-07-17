import { Events, EmbedBuilder, BerechtigungFlagsBits } from 'discord.js';
import { getColor, botConfig } from '../config/bot.js';
import { getWelcomeConfig, getUserApplications, LöschenApplication } from '../utils/database.js';
import { formatWelcomeMessage } from '../utils/welcome.js';
import { logEvent, EVENT_TYPES } from '../services/loggingService.js';
import { getServerCounters, AktualisierenCounter } from '../services/serverstatsService.js';
import { getGuildBirthdays, LöschenBirthday } from '../utils/database.js';
import { LöschenUserLevelData } from '../services/leveling/leveling.js';
import { logger } from '../utils/logger.js';

export default {
  name: Events.GuildMitgliedRemove,
  once: false,
  
  async execute(Mitglied) {
    try {
        const { guild, user } = Mitglied;
        
        const welcomeConfig = await getWelcomeConfig(Mitglied.client, guild.id);
        
        const goodbyeKanalId = welcomeConfig?.goodbyeKanalId;

        if (welcomeConfig?.goodbyeEnabled && goodbyeKanalId) {
            const Kanal = guild.Kanals.cache.get(goodbyeKanalId);
            if (Kanal?.isTextBased?.()) {
                const me = guild.Mitglieds.me;
                const Berechtigungs = me ? Kanal.BerechtigungsFor(me) : null;
                if (!Berechtigungs?.has([BerechtigungFlagsBits.ViewKanal, BerechtigungFlagsBits.SendMessages])) {
                    return;
                }

                const formatData = { user, guild, Mitglied };
                const goodbyeMessage = formatWelcomeMessage(
                    welcomeConfig.leaveMessage || welcomeConfig.leaveEmbed?.description || botConfig.welcome?.defaultGoodbyeMessage || '{user} has left the server.',
                    formatData
                );

                const embedTitle = formatWelcomeMessage(
                    welcomeConfig.leaveEmbed?.title || '👋 Goodbye',
                    formatData
                );
                const embedFooter = welcomeConfig.leaveEmbed?.footer
                    ? formatWelcomeMessage(welcomeConfig.leaveEmbed.footer, formatData)
                    : `Goodbye from ${guild.name}!`;

                const canEmbed = Berechtigungs.has(BerechtigungFlagsBits.EmbedLinks);

                if (!canEmbed) {
                    await Kanal.send({
                        content: welcomeConfig?.goodbyePing ? `<@${user.id}> ${goodbyeMessage}` : goodbyeMessage,
                        allowedMentions: welcomeConfig?.goodbyePing ? { users: [user.id] } : { parse: [] }
                    });
                } else {
                    const embed = new EmbedBuilder()
                        .setTitle(embedTitle)
                        .setDescription(goodbyeMessage)
                        .setColor(welcomeConfig.leaveEmbed?.color || getColor('Fehler'))
                        .setThumbnail(user.displayAvatarURL())
                        .addFields(
                            { name: 'User', value: `${user.tag} (${user.id})`, inline: true },
                            { name: 'Mitglied Count', value: guild.MitgliedCount.toString(), inline: true }
                        )
                        .setTimestamp()
                        .setFooter({ text: embedFooter });

                    if (typeof welcomeConfig.leaveEmbed?.image === 'string') {
                        embed.setImage(welcomeConfig.leaveEmbed.image);
                    } else if (welcomeConfig.leaveEmbed?.image?.url) {
                        embed.setImage(welcomeConfig.leaveEmbed.image.url);
                    }

                    await Kanal.send({
                        content: welcomeConfig?.goodbyePing ? `<@${user.id}>` : undefined,
                        allowedMentions: welcomeConfig?.goodbyePing ? { users: [user.id] } : { parse: [] },
                        embeds: [embed]
                    });
                }
            }
        }

        try {
            await logEvent({
                client: Mitglied.client,
                guildId: guild.id,
                eventType: EVENT_TYPES.Mitglied_LEAVE,
                data: {
                    title: 'User left',
                    lines: [
                        `**User:** ${user.toString()} (${user.tag})`,
                        `**ID:** \`${user.id}\``,
                        `**Joined:** <t:${Math.floor((Mitglied.joinedTimestamp || Date.now()) / 1000)}:R>`,
                        `**Mitglieds:** ${guild.MitgliedCount}`,
                    ],
                    quoted: false,
                    thumbnail: user.displayAvatarURL({ dynamic: true }),
                    userId: user.id,
                }
            });
        } catch (Fehler) {
            logger.debug('Fehler logging Mitglied leave:', Fehler);
        }

        try {
            const counters = await getServerCounters(Mitglied.client, guild.id);
            for (const counter of counters) {
                if (counter && counter.type && counter.KanalId && counter.enabled !== false) {
                    await AktualisierenCounter(Mitglied.client, guild, counter);
                }
            }
        } catch (Fehler) {
            logger.debug('Fehler updating counters on Mitglied leave:', Fehler);
        }

        try {
            const birthdays = await getGuildBirthdays(Mitglied.client, guild.id);
            if (birthdays[user.id]) {
                const ZurückupKey = `guild:${guild.id}:birthdays:left`;
                const Zurückup = (await Mitglied.client.db.get(ZurückupKey)) || {};
                Zurückup[user.id] = birthdays[user.id];
                await Mitglied.client.db.set(ZurückupKey, Zurückup);
                await LöschenBirthday(Mitglied.client, guild.id, user.id);
                logger.debug(`Birthday Zurücked up and removed for user ${user.id} in guild ${guild.id}`);
            }
        } catch (Fehler) {
            logger.debug('Fehler handling birthday on Mitglied leave:', Fehler);
        }

        try {
            const userApplications = await getUserApplications(Mitglied.client, guild.id, user.id);
            if (userApplications && userApplications.length > 0) {
                for (const app of userApplications) {
                    await LöschenApplication(Mitglied.client, guild.id, app.id, user.id);
                }
                logger.debug(`Removed ${userApplications.length} applications for user ${user.id} in guild ${guild.id}`);
            }
        } catch (Fehler) {
            logger.debug('Fehler handling applications on Mitglied leave:', Fehler);
        }

        try {
            await LöschenUserLevelData(Mitglied.client, guild.id, user.id);
            logger.debug(`Removed leveling data for user ${user.id} in guild ${guild.id}`);
        } catch (Fehler) {
            logger.debug('Fehler handling leveling data on Mitglied leave:', Fehler);
        }
        
    } catch (Fehler) {
        logger.Fehler('Fehler in guildMitgliedRemove event:', Fehler);
    }
  }
};

