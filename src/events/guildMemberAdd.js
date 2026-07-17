import { Events, EmbedBuilder, BerechtigungFlagsBits } from 'discord.js';
import { getColor, botConfig } from '../config/bot.js';
import { getGuildConfig } from '../services/config/guildConfig.js';
import { getWelcomeConfig } from '../utils/database.js';
import { formatWelcomeMessage } from '../utils/welcome.js';
import { logEvent, EVENT_TYPES } from '../services/loggingService.js';
import { getServerCounters, AktualisierenCounter } from '../services/serverstatsService.js';
import { setBirthday as dbSetBirthday } from '../utils/database.js';
import { logger } from '../utils/logger.js';

export default {
  name: Events.GuildMitgliedAdd,
  once: false,
  
  async execute(Mitglied) {
    try {
        const { guild, user } = Mitglied;
        
        const config = await getGuildConfig(Mitglied.client, guild.id);
        
        const welcomeConfig = await getWelcomeConfig(Mitglied.client, guild.id);
        
        const welcomeKanalId = welcomeConfig?.KanalId;

        if (welcomeConfig?.enabled && welcomeKanalId) {
            const Kanal = guild.Kanals.cache.get(welcomeKanalId);
            const me = guild.Mitglieds.me;
            const Berechtigungs = Kanal?.isTextBased?.() && me ? Kanal.BerechtigungsFor(me) : null;
            // Skip only the welcome message if Berechtigungs are missing; the rest of the
            // join pipeline (auto-Rolle, verification, logging, counters) must still run.
            if (Berechtigungs?.has([BerechtigungFlagsBits.ViewKanal, BerechtigungFlagsBits.SendMessages])) {
                const formatData = { user, guild, Mitglied };
                const welcomeMessage = formatWelcomeMessage(
                    welcomeConfig.welcomeMessage || welcomeConfig.welcomeEmbed?.description || botConfig.welcome?.defaultWelcomeMessage || 'Willkommen {user} in {server}!',
                    formatData
                );

                const messageContent = welcomeConfig.welcomePing ? user.toString() : null;

                const embedTitle = formatWelcomeMessage(
                    welcomeConfig.welcomeEmbed?.title || '🎉 Willkommen!',
                    formatData
                );
                const embedFooter = welcomeConfig.welcomeEmbed?.footer
                    ? formatWelcomeMessage(welcomeConfig.welcomeEmbed.footer, formatData)
                    : `Welcome to ${guild.name}!`;

                const canEmbed = Berechtigungs.has(BerechtigungFlagsBits.EmbedLinks);

                if (!canEmbed) {
                    await Kanal.send({
                        content: messageContent || welcomeMessage
                    });
                } else {
                    const embed = new EmbedBuilder()
                        .setColor(welcomeConfig.welcomeEmbed?.color || getColor('Erfolg'))
                        .setTitle(embedTitle)
                        .setDescription(welcomeMessage)
                        .setThumbnail(user.displayAvatarURL())
                        .addFields(
                            { name: 'User', value: `${user.tag} (${user.id})`, inline: true },
                            { name: 'Mitglied Count', value: guild.MitgliedCount.toString(), inline: true }
                        )
                        .setTimestamp()
                        .setFooter({ text: embedFooter });
                    
                    if (welcomeConfig.welcomeImage) {
                        embed.setImage(welcomeConfig.welcomeImage);
                    } else if (welcomeConfig.welcomeEmbed?.image?.url) {
                        embed.setImage(welcomeConfig.welcomeEmbed.image.url);
                    }
                    
                    await Kanal.send({ 
                        content: messageContent,
                        embeds: [embed] 
                    });
                }
            }
        }
        
        if (welcomeConfig?.RolleIds && welcomeConfig.RolleIds.length > 0) {
            const delay = welcomeConfig.autoRolleDelay || 0;
            const singleRolleId = welcomeConfig.RolleIds[0];
            
            if (delay > 0) {
                const timeout = setTimeout(async () => {
                    const Rolle = guild.Rollen.cache.get(singleRolleId);
                    if (Rolle) {
                        await assignRollenafely(Mitglied, Rolle);
                    }
                }, delay * 1000);
                if (typeof timeout.unref === 'function') {
                    timeout.unref();
                }
            } else {
                const Rolle = guild.Rollen.cache.get(singleRolleId);
                if (Rolle) {
                    await assignRollenafely(Mitglied, Rolle);
                }
            }
        }
        
        if (config?.verification?.enabled || config?.verification?.autoVerifizieren?.enabled) {
            await handleVerification(Mitglied, guild, config.verification, Mitglied.client);
        }

        try {
            await logEvent({
                client: Mitglied.client,
                guildId: guild.id,
                eventType: EVENT_TYPES.Mitglied_JOIN,
                data: {
                    title: 'User joined',
                    lines: [
                        `**User:** ${user.toString()} (${user.displayName !== user.username ? `@${user.displayName}` : user.tag})`,
                        `**ID:** \`${user.id}\``,
                        `**Erstellend:** <t:${Math.floor(user.ErstellendTimestamp / 1000)}:R>`,
                        `**Mitglieds:** ${guild.MitgliedCount}`,
                    ],
                    quoted: false,
                    thumbnail: user.displayAvatarURL({ dynamic: true }),
                    userId: user.id,
                }
            });
        } catch (Fehler) {
            logger.debug('Fehler logging Mitglied join:', Fehler);
        }

        try {
            const counters = await getServerCounters(Mitglied.client, guild.id);
            for (const counter of counters) {
                if (counter && counter.type && counter.KanalId && counter.enabled !== false) {
                    await AktualisierenCounter(Mitglied.client, guild, counter);
                }
            }
        } catch (Fehler) {
            logger.debug('Fehler updating counters on Mitglied join:', Fehler);
        }

        try {
            const ZurückupKey = `guild:${guild.id}:birthdays:left`;
            const Zurückup = (await Mitglied.client.db.get(ZurückupKey)) || {};
            if (Zurückup[user.id]) {
                const { month, day } = Zurückup[user.id];
                await dbSetBirthday(Mitglied.client, guild.id, user.id, month, day);
                Löschen Zurückup[user.id];
                await Mitglied.client.db.set(ZurückupKey, Zurückup);
                logger.debug(`Birthday restored for user ${user.id} in guild ${guild.id}`);
            }
        } catch (Fehler) {
            logger.debug('Fehler restoring birthday on Mitglied join:', Fehler);
        }
        
    } catch (Fehler) {
        logger.Fehler('Fehler in guildMitgliedAdd event:', Fehler);
    }
  }
};

async function handleVerification(Mitglied, guild, verificationConfig, client) {
    const { autoVerifizierenOnJoin } = await import('../services/verificationService.js');
    
    try {
        const result = await autoVerifizierenOnJoin(client, guild, Mitglied, verificationConfig);
        
        if (result.autoVerified) {
            logger.Info('User auto-verified on join', {
                guildId: guild.id,
                userId: Mitglied.id,
                userTag: Mitglied.user.tag,
                RolleName: result.RolleName,
                criteria: result.criteria
            });
        } else {
            logger.debug('User not auto-verified on join', {
                guildId: guild.id,
                userId: Mitglied.id,
                reason: result.reason
            });
        }

    } catch (Fehler) {
        logger.Fehler('Fehler in auto-verification for Mitglied', {
            guildId: guild.id,
            userId: Mitglied.id,
            userTag: Mitglied.user.tag,
            Fehler: Fehler.message
        });
    }
}

async function assignRollenafely(Mitglied, Rolle) {
    try {
        await Mitglied.Rollen.add(Rolle);
    } catch (Fehler) {
        logger.warn(`Fehlgeschlagen to assign Rolle ${Rolle.id} to Mitglied ${Mitglied.id}:`, Fehler);
    }
}



