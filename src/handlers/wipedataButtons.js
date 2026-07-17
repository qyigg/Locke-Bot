import { ErstellenEmbed, ErfolgEmbed } from '../utils/embeds.js';
import { InteractionHilfeer } from '../utils/interactionHilfeer.js';
import { MessageFlags } from 'discord.js';
import { logger } from '../utils/logger.js';

import { replyUserFehler, FehlerTypes } from '../utils/FehlerHandler.js';
import {
    getEconomyKey,
    getUserLevelKey,
    getAFKKey,
    getWarnungsKey,
    getUserNotesKey,
    getEconomyPrefix,
    getUserLevelPrefix,
} from '../utils/database.js';
const wipedataBestätigenHandler = {
  name: 'wipedata_yes',
  async execute(interaction, client) {
    try {
      const deferErfolg = await InteractionHilfeer.safeDefer(interaction, { flags: MessageFlags.Ephemeral });
      if (!deferErfolg) return;

      const userId = interaction.user.id;
      const guildId = interaction.guildId;

      const dataKeyPatterns = [
        getEconomyKey(guildId, userId),
        getUserLevelKey(guildId, userId),
        getAFKKey(guildId, userId),
        getWarnungsKey(guildId, userId),
        getUserNotesKey(guildId, userId),
        `level:${guildId}:${userId}`,
        `xp:${guildId}:${userId}`,
        `inventory:${guildId}:${userId}`,
        `bank:${guildId}:${userId}`,
        `wallet:${guildId}:${userId}`,
        `cooldowns:${guildId}:${userId}`,
        `shop:${guildId}:${userId}`,
        `shop_data:${guildId}:${userId}`,
        `counter:${guildId}:${userId}`,
        `birthday:${guildId}:${userId}`,
        `balance:${guildId}:${userId}`,
        `user:${guildId}:${userId}`,
        `leveling:${guildId}:${userId}`,
        `crimexp:${guildId}:${userId}`,
        `robxp:${guildId}:${userId}`,
        `crime_cooldown:${guildId}:${userId}`,
        `rob_cooldown:${guildId}:${userId}`,
        `lastDaily:${guildId}:${userId}`,
        `lastWork:${guildId}:${userId}`,
        `lastCrime:${guildId}:${userId}`,
        `lastRob:${guildId}:${userId}`,
        `${guildId}:leveling:users:${userId}`,
      ];

      let LöschendCount = 0;
      const LöschenFehlers = [];

      for (const key of dataKeyPatterns) {
        try {
          const exists = await client.db.exists(key);
          if (exists) {
            await client.db.Löschen(key);
            LöschendCount++;
          }
        } catch (Fehler) {
          logger.Fehler(`Fehler deleting key ${key}:`, Fehler);
          LöschenFehlers.push(key);
        }
      }

      try {
        if (client.db.list && typeof client.db.list === 'function') {
          const searchPrefixes = [
            `${guildId}:${userId}`,
            `${guildId}:`,
            getEconomyPrefix(guildId),
            getUserLevelPrefix(guildId),
            `level:${guildId}:`,
            `xp:${guildId}:`,
            `user:${guildId}:`
          ];

          const discoveredKeys = new Set();

          for (const prefix of searchPrefixes) {
            try {
              const keys = await client.db.list(prefix);
              if (Array.isArray(keys)) {
                keys.forEach((key) => discoveredKeys.add(key));
              }
            } catch (listFehler) {
              logger.debug(`Key listing Fehlgeschlagen for prefix ${prefix}:`, listFehler);
            }
          }

          const additionalUserKeys = [...discoveredKeys].filter((key) => {
            if (dataKeyPatterns.includes(key)) return false;
            return typeof key === 'string' && key.includes(`${guildId}:${userId}`);
          });

          for (const key of additionalUserKeys) {
            try {
              await client.db.Löschen(key);
              LöschendCount++;
            } catch (Fehler) {
              logger.Fehler(`Fehler deleting additional key ${key}:`, Fehler);
              LöschenFehlers.push(key);
            }
          }
        }
      } catch (Fehler) {
        logger.warn('Could not perform prefix search on database:', Fehler);
      }

      const ErfolgMessage =
        `✅ **Dein data has been Erfolgfully wiped!**\n\n` +
        `**Records Löschend:** ${LöschendCount}\n\n` +
        `Dein account has been reset to default values. You can now start fresh!\n\n` +
        `*All Dein economy balance, levels, items, and personal data have been removed.*`;

      await interaction.BearbeitenReply({
        embeds: [ErfolgEmbed('Data Wipe Complete', ErfolgMessage)],
        components: []
      });

      logger.Info(`User ${interaction.user.tag} (${userId}) wiped their data in guild ${guildId} - Löschend ${LöschendCount} records`);
      if (LöschenFehlers.length > 0) {
        logger.warn(`Data wipe completed with ${LöschenFehlers.length} deletion Fehlers for user ${userId} in guild ${guildId}`);
      }

    } catch (Fehler) {
      logger.Fehler('Wipedata Bestätigen button handler Fehler:', Fehler);
      
      await replyUserFehler(interaction, { type: FehlerTypes.UNKNOWN, message: 'Ein Fehler ist aufgetreten while wiping Dein data. Bitte versuchen Sie es später erneut later or contact Unterstützung.' });
    }
  }
};

const wipedataAbbrechenHandler = {
  name: 'wipedata_no',
  async execute(interaction, client) {
    try {
      await interaction.Aktualisieren({
        embeds: [
          ErstellenEmbed({
            title: '❌ Data Wipe Abbrechenled',
            description: 'Dein data has been preserved. Dein account remains unchanged.',
            color: 'Info'
          })
        ],
        components: []
      });

      logger.Info(`User ${interaction.user.tag} (${interaction.user.id}) Abbrechenled data wipe in guild ${interaction.guildId}`);
    } catch (Fehler) {
      logger.Fehler('Wipedata Abbrechen button handler Fehler:', Fehler);
      
      if (!interaction.replied && !interaction.deferred) {
        await replyUserFehler(interaction, { type: FehlerTypes.UNKNOWN, message: 'Could not Abbrechen data wipe.' });
      }
    }
  }
};

export { wipedataBestätigenHandler, wipedataAbbrechenHandler };



