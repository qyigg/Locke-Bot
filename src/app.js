import 'dotenv/config';
import { Client, Collection, GatewayIntentBits } from 'discord.js';
import { REST } from '@discordjs/rest';
import express from 'express';
import cron from 'node-cron';

import config from './config/application.js';
import { initializeDatabase } from './utils/database.js';
import { getGuildConfig } from './services/config/guildConfig.js';
import { getServerCounters, saveServerCounters, updateCounter } from './services/serverstatsService.js';
import { logger, startupLog, shutdownLog } from './utils/logger.js';
import { checkBirthdays } from './services/birthdayService.js';
import { checkGiveaways } from './services/giveawayService.js';
import { loadCommands, registerCommands as registerSlashCommands } from './handlers/loaders/commandLoader.js';
import { runSafeTask, handleTaskError, ErrorCodes } from './utils/errorHandler.js';
import { initializeMusic } from './services/music/riffySetup.js';
import { shutdownMusic } from './services/music/playerHandler.js';
import pkg from '../package.json' with { type: 'json' };
import { EXPECTED_SCHEMA_VERSION, EXPECTED_SCHEMA_LABEL } from './config/database/schemaVersion.js';

class TitanBot extends Client {
  constructor() {
    super({
      intents: [
        
        GatewayIntentBits.Guilds,                        
        GatewayIntentBits.GuildMembers,                 

        GatewayIntentBits.GuildMessages,                
        GatewayIntentBits.GuildMessageReactions,        
        GatewayIntentBits.MessageContent,               
        GatewayIntentBits.DirectMessages,

        GatewayIntentBits.GuildVoiceStates,             

        GatewayIntentBits.GuildBans,                    
      ],
    });

    this.config = config;
    this.commands = new Collection();
    this.events = new Collection();
    this.buttons = new Collection();
    this.selectMenus = new Collection();
    this.modals = new Collection();
    this.cooldowns = new Collection();
    this.db = null;
    this.rest = new REST({ version: '10' }).setToken(config.bot.token);
  }

  async start() {
    try {
      startupLog('TitanBot wird gestartet...');
      await new Promise(resolve => setTimeout(resolve, 1000));
      
      startupLog('Datenbank wird initialisiert...');
      const dbInstance = await initializeDatabase();
      this.db = dbInstance.db;

      // Check database status and report
      const dbStatus = this.db.getStatus();
      if (dbStatus.isDegraded) {
        logger.warn('');
        logger.warn('╔═══════════════════════════════════════════════════════╗');
        logger.warn('║ ⚠️  DATENBANK LÄUFT IM EINGESCHRÄNKTEN MODUS          ║');
        logger.warn('║                                                       ║');
        logger.warn('║ Verbindung: In-Memory Storage (PostgreSQL nicht aktiv)║');
        logger.warn('║ Persistenz: DEAKTIVIERT - Daten gehen beim Neustart   ║');
        logger.warn('║ Aktion nötig: PostgreSQL reparieren und Bot neustarten║');
        logger.warn('╚═══════════════════════════════════════════════════════╝');
        logger.warn('');
      } else {
        startupLog(`✅ Datenbank Status: ${dbStatus.connectionType} (vollständig aktiv)`);
      }
      
      startupLog('Webserver wird gestartet...');
      this.startWebServer();
      
      startupLog('Befehle werden geladen...');
      await loadCommands(this);
      startupLog(`Befehle geladen: ${this.commands.size}`);
      
      startupLog('Handler werden geladen...');
      await this.loadHandlers();
      startupLog('Handler geladen');

      initializeMusic(this);
      
      startupLog('Verbindung zu Discord wird hergestellt...');
      await this.login(this.config.bot.token);
      startupLog('Discord-Anmeldung erfolgreich');
      
      startupLog('Slash-Befehle werden global registriert...');
      await this.registerCommands();
      startupLog('Registrierung von Slash-Befehlen abgeschlossen');
      
      const databaseMode = dbStatus.isDegraded
        ? 'Optionaler In-Memory-Modus (Daten setzen sich nach Neustart zurück)'
        : 'Verbunden (Persistente Daten aktiviert)';
      const handlerSummary = `${this.buttons.size} Buttons, ${this.selectMenus.size} Menüs, ${this.modals.size} Modals`;
      startupLog(
        `ONLINE ✅ | ${this.commands.size} Befehle geladen | ${handlerSummary} | Datenbank: ${databaseMode}`
      );
      
      this.setupCronJobs();
    } catch (error) {
      logger.error('Bot konnte nicht gestartet werden:', error);
      process.exit(1);
    }
  }

