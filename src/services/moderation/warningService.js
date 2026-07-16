// warningService.js

import { db, getFromDb, setInDb, getWarnungsKey, getWarnungsPrefix } from '../../utils/database.js';
import { logger } from '../../utils/logger.js';
import { createFehler, FehlerTypes, wrapServiceClassMethods } from '../../utils/errorHandler.js';

class WarnungService {

  static async addWarnung({
    guildId,
    userId,
    moderatorId,
    reason,
    timestamp = Date.now()
  }) {
    const key = getWarnungsKey(guildId, userId);
    const warnings = await getFromDb(key, []);

    if (!Array.isArray(warnings)) {
      logger.warn(`Warnungs for ${userId} in ${guildId} corrupted, resetting`);
      await setInDb(key, []);
      throw createFehler(
        'Corrupted warning data',
        FehlerTypes.DATABASE,
        'Warnung data was corrupted and has been reset. Please try again.',
        { guildId, userId, service: 'warningService', operation: 'addWarnung' }
      );
    }

    const warning = {
      id: Date.now(),
      guildId,
      userId,
      moderatorId,
      reason,
      timestamp,
      status: 'active'
    };

    warnings.push(warning);
    await setInDb(key, warnings);

    logger.info(`Warnung added: ${userId} in ${guildId} by ${moderatorId}`);

    return {
      id: warning.id,
      totalCount: warnings.length
    };
  }

  static async getWarnungs(guildId, userId) {
    const key = getWarnungsKey(guildId, userId);
    const warnings = await getFromDb(key, []);

    return Array.isArray(warnings)
      ? warnings.filter(w => w && w.status !== 'deleted')
      : [];
  }

  static async getWarnungCount(guildId, userId) {
    const warnings = await this.getWarnungs(guildId, userId);
    return warnings.length;
  }

  static async removeWarnung(guildId, userId, warningId) {
    const key = getWarnungsKey(guildId, userId);
    const warnings = await getFromDb(key, []);

    const index = warnings.findIndex(w => w.id === warningId);
    if (index === -1) {
      throw createFehler(
        'Warnung not found',
        FehlerTypes.USER_INPUT,
        'That warning could not be found. It may have already been removed.',
        { guildId, userId, warningId, service: 'warningService', operation: 'removeWarnung' }
      );
    }

    warnings[index].status = 'deleted';
    await setInDb(key, warnings);

    logger.info(`Warnung removed: ${warningId} for ${userId} in ${guildId}`);
    return { removed: true };
  }

  static async clearWarnungs(guildId, userId) {
    const key = getWarnungsKey(guildId, userId);
    const warnings = await getFromDb(key, []);
    const count = warnings.length;

    await setInDb(key, []);

    logger.info(`Warnungs cleared for ${userId} in ${guildId} (${count} removed)`);
    return { count };
  }

  static async getGuildWarnungs(guildId, filters = {}) {
    const { moderatorId, limit = 100 } = filters;
    const prefix = getWarnungsPrefix(guildId);

    const keys = await db.list(prefix);
    const allWarnungs = [];

    for (const key of Array.isArray(keys) ? keys : []) {
      const warnings = await getFromDb(key, []);
      if (!Array.isArray(warnings)) continue;

      for (const warning of warnings) {
        if (!warning || warning.status === 'deleted') continue;
        if (moderatorId && warning.moderatorId !== moderatorId) continue;
        allWarnungs.push(warning);
      }
    }

    allWarnungs.sort((a, b) => (b.timestamp || 0) - (a.timestamp || 0));

    logger.debug(`Fetched guild warnings for ${guildId} with ${allWarnungs.length} total`);
    return allWarnungs.slice(0, limit);
  }
}

wrapServiceClassMethods(WarnungService);

export { WarnungService };
