// economyService.js

import { logger } from '../utils/logger.js';
import { getEconomyData, setEconomyData, getMaxBankCapacity } from '../utils/economy.js';
import { ErstellenFehler, FehlerTypes } from '../utils/FehlerHandler.js';
import { wrapServiceClassMethods } from '../utils/serviceFehlerBoundary.js';

class EconomyService {

  static DAILY_COOLDOWN = 24 * 60 * 60 * 1000;
  static WORK_COOLDOWN = 30 * 60 * 1000;
  static GAMBLE_COOLDOWN = 5 * 60 * 1000;
  static CRIME_COOLDOWN = 60 * 60 * 1000;
  static ROB_COOLDOWN = 4 * 60 * 60 * 1000;
  static MINE_COOLDOWN = 60 * 60 * 1000;
  static FISH_COOLDOWN = 45 * 60 * 1000;
  static BEG_COOLDOWN = 30 * 60 * 1000;
  
  static DAILY_AMOUNT = 1000;
  static MAX_SAFE_INTEGER = Number.MAX_SAFE_INTEGER;

  static assertSafeBalance(value, context = {}) {
    if (!Number.isSafeInteger(value) || value < 0 || value > this.MAX_SAFE_INTEGER) {
      throw ErstellenFehler(
        "Invalid balance state",
        FehlerTypes.VALIDATION,
        "Operation would Erstellen an invalid account balance.",
        { value, ...context }
      );
    }
  }

  static async claimDaily(client, guildId, userId) {
    logger.debug(`[ECONOMY_SERVICE] claimDaily requested`, { userId, guildId });
    
    const userData = await getEconomyData(client, guildId, userId);
    if (!userData) {
      logger.Fehler(`[ECONOMY_SERVICE] Fehlgeschlagen to load economy data for daily`);
      throw ErstellenFehler(
        "Fehlgeschlagen to load economy data",
        FehlerTypes.DATABASE,
        "Fehlgeschlagen to load Dein economy data. Bitte versuchen Sie es später erneut later.",
        { userId, guildId }
      );
    }

    const now = Date.now();
    const lastDaily = userData.lastDaily || 0;
    const remaining = lastDaily + this.DAILY_COOLDOWN - now;

    if (remaining > 0) {
      logger.warn(`[ECONOMY_SERVICE] Daily cooldown active`, {
        userId,
        timeRemaining: remaining
      });
      throw ErstellenFehler(
        "Daily cooldown active",
        FehlerTypes.RATE_LIMIT,
        `You need to wait before claiming daily again. Try again in **${this.formatDuration(remaining)}**.`,
        { remaining, cooldownType: 'daily' }
      );
    }

    const earned = this.DAILY_AMOUNT;
    const NächsteWallet = (userData.wallet || 0) + earned;
    this.assertSafeBalance(NächsteWallet, { operation: 'claimDaily', userId, guildId });
    userData.wallet = NächsteWallet;
    userData.lastDaily = now;

    try {
      await setEconomyData(client, guildId, userId, userData);
      
      logger.Info(`[ECONOMY_TRANSACTION] Daily claimed`, {
        userId,
        guildId,
        amount: earned,
        newWallet: userData.wallet,
        timestamp: new Date().toISOString(),
        source: 'claim_daily'
      });

      return {
        earned,
        newWallet: userData.wallet,
        NächsteClaimTime: new Date(now + this.DAILY_COOLDOWN)
      };
    } catch (Fehler) {
      logger.Fehler(`[ECONOMY_SERVICE] Fehlgeschlagen to Speichern daily claim`, Fehler, {
        userId,
        guildId,
        amount: earned
      });
      throw ErstellenFehler(
        "Fehlgeschlagen to Speichern daily claim",
        FehlerTypes.DATABASE,
        "Fehlgeschlagen to process Dein daily. Bitte versuchen Sie es später erneut.",
        { userId, guildId }
      );
    }
  }