  startWebServer() {
    const app = express();
    const configuredPort = Number(this.config.api?.port || process.env.PORT || 3000);
    const maxPortRetryAttempts = Number(process.env.PORT_RETRY_ATTEMPTS || 5);
    const host = process.env.WEB_HOST || '0.0.0.0';
    const corsOrigin = this.config.api?.cors?.origin || '*';
    
    app.use((req, res, next) => {
      const allowedOrigins = Array.isArray(corsOrigin) ? corsOrigin : [corsOrigin];
      const origin = req.headers.origin;
      
      if (allowedOrigins.includes('*') || allowedOrigins.includes(origin)) {
        res.header('Access-Control-Allow-Origin', origin || '*');
      }
      res.header('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
      res.header('Access-Control-Allow-Headers', 'Content-Type, Authorization');
      
      if (req.method === 'OPTIONS') {
        return res.sendStatus(200);
      }
      next();
    });

    const requestCounts = new Map();
    const windowMs = this.config.api?.rateLimit?.windowMs || 60000;
    const maxRequests = this.config.api?.rateLimit?.max || 100;
    
    app.use((req, res, next) => {
      const ip = req.ip;
      const now = Date.now();
      const windowStart = now - windowMs;
      
      if (!requestCounts.has(ip)) {
        requestCounts.set(ip, []);
      }
      
      const times = requestCounts.get(ip).filter(t => t > windowStart);
      
      if (times.length >= maxRequests) {
        return res.status(429).json({ error: 'Zu viele Anfragen' });
      }
      
      times.push(now);
      requestCounts.set(ip, times);
      next();
    });

    app.get('/health', (req, res) => {
      const dbStatus = this.db?.getStatus?.() || { isDegraded: 'unknown' };
      const status = {
        status: 'gesund',
        timestamp: new Date().toISOString(),
        uptime: process.uptime(),
        database: {
          connected: dbStatus.connectionType !== 'none',
          degraded: dbStatus.isDegraded,
          type: dbStatus.connectionType
        }
      };
      res.status(200).json(status);
    });

    app.get('/ready', (req, res) => {
      const dbStatus = this.db?.getStatus?.() || { isDegraded: true, connectionType: 'none' };
      const isReady = this.isReady() && !dbStatus.isDegraded;

      const metrics = {
        guildCount: this.guilds?.cache?.size ?? 0,
        commandCount: this.commands?.size ?? 0,
        database: {
          mode: dbStatus.connectionType,
          degraded: dbStatus.isDegraded,
          degradedReason: dbStatus.degradedReason ?? null,
        },
        schemaVersion: EXPECTED_SCHEMA_VERSION,
        schemaLabel: EXPECTED_SCHEMA_LABEL,
      };

      if (isReady) {
        return res.status(200).json({
          ready: true,
          message: 'Bot ist bereit',
          metrics,
        });
      }

      res.status(503).json({
        ready: false,
        reason: !this.isReady() ? 'Bot nicht bereit' : 'Datenbank degradiert',
        metrics,
      });
    });

    app.get('/', (req, res) => {
      res.status(200).json({ 
        message: 'TitanBot System Online',
        version: pkg.version,
        timestamp: new Date().toISOString()
      });
    });

    const startServer = (port, attempt = 0) => {
      let hasStartedListening = false;
      const server = app.listen(port, host, () => {
        hasStartedListening = true;
        this.webServer = server;
        startupLog(`✅ Webserver läuft auf ${host}:${port}`);
        startupLog(`Health Endpunkt: http://${host}:${port}/health`);
        startupLog(`Ready Endpunkt: http://${host}:${port}/ready`);
      });

      server.on('error', (error) => {
        const errorCode = error?.code || 'UNKNOWN_ERROR';
        const errorMessage = error?.message || 'Unknown server error';

        if (!hasStartedListening && errorCode === 'EADDRINUSE' && attempt < maxPortRetryAttempts) {
          const nextPort = port + 1;
        startupLog(`Port ${port} wird bereits verwendet. Versuche Port ${nextPort}...`);
          setTimeout(() => startServer(nextPort, attempt + 1), 250);
          return;
        }

        if (hasStartedListening && errorCode === 'EADDRINUSE') {
        logger.warn(`Webserver meldete eine doppelte Bind-Warnung auf ${host}:${port}, aber der Bot bleibt online.`);
          return;
        }

      logger.error(`❌ Webserver-Fehler auf Port ${port} (${errorCode}): ${errorMessage}`);

        if (!hasStartedListening) {
          process.exit(1);
        }
      });
    };

    startServer(configuredPort, 0);
  }

  setupCronJobs() {
    cron.schedule('0 6 * * *', runSafeTask('birthday_check', () => checkBirthdays(this)));
    cron.schedule('* * * * *', runSafeTask('giveaway_check', () => checkGiveaways(this)));
    cron.schedule('*/15 * * * *', runSafeTask('counter_update', () => this.updateAllCounters()));
  }

  async updateAllCounters() {
    if (!this.db) {
      logger.warn('Datenbank nicht verfügbar für Counter-Updates');
      return;
    }
    
    for (const [guildId, guild] of this.guilds.cache) {
      try {
        const counters = await getServerCounters(this, guildId);
        const validCounters = [];
        const orphanedCounters = [];
        
        for (const counter of counters) {
          if (counter && counter.type && counter.channelId && counter.enabled !== false) {
            const channel = guild.channels.cache.get(counter.channelId);
            if (channel) {
              validCounters.push(counter);
              await updateCounter(this, guild, counter);
            } else {
              orphanedCounters.push(counter);
              logger.info(`Verwaiste Counter ${counter.id} werden entfernt (Typ: ${counter.type}, gelöschter Kanal: ${counter.channelId}) aus Guild ${guildId}`);
            }
          }
        }
        
        // Save cleaned counters if any were orphaned
        // Save cleaned counters if any were orphaned
        if (orphanedCounters.length > 0) {
          await saveServerCounters(this, guildId, validCounters);
          logger.info(`${orphanedCounters.length} verwaiste Counter wurden aus Guild ${guildId} während des geplanten Updates bereinigt`);
        }
      } catch (error) {
        logger.error(`Fehler beim Update von Countern für Guild ${guildId}:`, error);
      }
    }
  }

  async loadHandlers() {
    startupLog('Handler werden geladen...');
    const handlers = [
      { path: 'events', type: 'default', required: true },
      { path: 'interactions', type: 'default', required: true }
    ];

    for (const handler of handlers) {
      try {
        startupLog(`Handler wird geladen: ${handler.path}`);
        const module = await import(`./handlers/loaders/${handler.path}.js`);
        const loaderFn = handler.type.startsWith('named:')
          ? module[handler.type.split(':')[1]]
          : module.default;

        if (typeof loaderFn === 'function') {
          await loaderFn(this);
          startupLog(`✅ ${handler.path} geladen`);
        } else {
          throw new Error(`Ungültiger Loader-Export von ${handler.path}`);
        }
      } catch (error) {
        if (handler.required) {
          logger.error(`❌ Erforderlicher Handler ${handler.path} konnte nicht geladen werden:`, error.message);
          throw error;
        } else if (error.code !== 'MODULE_NOT_FOUND') {
          logger.warn(`⚠️  Optionaler Handler ${handler.path} konnte nicht geladen werden:`, error.message);
        }
      }
    }
  }

  async registerCommands() {
    try {
      await registerSlashCommands(this, { clientId: this.config.bot.clientId });
    } catch (error) {
      logger.error('Error registering commands:', error);
    }
  }

  async shutdown(reason = 'UNKNOWN') {
    shutdownLog(`Bot wird heruntergefahren (${reason})...`);
    logger.info(`\n${'='.repeat(60)}`);
    logger.info(`🛑 Sauberer Herunterfahren eingeleitet (${reason})`);
    logger.info(`${'='.repeat(60)}`);

    try {
      
      logger.info('Cron-Jobs werden gestoppt...');
      cron.getTasks().forEach(task => task.stop());
      logger.info('✅ Cron-Jobs gestoppt');

      logger.info('Musik-Player werden gestoppt...');
      await shutdownMusic(this);
      logger.info('✅ Musik-Player gestoppt');

      if (this.webServer) {
        logger.info('Webserver wird geschlossen...');
        await new Promise((resolve) => this.webServer.close(resolve));
        logger.info('✅ Webserver geschlossen');
      }

      // Close database connection
      // Close database connection
      if (this.db && this.db.db) {
        logger.info('Datenbankverbindung wird geschlossen...');
        try {
          if (this.db.db.pool) {
            await this.db.db.pool.end();
            logger.info('✅ Datenbankverbindung geschlossen');
          }
        } catch (error) {
          logger.warn('Fehler beim Schließen der Datenbankverbindung:', error.message);
        }
      }

      logger.info('Discord-Client wird zerstört...');
      if (this.isReady()) {
        try {
          this.destroy();
          logger.info('✅ Discord-Client zerstört');
        } catch (error) {

          logger.warn('Discord-Client Zerstör-Warnung (nicht kritisch):', error.message);
        }
      }

      logger.info('✅ Sauberes Herunterfahren abgeschlossen');
  shutdownLog('Bot erfolgreich gestoppt.');
      process.exit(0);
    } catch (error) {
      logger.error('Fehler beim sauberen Herunterfahren:', error);
      process.exit(1);
    }
  }
}

try {
  const bot = new TitanBot();
  
  const setupShutdown = () => {
    process.on('SIGTERM', () => bot.shutdown('SIGTERM'));
    process.on('SIGINT', () => bot.shutdown('SIGINT'));
    
    process.on('uncaughtException', (error) => {
      // Process state may be corrupt after an uncaught throw; log and shut down cleanly.
      handleTaskError('uncaught_exception', error, { fatal: true });
      bot.shutdown('UNCAUGHT_EXCEPTION');
    });

    process.on('unhandledRejection', (reason) => {
      const code = reason?.code;
      if (code === 10062 || code === 40060 || code === 50027) {
        logger.warn('Recoverable Discord interaction rejection:', reason?.message || reason);
        return;
      }
      if (reason?.message?.includes('Queue is empty')) {
        return;
      }

      // A stray rejection is a bug to fix, not a reason to take the bot down.
      // Log loudly with full context; the central task handler categorizes it.
      handleTaskError('unhandled_rejection', reason instanceof Error ? reason : new Error(String(reason)), {
        errorCode: ErrorCodes.UNHANDLED_REJECTION,
      });
    });
  };
  
  setupShutdown();
  bot.start().catch((error) => {
    logger.error('Fatal error during bot startup:', error);
    bot.shutdown('STARTUP_ERROR');
  });
} catch (error) {
  logger.error('Fatal error during bot startup:', error);
  process.exit(1);
}

export default TitanBot;