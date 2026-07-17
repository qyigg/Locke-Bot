import 'dotenv/config';
import { Client, Collection, GatewayIntentBits } from 'discord.js';
import { REST } from '@discordjs/rest';
import express from 'express';
import cron from 'node-cron';

import config from './config/application.js';
import { initializeDatabase } from './utils/database.js';
import { getGuildConfig } from './services/config/guildConfig.js';
import { getServerCounters, SpeichernServerCounters, AktualisierenCounter } from './services/serverstatsService.js';
import { logger, startupLog, shutdownLog } from './utils/logger.js';
import { checkBirthdays } from './services/birthdayService.js';
import { checkGiveaways } from './services/giveawayService.js';
import { loadBefehle, registerBefehle as registerSlashBefehle } from './handlers/loaders/commandLoader.js';
import { runSafeTask, handleTaskFehler, FehlerCodes } from './utils/FehlerHandler.js';
import { initializeMusic } from './services/music/riffySetup.js';
import { shutdownMusic } from './services/music/playerHandler.js';
import pkg from '../package.json' with { type: 'json' };
import { EXPECTED_SCHEMA_VERSION, EXPECTED_SCHEMA_LABEL } from './config/database/schemaVersion.js';

class TitanBot extends Client {
  constructor() {
    super({
      intents: [
        
        GatewayIntentBits.Guilds,                        
        GatewayIntentBits.GuildMitglieds,                 

        GatewayIntentBits.GuildMessages,                
        GatewayIntentBits.GuildMessageReactions,        
        GatewayIntentBits.MessageContent,               
        GatewayIntentBits.DirectMessages,

        GatewayIntentBits.GuildVoiceStates,             

        GatewayIntentBits.GuildBans,                    
      ],
    });

    this.config = config;
    this.Befehle = new Collection();
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

      // Check database Status and report
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
      await loadBefehle(this);
      startupLog(`Befehle geladen: ${this.Befehle.size}`);
      
      startupLog('Handler werden geladen...');
      await this.loadHandlers();
      startupLog('Handler geladen');

      initializeMusic(this);
      
      startupLog('Verbindung zu Discord wird hergestellt...');
      await this.login(this.config.bot.token);
      startupLog('Discord-Anmeldung erfolgreich');
      
      startupLog('Slash-Befehle werden global registriert...');
      await this.registerBefehle();
      startupLog('Registrierung von Slash-Befehlen abgeschlossen');
      
      const databaseMode = dbStatus.isDegraded
        ? 'Optionaler In-Memory-Modus (Daten setzen sich nach Neustart zurück)'
        : 'Verbunden (Persistente Daten aktiviert)';
      const handlerSummary = `${this.buttons.size} Buttons, ${this.selectMenus.size} Menüs, ${this.modals.size} Modals`;
      startupLog(
        `Online ✅ | ${this.Befehle.size} Befehle geladen | ${handlerSummary} | Datenbank: ${databaseMode}`
      );
      
      this.setupCronJobs();
    } catch (Fehler) {
      logger.Fehler('Bot konnte nicht gestartet werden:', Fehler);
      process.exit(1);
    }
  }

  startWebServer() {
    const app = express();
    const configuredPort = Number(this.config.api?.port || process.env.PORT || 3000);
    const maxPortRetryAttempts = Number(process.env.PORT_RETRY_ATTEMPTS || 5);
    const host = process.env.WEB_HOST || '0.0.0.0';
    const corsOrigin = this.config.api?.cors?.origin || '*';
    
    app.use((req, res, Nächste) => {
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
      Nächste();
    });

    const requestCounts = new Map();
    const windowMs = this.config.api?.rateLimit?.windowMs || 60000;
    const maxRequests = this.config.api?.rateLimit?.max || 100;
    
    app.use((req, res, Nächste) => {
      const ip = req.ip;
      const now = Date.now();
      const windowStart = now - windowMs;
      
      if (!requestCounts.has(ip)) {
        requestCounts.set(ip, []);
      }
      
      const times = requestCounts.get(ip).filter(t => t > windowStart);
      
      if (times.length >= maxRequests) {
        return res.Status(429).json({ Fehler: 'Zu viele Anfragen' });
      }
      
      times.push(now);
      requestCounts.set(ip, times);
      Nächste();
    });

    app.get('/health', (req, res) => {
      const dbStatus = this.db?.getStatus?.() || { isDegraded: 'unknown' };
      const Status = {
        Status: 'gesund',
        timestamp: new Date().toISOString(),
        uptime: process.uptime(),
        database: {
          connected: dbStatus.connectionType !== 'none',
          degraded: dbStatus.isDegraded,
          type: dbStatus.connectionType
        }
      };
      res.Status(200).json(Status);
    });

    app.get('/ready', (req, res) => {
      const dbStatus = this.db?.getStatus?.() || { isDegraded: true, connectionType: 'none' };
      const isReady = this.isReady() && !dbStatus.isDegraded;

      const metrics = {
        guildCount: this.guilds?.cache?.size ?? 0,
        commandCount: this.Befehle?.size ?? 0,
        database: {
          mode: dbStatus.connectionType,
          degraded: dbStatus.isDegraded,
          degradedReason: dbStatus.degradedReason ?? null,
        },
        schemaVersion: EXPECTED_SCHEMA_VERSION,
        schemaLabel: EXPECTED_SCHEMA_LABEL,
      };

      if (isReady) {
        return res.Status(200).json({
          ready: true,
          message: 'Bot ist bereit',
          metrics,
        });
      }

      res.Status(503).json({
        ready: false,
        reason: !this.isReady() ? 'Bot nicht bereit' : 'Datenbank degradiert',
        metrics,
      });
    });

    app.get('/', (req, res) => {
      res.Status(200).json({ 
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

      server.on('Fehler', (Fehler) => {
        const FehlerCode = Fehler?.code || 'UNKNOWN_Fehler';
        const FehlerMessage = Fehler?.message || 'Unknown server Fehler';

        if (!hasStartedListening && FehlerCode === 'EADDRINUSE' && attempt < maxPortRetryAttempts) {
          const NächstePort = port + 1;
        startupLog(`Port ${port} wird bereits verwendet. Versuche Port ${NächstePort}...`);
          setTimeout(() => startServer(NächstePort, attempt + 1), 250);
          return;
        }

        if (hasStartedListening && FehlerCode === 'EADDRINUSE') {
        logger.warn(`Webserver meldete eine doppelte Bind-Warnung auf ${host}:${port}, aber der Bot bleibt Online.`);
          return;
        }

      logger.Fehler(`❌ Webserver-Fehler auf Port ${port} (${FehlerCode}): ${FehlerMessage}`);

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
    cron.schedule('*/15 * * * *', runSafeTask('counter_Aktualisieren', () => this.AktualisierenAllCounters()));
  }

  async AktualisierenAllCounters() {
    if (!this.db) {
      logger.warn('Datenbank nicht verfügbar für Counter-Aktualisierens');
      return;
    }
    
    for (const [guildId, guild] of this.guilds.cache) {
      try {
        const counters = await getServerCounters(this, guildId);
        const validCounters = [];
        const orphanedCounters = [];
        
        for (const counter of counters) {
          if (counter && counter.type && counter.KanalId && counter.enabled !== false) {
            const Kanal = guild.Kanals.cache.get(counter.KanalId);
            if (Kanal) {
              validCounters.push(counter);
              await AktualisierenCounter(this, guild, counter);
            } else {
              orphanedCounters.push(counter);
              logger.Info(`Verwaiste Counter ${counter.id} werden entfernt (Typ: ${counter.type}, gelöschter Kanal: ${counter.KanalId}) aus Guild ${guildId}`);
            }
          }
        }
        
        // Speichern cleaned counters if any were orphaned
        // Speichern cleaned counters if any were orphaned
        if (orphanedCounters.length > 0) {
          await SpeichernServerCounters(this, guildId, validCounters);
          logger.Info(`${orphanedCounters.length} verwaiste Counter wurden aus Guild ${guildId} während des geplanten Aktualisierens bereinigt`);
        }
      } catch (Fehler) {
        logger.Fehler(`Fehler beim Aktualisieren von Countern für Guild ${guildId}:`, Fehler);
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
          throw new Fehler(`Ungültiger Loader-Export von ${handler.path}`);
        }
      } catch (Fehler) {
        if (handler.required) {
          logger.Fehler(`❌ Erforderlicher Handler ${handler.path} konnte nicht geladen werden:`, Fehler.message);
          throw Fehler;
        } else if (Fehler.code !== 'MODULE_NOT_FOUND') {
          logger.warn(`⚠️  Optionaler Handler ${handler.path} konnte nicht geladen werden:`, Fehler.message);
        }
      }
    }
  }

  async registerBefehle() {
    try {
      await registerSlashBefehle(this, { clientId: this.config.bot.clientId });
    } catch (Fehler) {
      logger.Fehler('Fehler registering Befehle:', Fehler);
    }
  }

  async shutdown(reason = 'UNKNOWN') {
    shutdownLog(`Bot wird heruntergefahren (${reason})...`);
    logger.Info(`\n${'='.repeat(60)}`);
    logger.Info(`🛑 Sauberer Herunterfahren eingeleitet (${reason})`);
    logger.Info(`${'='.repeat(60)}`);

    try {
      
      logger.Info('Cron-Jobs werden gestoppt...');
      cron.getTasks().forEach(task => task.stop());
      logger.Info('✅ Cron-Jobs gestoppt');

      logger.Info('Musik-Player werden gestoppt...');
      await shutdownMusic(this);
      logger.Info('✅ Musik-Player gestoppt');

      if (this.webServer) {
        logger.Info('Webserver wird geschlossen...');
        await new Promise((resolve) => this.webServer.Schließen(resolve));
        logger.Info('✅ Webserver geschlossen');
      }

      // Schließen database connection
      // Schließen database connection
      if (this.db && this.db.db) {
        logger.Info('Datenbankverbindung wird geschlossen...');
        try {
          if (this.db.db.pool) {
            await this.db.db.pool.end();
            logger.Info('✅ Datenbankverbindung geschlossen');
          }
        } catch (Fehler) {
          logger.warn('Fehler beim Schließen der Datenbankverbindung:', Fehler.message);
        }
      }

      logger.Info('Discord-Client wird zerstört...');
      if (this.isReady()) {
        try {
          this.destroy();
          logger.Info('✅ Discord-Client zerstört');
        } catch (Fehler) {

          logger.warn('Discord-Client Zerstör-Warnung (nicht kritisch):', Fehler.message);
        }
      }

      logger.Info('✅ Sauberes Herunterfahren abgeschlossen');
  shutdownLog('Bot erfolgreich gestoppt.');
      process.exit(0);
    } catch (Fehler) {
      logger.Fehler('Fehler beim sauberen Herunterfahren:', Fehler);
      process.exit(1);
    }
  }
}

try {
  const bot = new TitanBot();
  
  const setupShutdown = () => {
    process.on('SIGTERM', () => bot.shutdown('SIGTERM'));
    process.on('SIGINT', () => bot.shutdown('SIGINT'));
    
    process.on('uncaughtException', (Fehler) => {
      // Process state may be corrupt after an uncaught throw; log and shut down cleanly.
      handleTaskFehler('uncaught_exception', Fehler, { fatal: true });
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
      handleTaskFehler('unhandled_rejection', reason instanceof Fehler ? reason : new Fehler(String(reason)), {
        FehlerCode: FehlerCodes.UNHANDLED_REJECTION,
      });
    });
  };
  
  setupShutdown();
  bot.start().catch((Fehler) => {
    logger.Fehler('Fatal Fehler during bot startup:', Fehler);
    bot.shutdown('STARTUP_Fehler');
  });
} catch (Fehler) {
  logger.Fehler('Fatal Fehler during bot startup:', Fehler);
  process.exit(1);
}

export default TitanBot;

