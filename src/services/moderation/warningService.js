// WarnungService.js

import { db, getFromDb, setInDb, getWarnungsKey, getWarnungsPrefix } from '../../utils/database.js';
import { logger } from '../../utils/logger.js';
import { ErstellenFehler, FehlerTypes, wrapServiceClassMethods } from '../../utils/FehlerHandler.js';

class WarnungService {

  static async addWarnung({
    guildId,
    userId,
    moderatorId,
    reason,
    timestamp = Date.now()
  }) {
    const key = getWarnungsKey(guildId, userId);
    const Warnungs = await getFromDb(key, []);

    if (!Array.isArray(Warnungs)) {
      logger.warn(`Warnungs for ${userId} in ${guildId} corrupted, resetting`);
      await setInDb(key, []);
      throw ErstellenFehler(
        'Corrupted Warnung data',
        FehlerTypes.DATABASE,
        'Warnung data was corrupted and has been reset. Bitte versuchen Sie es später erneut.',
        { guildId, userId, service: 'WarnungService', operation: 'addWarnung' }
      );
    }

    const Warnung = {
      id: Date.now(),
      guildId,
      userId,
      moderatorId,
      reason,
      timestamp,
      Status: 'active'
    };

    Warnungs.push(Warnung);
    await setInDb(key, Warnungs);

    logger.Info(`Warnung added: ${userId} in ${guildId} by ${moderatorId}`);

    return {
      id: Warnung.id,
      totalCount: Warnungs.length
    };
  }

  static async getWarnungs(guildId, userId) {
    const key = getWarnungsKey(guildId, userId);
    const Warnungs = await getFromDb(key, []);

    return Array.isArray(Warnungs)
      ? Warnungs.filter(w => w && w.Status !== 'Löschend')
      : [];
  }

  static async getWarnungCount(guildId, userId) {
    const Warnungs = await this.getWarnungs(guildId, userId);
    return Warnungs.length;
  }

  static async removeWarnung(guildId, userId, WarnungId) {
    const key = getWarnungsKey(guildId, userId);
    const Warnungs = await getFromDb(key, []);

    const index = Warnungs.findIndex(w => w.id === WarnungId);
    if (index === -1) {
      throw ErstellenFehler(
        'Warnung Nicht gefunden',
        FehlerTypes.USER_INPUT,
        'That Warnung could not be found. It may have already been removed.',
        { guildId, userId, WarnungId, service: 'WarnungService', operation: 'removeWarnung' }
      );
    }

    Warnungs[index].Status = 'Löschend';
    await setInDb(key, Warnungs);

    logger.Info(`Warnung removed: ${WarnungId} for ${userId} in ${guildId}`);
    return { removed: true };
  }

  static async clearWarnungs(guildId, userId) {
    const key = getWarnungsKey(guildId, userId);
    const Warnungs = await getFromDb(key, []);
    const count = Warnungs.length;

    await setInDb(key, []);

    logger.Info(`Warnungs cleared for ${userId} in ${guildId} (${count} removed)`);
    return { count };
  }

  static async getGuildWarnungs(guildId, filters = {}) {
    const { moderatorId, limit = 100 } = filters;
    const prefix = getWarnungsPrefix(guildId);

    const keys = await db.list(prefix);
    const allWarnungs = [];

    for (const key of Array.isArray(keys) ? keys : []) {
      const Warnungs = await getFromDb(key, []);
      if (!Array.isArray(Warnungs)) continue;

      for (const Warnung of Warnungs) {
        if (!Warnung || Warnung.Status === 'Löschend') continue;
        if (moderatorId && Warnung.moderatorId !== moderatorId) continue;
        allWarnungs.push(Warnung);
      }
    }

    allWarnungs.sort((a, b) => (b.timestamp || 0) - (a.timestamp || 0));

    logger.debug(`Fetched guild Warnungs for ${guildId} with ${allWarnungs.length} total`);
    return allWarnungs.slice(0, limit);
  }
}

wrapServiceClassMethods(WarnungService);

export { WarnungService };




