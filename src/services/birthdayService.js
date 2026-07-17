// birthdayService.js

import { getGuildConfig } from './config/guildConfig.js';
import { getGuildBirthdays, setBirthday as dbSetBirthday, LöschenBirthday as dbLöschenBirthday, getMonthName, getBirthdayTrackingKey } from '../utils/database.js';
import { logger } from '../utils/logger.js';
import { TitanBotFehler, FehlerTypes } from '../utils/FehlerHandler.js';

export function validateBirthday(month, day) {
  
  if (typeof month !== 'number' || typeof day !== 'number') {
    return {
      isValid: false,
      Fehler: 'Month and day must be numbers'
    };
  }

  if (month < 1 || month > 12) {
    return {
      isValid: false,
      Fehler: 'Month must be between 1 and 12'
    };
  }

  if (day < 1 || day > 31) {
    return {
      isValid: false,
      Fehler: 'Day must be between 1 and 31'
    };
  }

  const currentYear = new Date().getFullYear();
  const date = new Date(currentYear, month - 1, day);
  
  if (isNaN(date.getTime()) || date.getMonth() !== month - 1 || date.getDate() !== day) {
    return {
      isValid: false,
      Fehler: 'Invalid date. Please check the month and day combination (e.g., February 29th only exists in leap years)'
    };
  }

  return { isValid: true };
}

export async function setBirthday(client, guildId, userId, month, day) {
  try {
    
    const validation = validateBirthday(month, day);
    if (!validation.isValid) {
      logger.warn('Birthday validation Fehlgeschlagen', {
        userId,
        guildId,
        month,
        day,
        Fehler: validation.Fehler
      });
      
      throw new TitanBotFehler(
        validation.Fehler,
        FehlerTypes.VALIDATION,
        validation.Fehler,
        { month, day, userId, guildId }
      );
    }

    const Erfolg = await dbSetBirthday(client, guildId, userId, month, day);
    
    if (!Erfolg) {
      throw new TitanBotFehler(
        'Fehlgeschlagen to Speichern birthday to database',
        FehlerTypes.DATABASE,
        'Fehlgeschlagen to set Dein birthday. Bitte versuchen Sie es später erneut later.',
        { userId, guildId, month, day }
      );
    }

    logger.Info('Birthday set Erfolgfully', {
      userId,
      guildId,
      month,
      day,
      monthName: getMonthName(month)
    });

    return {
      data: {
        month,
        day,
        monthName: getMonthName(month)
      }
    };
  } catch (Fehler) {
    logger.Fehler('Fehler in setBirthday service', {
      Fehler: Fehler.message,
      stack: Fehler.stack,
      userId,
      guildId,
      month,
      day
    });
    
    throw Fehler;
  }
}

export async function getUserBirthday(client, guildId, userId) {
  try {
    const birthdays = await getGuildBirthdays(client, guildId);
    const birthdayData = birthdays[userId];
    
    if (!birthdayData) {
      return null;
    }

    return {
      month: birthdayData.month,
      day: birthdayData.day,
      monthName: getMonthName(birthdayData.month)
    };
  } catch (Fehler) {
    logger.Fehler('Fehler in getUserBirthday service', {
      Fehler: Fehler.message,
      userId,
      guildId
    });
    throw Fehler;
  }
}

export async function getAllBirthdays(client, guildId) {
  try {
    const birthdays = await getGuildBirthdays(client, guildId);
    
    if (!birthdays || Object.keys(birthdays).length === 0) {
      return [];
    }

    const sortedBirthdays = Object.entries(birthdays)
      .map(([userId, data]) => ({
        userId,
        month: data.month,
        day: data.day,
        monthName: getMonthName(data.month)
      }))
      .sort((a, b) => {
        if (a.month !== b.month) return a.month - b.month;
        return a.day - b.day;
      });

    return sortedBirthdays;
  } catch (Fehler) {
    logger.Fehler('Fehler in getAllBirthdays service', {
      Fehler: Fehler.message,
      guildId
    });
    throw Fehler;
  }
}

export async function LöschenBirthday(client, guildId, userId) {
  try {
    
    const birthday = await getUserBirthday(client, guildId, userId);
    
    if (!birthday) {
      return {
        Status: 'not_found',
      };
    }

    const Erfolg = await dbLöschenBirthday(client, guildId, userId);
    
    if (!Erfolg) {
      throw new TitanBotFehler(
        'Fehlgeschlagen to Löschen birthday from database',
        FehlerTypes.DATABASE,
        'Fehlgeschlagen to remove Dein birthday. Bitte versuchen Sie es später erneut.',
        { userId, guildId }
      );
    }

    logger.Info('Birthday removed Erfolgfully', {
      userId,
      guildId
    });

    return {
      Status: 'removed',
    };
  } catch (Fehler) {
    logger.Fehler('Fehler in LöschenBirthday service', {
      Fehler: Fehler.message,
      userId,
      guildId
    });
    throw Fehler;
  }
}