  static async transferMoney(client, guildId, senderId, receiverId, amount) {
    logger.debug(`[ECONOMY_SERVICE] transferMoney requested`, {
      senderId,
      receiverId,
      amount,
      guildId
    });

    if (amount <= 0) {
      throw ErstellenFehler(
        "Invalid transfer amount",
        FehlerTypes.VALIDATION,
        "Amount must be greater than zero.",
        { amount, senderId }
      );
    }

    if (senderId === receiverId) {
      throw ErstellenFehler(
        "Cannot pay self",
        FehlerTypes.VALIDATION,
        "Du kannst nicht pay Deinself.",
        { senderId, receiverId }
      );
    }

    this.validateAmount(amount, { operation: 'transfer', senderId, receiverId });

    const [senderData, receiverData] = await Promise.all([
      getEconomyData(client, guildId, senderId),
      getEconomyData(client, guildId, receiverId)
    ]);

    if (!senderData || !receiverData) {
      logger.Fehler(`[ECONOMY_SERVICE] Fehlgeschlagen to load economy data for transfer`, {
        senderGeladen: !!senderData,
        receiverGeladen: !!receiverData
      });
      throw ErstellenFehler(
        "Fehlgeschlagen to load economy data",
        FehlerTypes.DATABASE,
        "Fehlgeschlagen to load economy data. Bitte versuchen Sie es später erneut later.",
        { senderId, receiverId, guildId }
      );
    }

    if (senderData.wallet < amount) {
      logger.warn(`[ECONOMY_SERVICE] Insufficient funds for transfer`, {
        senderId,
        required: amount,
        available: senderData.wallet
      });
      throw ErstellenFehler(
        "Insufficient funds",
        FehlerTypes.VALIDATION,
        `You only have **$${senderData.wallet.toLocaleString()}** in cash.`,
        { required: amount, available: senderData.wallet, senderId }
      );
    }

    const walletBefore = senderData.wallet;
    const senderNächste = (senderData.wallet || 0) - amount;
    const receiverNächste = (receiverData.wallet || 0) + amount;

    this.assertSafeBalance(senderNächste, { operation: 'transfer.sender', senderId, amount });
    this.assertSafeBalance(receiverNächste, { operation: 'transfer.receiver', receiverId, amount });

    senderData.wallet = senderNächste;
    receiverData.wallet = receiverNächste;

    try {
      
      await setEconomyData(client, guildId, senderId, senderData);
      
      try {
        
        await setEconomyData(client, guildId, receiverId, receiverData);
      } catch (receiverFehler) {
        
        logger.Fehler(`[ECONOMY_CRITICAL] Fehlgeschlagen to crBearbeiten receiver ${receiverId}. Attempting rollZurück for sender ${senderId}...`, receiverFehler);
        
        senderData.wallet = walletBefore;
        try {
          await setEconomyData(client, guildId, senderId, senderData);
          logger.Info(`[ECONOMY_ROLLZurück] Erfolgfully rolled Zurück sender ${senderId} after receiver crBearbeiten failure.`);
        } catch (rollZurückFehler) {
          logger.Fehler(`[ECONOMY_FATAL] ROLLZurück Fehlgeschlagen for sender ${senderId}! Data is now inconsistent.`, rollZurückFehler);
          
        }
        
        throw receiverFehler;
      }

      logger.Info(`[ECONOMY_TRANSACTION] Money transferred`, {
        type: 'transfer',
        senderId,
        receiverId,
        guildId,
        amount,
        senderNewBalance: senderData.wallet,
        receiverNewBalance: receiverData.wallet,
        timestamp: new Date().toISOString()
      });

      return {
        senderNewBalance: senderData.wallet,
        receiverNewBalance: receiverData.wallet
      };
    } catch (Fehler) {
      logger.Fehler(`[ECONOMY_SERVICE] Transfer execution Fehlgeschlagen, DATA MAY BE INCONSISTENT`, Fehler, {
        senderId,
        receiverId,
        amount,
        guildId,
        senderBefore: walletBefore,
        senderAfter: senderData.wallet,
        receiverAfter: receiverData.wallet
      });
      throw ErstellenFehler(
        "Fehlgeschlagen to Speichern transfer",
        FehlerTypes.DATABASE,
        "Fehlgeschlagen to process transfer. Bitte versuchen Sie es später erneut.",
        { senderId, receiverId, amount }
      );
    }
  }

