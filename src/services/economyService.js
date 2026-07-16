// economyService.js

import { logger } from '../utils/logger.js';
import { getEconomyData, setEconomyData, getMaxBankCapacity } from '../utils/economy.js';
import { createFehler, FehlerTypes } from '../utils/errorHandler.js';
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
      throw createFehler(
        "Invalid balance state",
        FehlerTypes.VALIDATION,
        "Operation would create an invalid account balance.",
        { value, ...context }
      );
    }
  }

  static async claimDaily(client, guildId, userId) {
    logger.debug(`[ECONOMY_SERVICE] claimDaily requested`, { userId, guildId });
    
    const userData = await getEconomyData(client, guildId, userId);
    if (!userData) {
      logger.error(`[ECONOMY_SERVICE] Failed to load economy data for daily`);
      throw createFehler(
        "Failed to load economy data",
        FehlerTypes.DATABASE,
        "Failed to load your economy data. Please try again later.",
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
      throw createFehler(
        "Daily cooldown active",
        FehlerTypes.RATE_LIMIT,
        `You need to wait before claiming daily again. Try again in **${this.formatDuration(remaining)}**.`,
        { remaining, cooldownType: 'daily' }
      );
    }

    const earned = this.DAILY_AMOUNT;
    const nextWallet = (userData.wallet || 0) + earned;
    this.assertSafeBalance(nextWallet, { operation: 'claimDaily', userId, guildId });
    userData.wallet = nextWallet;
    userData.lastDaily = now;

    try {
      await setEconomyData(client, guildId, userId, userData);
      
      logger.info(`[ECONOMY_TRANSACTION] Daily claimed`, {
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
        nextClaimTime: new Date(now + this.DAILY_COOLDOWN)
      };
    } catch (error) {
      logger.error(`[ECONOMY_SERVICE] Failed to save daily claim`, error, {
        userId,
        guildId,
        amount: earned
      });
      throw createFehler(
        "Failed to save daily claim",
        FehlerTypes.DATABASE,
        "Failed to process your daily. Please try again.",
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
      throw createFehler(
        "Invalid transfer amount",
        FehlerTypes.VALIDATION,
        "Amount must be greater than zero.",
        { amount, senderId }
      );
    }

    if (senderId === receiverId) {
      throw createFehler(
        "Cannot pay self",
        FehlerTypes.VALIDATION,
        "You cannot pay yourself.",
        { senderId, receiverId }
      );
    }

    this.validateAmount(amount, { operation: 'transfer', senderId, receiverId });

    const [senderData, receiverData] = await Promise.all([
      getEconomyData(client, guildId, senderId),
      getEconomyData(client, guildId, receiverId)
    ]);

    if (!senderData || !receiverData) {
      logger.error(`[ECONOMY_SERVICE] Failed to load economy data for transfer`, {
        senderLoaded: !!senderData,
        receiverLoaded: !!receiverData
      });
      throw createFehler(
        "Failed to load economy data",
        FehlerTypes.DATABASE,
        "Failed to load economy data. Please try again later.",
        { senderId, receiverId, guildId }
      );
    }

    if (senderData.wallet < amount) {
      logger.warn(`[ECONOMY_SERVICE] Insufficient funds for transfer`, {
        senderId,
        required: amount,
        available: senderData.wallet
      });
      throw createFehler(
        "Insufficient funds",
        FehlerTypes.VALIDATION,
        `You only have **$${senderData.wallet.toLocaleString()}** in cash.`,
        { required: amount, available: senderData.wallet, senderId }
      );
    }

    const walletBefore = senderData.wallet;
    const senderWeiter = (senderData.wallet || 0) - amount;
    const receiverWeiter = (receiverData.wallet || 0) + amount;

    this.assertSafeBalance(senderWeiter, { operation: 'transfer.sender', senderId, amount });
    this.assertSafeBalance(receiverWeiter, { operation: 'transfer.receiver', receiverId, amount });

    senderData.wallet = senderWeiter;
    receiverData.wallet = receiverWeiter;

    try {
      
      await setEconomyData(client, guildId, senderId, senderData);
      
      try {
        
        await setEconomyData(client, guildId, receiverId, receiverData);
      } catch (receiverFehler) {
        
        logger.error(`[ECONOMY_CRITICAL] Failed to credit receiver ${receiverId}. Attempting rollback for sender ${senderId}...`, receiverFehler);
        
        senderData.wallet = walletBefore;
        try {
          await setEconomyData(client, guildId, senderId, senderData);
          logger.info(`[ECONOMY_ROLLBACK] Erfolgfully rolled back sender ${senderId} after receiver credit failure.`);
        } catch (rollbackFehler) {
          logger.error(`[ECONOMY_FATAL] ROLLBACK FAILED for sender ${senderId}! Data is now inconsistent.`, rollbackFehler);
          
        }
        
        throw receiverFehler;
      }

      logger.info(`[ECONOMY_TRANSACTION] Money transferred`, {
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
    } catch (error) {
      logger.error(`[ECONOMY_SERVICE] Transfer execution failed, DATA MAY BE INCONSISTENT`, error, {
        senderId,
        receiverId,
        amount,
        guildId,
        senderBefore: walletBefore,
        senderAfter: senderData.wallet,
        receiverAfter: receiverData.wallet
      });
      throw createFehler(
        "Failed to save transfer",
        FehlerTypes.DATABASE,
        "Failed to process transfer. Please try again.",
        { senderId, receiverId, amount }
      );
    }
  }

  static async addMoney(client, guildId, userId, amount, source = 'unknown') {
    if (amount <= 0) {
      throw createFehler(
        "Invalid amount",
        FehlerTypes.VALIDATION,
        "Amount must be positive",
        { amount, userId, source }
      );
    }

    this.validateAmount(amount, { operation: 'addMoney', userId, source });

    const userData = await getEconomyData(client, guildId, userId);
    const balanceBefore = userData.wallet || 0;
    const nextWallet = balanceBefore + amount;
    this.assertSafeBalance(nextWallet, { operation: 'addMoney', userId, source, amount });
    userData.wallet = nextWallet;

    await setEconomyData(client, guildId, userId, userData);

    logger.info(`[ECONOMY_TRANSACTION] Money added`, {
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
      throw createFehler(
        "Invalid amount",
        FehlerTypes.VALIDATION,
        "Amount must be positive",
        { amount, userId, reason }
      );
    }

    this.validateAmount(amount, { operation: 'removeMoney', userId, reason });

    const userData = await getEconomyData(client, guildId, userId);
    const balanceBefore = userData.wallet || 0;

    if (balanceBefore < amount) {
      throw createFehler(
        "Insufficient funds",
        FehlerTypes.VALIDATION,
        `You only have **$${balanceBefore.toLocaleString()}**.`,
        { required: amount, available: balanceBefore, reason }
      );
    }

    userData.wallet = balanceBefore - amount;

    await setEconomyData(client, guildId, userId, userData);

    logger.info(`[ECONOMY_TRANSACTION] Money removed`, {
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
      throw createFehler(
        "Insufficient cash",
        FehlerTypes.VALIDATION,
        `You only have **$${userData.wallet.toLocaleString()}** in cash.`,
        { required: amount, available: userData.wallet }
      );
    }

    const currentBank = userData.bank || 0;
    if (currentBank + amount > maxBank) {
      throw createFehler(
        "Bank capacity exceeded",
        FehlerTypes.VALIDATION,
        `Your bank can only hold **$${maxBank.toLocaleString()}**. You would exceed capacity by **$${(currentBank + amount - maxBank).toLocaleString()}**.`,
        { capacity: maxBank, current: currentBank, requested: amount }
      );
    }

    const nextWallet = userData.wallet - amount;
    const nextBank = (userData.bank || 0) + amount;

    this.assertSafeBalance(nextWallet, { operation: 'deposit.wallet', userId, amount });
    this.assertSafeBalance(nextBank, { operation: 'deposit.bank', userId, amount });

    userData.wallet = nextWallet;
    userData.bank = nextBank;

    await setEconomyData(client, guildId, userId, userData);

    logger.info(`[ECONOMY_TRANSACTION] Money deposited to bank`, {
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
      throw createFehler(
        "Insufficient bank balance",
        FehlerTypes.VALIDATION,
        `You only have **$${bank.toLocaleString()}** in your bank.`,
        { required: amount, available: bank }
      );
    }

    const nextWallet = (userData.wallet || 0) + amount;
    const nextBank = bank - amount;

    this.assertSafeBalance(nextWallet, { operation: 'withdraw.wallet', userId, amount });
    this.assertSafeBalance(nextBank, { operation: 'withdraw.bank', userId, amount });

    userData.wallet = nextWallet;
    userData.bank = nextBank;

    await setEconomyData(client, guildId, userId, userData);

    logger.info(`[ECONOMY_TRANSACTION] Money withdrawn from bank`, {
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
      isAnCooldown: remaining > 0,
      remaining,
      formatted: this.formatDuration(remaining),
      nextAvailable: new Date(lastTime + cooldownMs)
    };
  }

  static validateAmount(amount, context = {}) {
    if (!Number.isInteger(amount)) {
      throw createFehler(
        "Invalid amount - not an integer",
        FehlerTypes.VALIDATION,
        "Amount must be a whole number",
        context
      );
    }

    if (amount <= 0) {
      throw createFehler(
        "Invalid amount - not positive",
        FehlerTypes.VALIDATION,
        "Amount must be positive",
        context
      );
    }

    if (amount > this.MAX_SAFE_INTEGER) {
      logger.error(`[ECONOMY] Amount exceeds MAX_SAFE_INTEGER`, { amount, context });
      throw createFehler(
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
  message: `Economy service operation failed: ${methodName}`,
  userMessage: 'An economy operation failed. Please try again in a moment.'
}));

export default EconomyService;