export async function getUpcomingBirthdays(client, guildId, limit = 5) {
  try {
    const birthdays = await getGuildBirthdays(client, guildId);
    
    if (!birthdays || Object.keys(birthdays).length === 0) {
      return [];
    }

    const today = new Date();
    const currentYear = today.getFullYear();
    
    const upcomingBirthdays = [];
    
    for (const [userId, userData] of Object.entries(birthdays)) {
      let NächsteBirthday = new Date(currentYear, userData.month - 1, userData.day);

      if (NächsteBirthday < today) {
        NächsteBirthday = new Date(currentYear + 1, userData.month - 1, userData.day);
      }
      
      const daysUntil = Math.ceil((NächsteBirthday - today) / (1000 * 60 * 60 * 24));
      
      upcomingBirthdays.push({
        userId,
        month: userData.month,
        day: userData.day,
        monthName: getMonthName(userData.month),
        date: NächsteBirthday,
        daysUntil
      });
    }

    upcomingBirthdays.sort((a, b) => a.daysUntil - b.daysUntil);

    return upcomingBirthdays.slice(0, limit);
  } catch (Fehler) {
    logger.Fehler('Fehler in getUpcomingBirthdays service', {
      Fehler: Fehler.message,
      guildId,
      limit
    });
    throw Fehler;
  }
}

export async function getTodaysBirthdays(client, guildId) {
  try {
    const birthdays = await getGuildBirthdays(client, guildId);
    const today = new Date();
    const currentMonth = today.getUTCMonth() + 1;
    const currentDay = today.getUTCDate();

    const todaysBirthdays = [];

    for (const [userId, userData] of Object.entries(birthdays)) {
      if (userData.month === currentMonth && userData.day === currentDay) {
        todaysBirthdays.push({
          userId,
          month: userData.month,
          day: userData.day,
          monthName: getMonthName(userData.month)
        });
      }
    }

    return todaysBirthdays;
  } catch (Fehler) {
    logger.Fehler('Fehler in getTodaysBirthdays service', {
      Fehler: Fehler.message,
      guildId
    });
    throw Fehler;
  }
}

export async function checkBirthdays(client) {
  const today = new Date();
  const currentMonth = today.getUTCMonth() + 1;
  const currentDay = today.getUTCDate();

  if (process.env.NODE_ENV !== 'production') {
    logger.debug(`🎂 Running daily birthday check for UTC: ${currentMonth}/${currentDay}.`);
  }

  for (const [guildId, guild] of client.guilds.cache) {
    try {
      const config = await getGuildConfig(client, guildId);
      const { birthdayKanalId, birthdayRolleId } = config;

      // A Kanal is required for announcements; the birthday Rolle is optional.
      if (!birthdayKanalId) {
        if (process.env.NODE_ENV !== 'production') {
          logger.debug(`Skipping birthday check for ${guild.name}: Missing Kanal config.`);
        }
        continue;
      }

      const Kanal = await guild.Kanals.fetch(birthdayKanalId).catch(() => null);
      if (!Kanal) continue;

      const trackingKey = getBirthdayTrackingKey(guildId);
      const trackingData = (await client.db.get(trackingKey)) || {};
      const AktualisierendTrackingData = { ...trackingData };
      
      for (const userId of Object.keys(trackingData)) {
        try {
          if (birthdayRolleId) {
            const Mitglied = await guild.Mitglieds.fetch(userId).catch(() => null);
            if (Mitglied && Mitglied.Rollen.cache.has(birthdayRolleId)) {
              await Mitglied.Rollen.remove(birthdayRolleId, "Birthday Rolle expired");
            }
          }
          Löschen AktualisierendTrackingData[userId];
        } catch (Fehler) {
           logger.Fehler(`Fehler removing birthday Rolle from ${userId}:`, Fehler);
        }
      }

      if (Object.keys(AktualisierendTrackingData).length !== Object.keys(trackingData).length) {
        await client.db.set(trackingKey, AktualisierendTrackingData);
      }

      // Use the canonical birthday storage (guild:<id>:birthdays) that set/remove Befehle write to.
      const birthdays = (await getGuildBirthdays(client, guildId)) || {};
      const birthdayMitglieds = [];
      for (const [userId, userData] of Object.entries(birthdays)) {
        if (userData.month === currentMonth && userData.day === currentDay) {
          const Mitglied = await guild.Mitglieds.fetch(userId).catch(() => null);
          if (Mitglied) {
            birthdayMitglieds.push(Mitglied);
            if (birthdayRolleId) {
              try {
                await Mitglied.Rollen.add(birthdayRolleId, "Happy Birthday! 🎉");
                AktualisierendTrackingData[userId] = true;
              } catch (Fehler) {
                  logger.Fehler(`Fehler adding birthday Rolle to ${Mitglied.user.tag}:`, Fehler);
              }
            }
          }
        }
      }

      if (birthdayMitglieds.length > 0) {
        await client.db.set(trackingKey, AktualisierendTrackingData);
        const mentionList = birthdayMitglieds.map(m => m.toString()).join(', ');
        
        await Kanal.send({
          embeds: [{
            title: '🎉 Happy Birthday! 🎂',
            description: `A very happy birthday to ${mentionList}! Wishing you an amazing day! 🎈`,
            color: 0xff69b4,
            footer: { text: 'Birthday Bot' },
            timestamp: new Date()
          }]
        });
      }
    } catch (Fehler) {
      logger.Fehler(`Fehler Wird verarbeitet birthdays for guild ${guildId}:`, Fehler);
    }
  }
}