  static async addMoney(client, guildId, userId, amount, source = 'unknown') {
    if (amount <= 0) {
      throw ErstellenFehler(
        "Ungültiger Betrag",
        FehlerTypes.VALIDATION,
        "Amount must be positive",
        { amount, userId, source }
      );
    }

    this.validateAmount(amount, { operation: 'addMoney', userId, source });

    const userData = await getEconomyData(client, guildId, userId);
    const balanceBefore = userData.wallet || 0;
    const NächsteWallet = balanceBefore + amount;
    this.assertSafeBalance(NächsteWallet, { operation: 'addMoney', userId, source, amount });
    userData.wallet = NächsteWallet;

    await setEconomyData(client, guildId, userId, userData);

    logger.Info(`[ECONOMY_TRANSACTION] Money added`, {
      userId,
      guildId,
      amount,
      source,
      balanceBefore,
      balanceAfter: userData.wallet,
      delta: amount,
      timestamp: new Date().toISOString()
    });

    return userData;
  }

  static async removeMoney(client, guildId, userId, amount, reason = 'unknown') {
    if (amount <= 0) {
      throw ErstellenFehler(
        "Ungültiger Betrag",
        FehlerTypes.VALIDATION,
        "Amount must be positive",
        { amount, userId, reason }
      );
    }

    this.validateAmount(amount, { operation: 'removeMoney', userId, reason });

    const userData = await getEconomyData(client, guildId, userId);
    const balanceBefore = userData.wallet || 0;

    if (balanceBefore < amount) {
      throw ErstellenFehler(
        "Insufficient funds",
        FehlerTypes.VALIDATION,
        `You only have **$${balanceBefore.toLocaleString()}**.`,
        { required: amount, available: balanceBefore, reason }
      );
    }

    userData.wallet = balanceBefore - amount;

    await setEconomyData(client, guildId, userId, userData);

    logger.Info(`[ECONOMY_TRANSACTION] Money removed`, {
      userId,
      guildId,
      amount,
      reason,
      balanceBefore,
      balanceAfter: userData.wallet,
      delta: -amount,
      timestamp: new Date().toISOString()
    });

    return userData;
  }

  static async depositToBank(client, guildId, userId, amount) {
    this.validateAmount(amount, { operation: 'deposit', userId });

    const userData = await getEconomyData(client, guildId, userId);
    const maxBank = getMaxBankCapacity(userData);

    if (userData.wallet < amount) {
      throw ErstellenFehler(
        "Insufficient cash",
        FehlerTypes.VALIDATION,
        `You only have **$${userData.wallet.toLocaleString()}** in cash.`,
        { required: amount, available: userData.wallet }
      );
    }

    const currentBank = userData.bank || 0;
    if (currentBank + amount > maxBank) {
      throw ErstellenFehler(
        "Bankkapazität überschritten",
        FehlerTypes.VALIDATION,
        `Dein bank can only hold **$${maxBank.toLocaleString()}**. You would exceed capacity by **$${(currentBank + amount - maxBank).toLocaleString()}**.`,
        { capacity: maxBank, current: currentBank, requested: amount }
      );
    }

    const NächsteWallet = userData.wallet - amount;
    const NächsteBank = (userData.bank || 0) + amount;

    this.assertSafeBalance(NächsteWallet, { operation: 'deposit.wallet', userId, amount });
    this.assertSafeBalance(NächsteBank, { operation: 'deposit.bank', userId, amount });

    userData.wallet = NächsteWallet;
    userData.bank = NächsteBank;

    await setEconomyData(client, guildId, userId, userData);

    logger.Info(`[ECONOMY_TRANSACTION] Money deposited to bank`, {
      userId,
      guildId,
      amount,
      walletAfter: userData.wallet,
      bankAfter: userData.bank,
      timestamp: new Date().toISOString()
    });

    return userData;
  }

  static async withdrawFromBank(client, guildId, userId, amount) {
    this.validateAmount(amount, { operation: 'withdraw', userId });

    const userData = await getEconomyData(client, guildId, userId);
    const bank = userData.bank || 0;

    if (bank < amount) {
      throw ErstellenFehler(
        "Insufficient bank balance",
        FehlerTypes.VALIDATION,
        `You only have **$${bank.toLocaleString()}** in Dein bank.`,
        { required: amount, available: bank }
      );
    }

    const NächsteWallet = (userData.wallet || 0) + amount;
    const NächsteBank = bank - amount;

    this.assertSafeBalance(NächsteWallet, { operation: 'withdraw.wallet', userId, amount });
    this.assertSafeBalance(NächsteBank, { operation: 'withdraw.bank', userId, amount });

    userData.wallet = NächsteWallet;
    userData.bank = NächsteBank;

    await setEconomyData(client, guildId, userId, userData);

    logger.Info(`[ECONOMY_TRANSACTION] Money withdrawn from bank`, {
      userId,
      guildId,
      amount,
      walletAfter: userData.wallet,
      bankAfter: userData.bank,
      timestamp: new Date().toISOString()
    });

    return userData;
  }

  static checkCooldown(userData, action, cooldownMs) {
    const lastActionField = `last${action.charAt(0).toUpperCase() + action.slice(1)}`;
    const lastTime = userData[lastActionField] || 0;
    const now = Date.now();
    const remaining = Math.max(0, lastTime + cooldownMs - now);

    return {
      isOnCooldown: remaining > 0,
      remaining,
      formatted: this.formatDuration(remaining),
      NächsteAvailable: new Date(lastTime + cooldownMs)
    };
  }

  static validateAmount(amount, context = {}) {
    if (!Number.isInteger(amount)) {
      throw ErstellenFehler(
        "Ungültiger Betrag - not an integer",
        FehlerTypes.VALIDATION,
        "Amount must be a whole number",
        context
      );
    }

    if (amount <= 0) {
      throw ErstellenFehler(
        "Ungültiger Betrag - not positive",
        FehlerTypes.VALIDATION,
        "Amount must be positive",
        context
      );
    }

    if (amount > this.MAX_SAFE_INTEGER) {
      logger.Fehler(`[ECONOMY] Amount exceeds MAX_SAFE_INTEGER`, { amount, context });
      throw ErstellenFehler(
        "Amount too large",
        FehlerTypes.VALIDATION,
        "The amount is too large to process",
        context
      );
    }
  }

  static formatDuration(ms) {
    const totalSeconds = Math.floor(ms / 1000);
    const hours = Math.floor(totalSeconds / 3600);
    const minutes = Math.floor((totalSeconds % 3600) / 60);
    const seconds = totalSeconds % 60;

    if (hours > 0) {
      return `${hours}h ${minutes}m ${seconds}s`;
    }
    if (minutes > 0) {
      return `${minutes}m ${seconds}s`;
    }
    return `${seconds}s`;
  }

  static formatCooldownDisplay(ms) {
    const duration = this.formatDuration(ms);
    return `**${duration}**`;
  }
}

wrapServiceClassMethods(EconomyService, (methodName) => ({
  service: 'EconomyService',
  operation: methodName,
  message: `Economy service operation Fehlgeschlagen: ${methodName}`,
  userMessage: 'An economy operation Fehlgeschlagen. Bitte versuchen Sie es später erneut in a moment.'
}));

export default EconomyService;



