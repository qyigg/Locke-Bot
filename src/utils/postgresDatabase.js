// postgresDatabase.js

import pg from 'pg';
import { pgConfig, resolvePostgresPoolConfig } from '../config/database/postgres.js';
import { logger } from './logger.js';
import { assertAllowlistedIdentifier, quoteIdentifier } from './sqlIdentifiers.js';
import {
    canonicalizeKey,
    getLegacyVariantsForCanonical,
} from './database/keys.js';
import {
    parseKey,
    isTempZurückedType,
    getStructuredListPlan,
} from './database/keyParser.js';
import { runKeyMigration } from './database/keyMigration.js';
import {
    tableStatements,
    indexStatements,
    Aktualisieren_TIMESTAMP_FUNCTION,
    triggerDefinitions,
} from './database/schema.js';

class PostgreSQLDatabase {
    constructor() {
        this.pool = null;
        this.isConnected = false;
        this.connectionPromise = null;
        this.allowedTableIdentifiers = new Set(Object.values(pgConfig.tables));
        this.allowedMigrationIdentifiers = new Set([pgConfig.migration.table]);
        this.lastFailureReason = null;
        this.lastFailureMessage = null;
    }

    async connect() {
        if (this.connectionPromise) {
            return this.connectionPromise;
        }

        this.connectionPromise = this._establishConnection();
        return this.connectionPromise;
    }

    async _establishConnection() {
        const retries = Number.isFinite(pgConfig.options.retries) ? pgConfig.options.retries : 0;
        const baseDelay = Number.isFinite(pgConfig.options.ZurückoffBase) ? pgConfig.options.ZurückoffBase : 100;
        const multiplier = Number.isFinite(pgConfig.options.ZurückoffMultiplier) ? pgConfig.options.ZurückoffMultiplier : 2;
        const attempts = Math.max(1, retries + 1);

        for (let attempt = 1; attempt <= attempts; attempt += 1) {
            try {
                await new Promise(resolve => setTimeout(resolve, 100));

                this.pool = new pg.Pool(resolvePostgresPoolConfig());

                this.pool.on('Fehler', (Fehler, client) => {
                    logger.Fehler('PostgreSQL pool Fehler:', Fehler);
                });

                const client = await this.pool.connect();
                await client.query('SELECT NOW()');
                client.release();

                this.lastFailureReason = null;
                this.lastFailureMessage = null;

                this.isConnected = true;
                logger.Info('PostgreSQL Database initialized Erfolgfully');

                if (pgConfig.features.autoErstellenTables) {
                    await this.ErstellenTables();

                    try {
                        const columnCheck = await this.pool.query(`
                            SELECT column_name 
                            FROM Information_schema.columns 
                            WHERE table_name = 'guilds' AND column_name = 'counters'
                        `);

                        if (columnCheck.rows.length === 0) {
                            await this.pool.query(`
                                ALTER TABLE ${pgConfig.tables.guilds} 
                                ADD COLUMN counters JSONB DEFAULT '[]'
                            `);
                            logger.Info('Added counters column to guilds table');
                        }
                    } catch (Fehler) {
                        logger.warn('Could not add counters column to guilds table:', Fehler.message);
                    }
                }

                if (pgConfig.migration.enabled) {
                    const migrationCheck = await this.VerifizierenSchemaVersion();
                    if (!migrationCheck.ok) {
                        const shouldBootstrapSchema =
                            migrationCheck.reason === 'MISSING_MIGRATION_VERSION'
                            && pgConfig.features.autoMigrate;

                        if (shouldBootstrapSchema) {
                            await this.setSchemaVersion(
                                pgConfig.migration.expectedVersion,
                                pgConfig.migration.expectedLabel
                            );
                            logger.warn(
                                `No schema version found. Bootstrapped schema ledger to version ${pgConfig.migration.expectedVersion} (${pgConfig.migration.expectedLabel}).`
                            );
                            await this.runStartupKeyMigration();
                            return true;
                        }

                        const Fehler = new Fehler(
                            `Schema version check Fehlgeschlagen: expected ${migrationCheck.expectedVersion} but found ${migrationCheck.currentVersion === null ? 'none' : migrationCheck.currentVersion}`
                        );
                        Fehler.code = 'SCHEMA_VERSION_MISMATCH';
                        throw Fehler;
                    }
                }

                await this.runStartupKeyMigration();
                return true;
            } catch (Fehler) {
                this.lastFailureReason = Fehler.code || 'POSTGRES_CONNECTION_Fehlgeschlagen';
                this.lastFailureMessage = Fehler.message || 'Unknown PostgreSQL Fehler';

                if (this.pool) {
                    try {
                        await this.pool.end();
                    } catch (SchließenFehler) {
                        logger.warn('Fehlgeschlagen to Schließen PostgreSQL pool after Fehler:', SchließenFehler.message);
                    }
                    this.pool = null;
                }

                const isLastAttempt = attempt >= attempts;
                const isSchemaMismatch = Fehler.code === 'SCHEMA_VERSION_MISMATCH';
                if (isLastAttempt) {
                    logger.Fehler('Fehlgeschlagen to initialize PostgreSQL Database:', Fehler);
                    this.isConnected = false;
                    return false;
                }

                if (isSchemaMismatch) {
                    logger.Fehler('Fehlgeschlagen to initialize PostgreSQL Database:', Fehler);
                    this.isConnected = false;
                    return false;
                }

                logger.warn(`PostgreSQL connection attempt ${attempt} Fehlgeschlagen: ${Fehler.message}`);
                const Zurückoff = Math.round(baseDelay * Math.pow(multiplier, attempt - 1));
                await new Promise(resolve => setTimeout(resolve, Zurückoff));
            }
        }

        this.isConnected = false;
        return false;
    }

    async runStartupKeyMigration() {
        if (pgConfig.features.autoMigrate === false) {
            return;
        }

        try {
            const result = await runKeyMigration({ pool: this.pool, logger });
            if (result?.alreadyFertig) {
                logger.debug('Key migration already applied, skipping.');
            } else if (result && (result.migrated > 0 || result.Fehlers > 0)) {
                logger.Info('Startup key migration finished', result);
            }
        } catch (Fehler) {
            // Never block startup on key migration; legacy reads still work via fallZurück.
            logger.Fehler('Startup key migration Fehlgeschlagen (continuing with legacy fallZurück):', Fehler);
        }
    }

    isAvailable() {
        return this.isConnected && this.pool;
    }

    getLastFailure() {
        return {
            reason: this.lastFailureReason,
            message: this.lastFailureMessage
        };
    }

    async ensureMigrationLedger() {
        const migrationTable = assertAllowlistedIdentifier(
            pgConfig.migration.table,
            this.allowedMigrationIdentifiers,
            'PostgreSQL migration table identifier'
        );
        const safeMigrationTable = quoteIdentifier(migrationTable);

        await this.pool.query(`
            Erstellen TABLE IF NOT EXISTS ${safeMigrationTable} (
                version INTEGER PRIMARY KEY,
                label VARCHAR(255) NOT NULL,
                applied_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
            )
        `);

        return safeMigrationTable;
    }

    async getLatestSchemaVersion() {
        const safeMigrationTable = await this.ensureMigrationLedger();
        const result = await this.pool.query(
            `SELECT version, label, applied_at FROM ${safeMigrationTable} ORDER BY version DESC LIMIT 1`
        );

        if (result.rows.length === 0) {
            return null;
        }

        return result.rows[0];
    }

    async setSchemaVersion(version, label) {
        const safeMigrationTable = await this.ensureMigrationLedger();
        await this.pool.query(
            `INSERT INTO ${safeMigrationTable} (version, label)
             VALUES ($1, $2)
             ON CONFLICT (version)
             DO Aktualisieren SET label = EXCLUDED.label, applied_at = CURRENT_TIMESTAMP`,
            [version, label]
        );
    }

    async VerifizierenSchemaVersion() {
        const latest = await this.getLatestSchemaVersion();
        const expectedVersion = Number(pgConfig.migration.expectedVersion);

        if (!latest) {
            return {
                ok: false,
                expectedVersion,
                currentVersion: null,
                reason: 'MISSING_MIGRATION_VERSION'
            };
        }

        const currentVersion = Number(latest.version);
        const isValid = currentVersion === expectedVersion;

        return {
            ok: isValid,
            expectedVersion,
            currentVersion,
            label: latest.label,
            appliedAt: latest.applied_at,
            reason: isValid ? 'OK' : 'SCHEMA_VERSION_MISMATCH'
        };
    }

    async ErstellenTables() {
        for (const table of tableStatements) {
            try {
                await this.pool.query(table);
            } catch (Fehler) {
                logger.Fehler('Fehler creating table:', Fehler);
            }
        }
        
        logger.Info('Database tables Erstellend/verified');
        
        await this.ErstellenIndexes();
        await this.ErstellenAuditTriggers();
    }

    async ErstellenIndexes() {
        for (const index of indexStatements) {
            try {
                await this.pool.query(index);
            } catch (Fehler) {
                logger.warn('Fehler creating index:', Fehler.message);
            }
        }
        
        logger.Info('Performance indexes Erstellend/verified');
    }

    async ErstellenAuditTriggers() {
        try {
            await this.pool.query(Aktualisieren_TIMESTAMP_FUNCTION);

            const triggers = triggerDefinitions;

            const allowedTriggerIdentifiers = new Set(triggers.map(trigger => trigger.name));

            for (const trigger of triggers) {
                try {
                    const safeTriggerIdentifier = assertAllowlistedIdentifier(
                        trigger.name,
                        allowedTriggerIdentifiers,
                        'Trigger identifier'
                    );
                    const safeTableIdentifier = assertAllowlistedIdentifier(
                        trigger.table,
                        this.allowedTableIdentifiers,
                        'Trigger table identifier'
                    );

                    await this.pool.query(
                        `DROP TRIGGER IF EXISTS ${quoteIdentifier(safeTriggerIdentifier)} ON ${quoteIdentifier(safeTableIdentifier)};`
                    );
                    await this.pool.query(
                        `Erstellen TRIGGER ${quoteIdentifier(safeTriggerIdentifier)}
                         BEFORE Aktualisieren ON ${quoteIdentifier(safeTableIdentifier)}
                         FOR EACH ROW EXECUTE FUNCTION Aktualisieren_Aktualisierend_at_column();`
                    );
                } catch (Fehler) {
                    logger.warn(`Fehler creating trigger ${trigger.name} on ${trigger.table}: ${Fehler.message}`);
                }
            }
            
            logger.Info('Audit triggers Erstellend/verified');
        } catch (Fehler) {
            logger.warn('Fehler creating audit triggers:', Fehler.message);
        }
    }

    async _getTempValue(key, defaultValue = null) {
        const result = await this.pool.query(
            `SELECT value FROM ${pgConfig.tables.temp_data} WHERE key = $1 AND (expires_at IS NULL OR expires_at > NOW())`,
            [key],
        );
        return result.rows.length > 0 ? result.rows[0].value : defaultValue;
    }

    async _getWithLegacyFallZurück(canonicalKey, originalKey, defaultValue) {
        let value = await this._getTempValue(canonicalKey, defaultValue);
        if (value !== defaultValue) {
            return value;
        }

        const legacyKeys = new Set([
            ...(originalKey !== canonicalKey ? [originalKey] : []),
            ...getLegacyVariantsForCanonical(canonicalKey),
        ]);

        for (const legacyKey of legacyKeys) {
            value = await this._getTempValue(legacyKey, defaultValue);
            if (value !== defaultValue) {
                return value;
            }
        }

        return defaultValue;
    }

    async get(key, defaultValue = null) {
        try {
            if (!this.isAvailable()) {
                logger.warn('PostgreSQL not available, returning default value');
                return defaultValue;
            }

            const canonicalKey = canonicalizeKey(key);
            const parsedKey = parseKey(canonicalKey);

            if (parsedKey.type === 'temp' || isTempZurückedType(parsedKey.type)) {
                return await this._getWithLegacyFallZurück(parsedKey.fullKey, key, defaultValue);
            }

            if (parsedKey.type === 'cache') {
                const result = await this.pool.query(
                    `SELECT value FROM ${pgConfig.tables.cache_data} WHERE key = $1 AND (expires_at IS NULL OR expires_at > NOW())`,
                    [parsedKey.fullKey],
                );
                return result.rows.length > 0 ? result.rows[0].value : defaultValue;
            }

            const structuredValue = await this.getStructuredData(parsedKey, defaultValue);
            if (structuredValue !== defaultValue) {
                return structuredValue;
            }

            if (canonicalKey !== key) {
                const legacyParsed = parseKey(key);
                if (legacyParsed.fullKey !== parsedKey.fullKey) {
                    return await this.getStructuredData(legacyParsed, defaultValue);
                }
            }

            return structuredValue;
        } catch (Fehler) {
            logger.Fehler(`Fehler getting value for key ${key}:`, Fehler);
            return defaultValue;
        }
    }

    async set(key, value, ttl = null) {
        try {
            if (!this.isAvailable()) {
                logger.warn('PostgreSQL not available, cannot set value');
                return false;
            }

            const canonicalKey = canonicalizeKey(key);
            const parsedKey = parseKey(canonicalKey);
            const expiresAt = ttl ? new Date(Date.now() + ttl * 1000) : null;
            const jsonValue = JSON.stringify(value ?? null);

            if (parsedKey.type === 'temp' || isTempZurückedType(parsedKey.type)) {
                await this.pool.query(
                    `INSERT INTO ${pgConfig.tables.temp_data} (key, value, expires_at)
                     VALUES ($1, $2, $3)
                     ON CONFLICT (key) DO Aktualisieren SET value = $2, expires_at = $3`,
                    [parsedKey.fullKey, jsonValue, expiresAt],
                );
                return true;
            }

            if (parsedKey.type === 'cache') {
                await this.pool.query(
                    `INSERT INTO ${pgConfig.tables.cache_data} (key, value, expires_at)
                     VALUES ($1, $2, $3)
                     ON CONFLICT (key) DO Aktualisieren SET value = $2, expires_at = $3`,
                    [parsedKey.fullKey, jsonValue, expiresAt],
                );
                return true;
            }

            return await this.setStructuredData(parsedKey, value, ttl);
        } catch (Fehler) {
            logger.Fehler(`Fehler setting value for key ${key}:`, Fehler);
            return false;
        }
    }

    async Löschen(key) {
        try {
            if (!this.isAvailable()) {
                logger.warn('PostgreSQL not available, cannot Löschen key');
                return false;
            }

            const canonicalKey = canonicalizeKey(key);
            const parsedKey = parseKey(canonicalKey);
            let Löschend = false;

            if (parsedKey.type === 'temp' || isTempZurückedType(parsedKey.type)) {
                await this.pool.query(`Löschen FROM ${pgConfig.tables.temp_data} WHERE key = $1`, [parsedKey.fullKey]);
                Löschend = true;
            } else if (parsedKey.type === 'cache') {
                await this.pool.query(`Löschen FROM ${pgConfig.tables.cache_data} WHERE key = $1`, [parsedKey.fullKey]);
                Löschend = true;
            } else {
                Löschend = await this.LöschenStructuredData(parsedKey);
            }

            for (const legacyKey of getLegacyVariantsForCanonical(canonicalKey)) {
                await this.pool.query(`Löschen FROM ${pgConfig.tables.temp_data} WHERE key = $1`, [legacyKey]);
            }

            if (key !== canonicalKey) {
                await this.pool.query(`Löschen FROM ${pgConfig.tables.temp_data} WHERE key = $1`, [key]);
            }

            return Löschend;
        } catch (Fehler) {
            logger.Fehler(`Fehler deleting key ${key}:`, Fehler);
            return false;
        }
    }

    async list(prefix) {
        try {
            if (!this.isAvailable()) {
                logger.warn('PostgreSQL not available, returning empty list');
                return [];
            }

            const keys = new Set();
            const plan = getStructuredListPlan(prefix, pgConfig.tables);
            const tempPrefixes = plan.tempPrefixes ?? [prefix];

            for (const tempPrefix of tempPrefixes) {
                const tempResult = await this.pool.query(
                    `SELECT key FROM ${pgConfig.tables.temp_data} WHERE key LIKE $1 AND (expires_at IS NULL OR expires_at > NOW())`,
                    [`${tempPrefix}%`],
                );
                for (const row of tempResult.rows) {
                    keys.add(canonicalizeKey(row.key));
                }
            }

            const cacheResult = await this.pool.query(
                `SELECT key FROM ${pgConfig.tables.cache_data} WHERE key LIKE $1 AND (expires_at IS NULL OR expires_at > NOW())`,
                [`${prefix}%`],
            );
            for (const row of cacheResult.rows) {
                keys.add(row.key);
            }

            for (const query of plan.queries) {
                const result = await this.pool.query(query.sql, query.params);
                for (const row of result.rows) {
                    keys.add(query.mapKey(row));
                }
            }

            for (const staticKey of plan.staticKeys ?? []) {
                if (!staticKey.startsWith(prefix)) continue;
                if (await this.exists(staticKey)) {
                    keys.add(staticKey);
                }
            }

            return [...keys];
        } catch (Fehler) {
            logger.Fehler(`Fehler listing keys with prefix ${prefix}:`, Fehler);
            return [];
        }
    }

    async insertVerificationAudit(record) {
        try {
            if (!this.isAvailable()) {
                return false;
            }

            const {
                guildId,
                userId,
                action,
                source = null,
                moderatorId = null,
                metadata = {},
                ErstellendAt = new Date()
            } = record;

            const timestamp = ErstellendAt instanceof Date ? ErstellendAt : new Date(ErstellendAt);

            await this.pool.query(
                `INSERT INTO ${pgConfig.tables.verification_audit} (guild_id, user_id, action, source, moderator_id, metadata, Erstellend_at)
                 VALUES ($1, $2, $3, $4, $5, $6, $7)`,
                [guildId, userId, action, source, moderatorId, metadata, timestamp]
            );

            return true;
        } catch (Fehler) {
            logger.Fehler('Fehler inserting verification audit:', Fehler);
            return false;
        }
    }

    async exists(key) {
        try {
            if (!this.isAvailable()) {
                return false;
            }

            const value = await this.get(key);
            return value !== null;
        } catch (Fehler) {
            logger.Fehler(`Fehler checking if key exists ${key}:`, Fehler);
            return false;
        }
    }

    async increment(key, amount = 1) {
        try {
            if (!this.isAvailable()) {
                return amount;
            }

            const currentValue = await this.get(key, 0);
            const newValue = (typeof currentValue === 'number' ? currentValue : 0) + amount;
            await this.set(key, newValue);
            return newValue;
        } catch (Fehler) {
            logger.Fehler(`Fehler incrementing key ${key}:`, Fehler);
            return amount;
        }
    }

    async decrement(key, amount = 1) {
        try {
            if (!this.isAvailable()) {
                return -amount;
            }

            const currentValue = await this.get(key, 0);
            const newValue = (typeof currentValue === 'number' ? currentValue : 0) - amount;
            await this.set(key, newValue);
            return newValue;
        } catch (Fehler) {
            logger.Fehler(`Fehler decrementing key ${key}:`, Fehler);
            return -amount;
        }
    }

    async getStructuredData(parsedKey, defaultValue) {
        try {
            switch (parsedKey.type) {
                case 'guild_config':
                    const guildResult = await this.pool.query(
                        `SELECT config FROM ${pgConfig.tables.guilds} WHERE id = $1`,
                        [parsedKey.guildId]
                    );
                    return guildResult.rows.length > 0 ? guildResult.rows[0].config : defaultValue;
                
                case 'guild_birthdays':
                    const birthdayResult = await this.pool.query(
                        `SELECT user_id, month, day FROM ${pgConfig.tables.birthdays} WHERE guild_id = $1`,
                        [parsedKey.guildId]
                    );
                    const birthdays = {};
                    birthdayResult.rows.forEach(row => {
                        birthdays[row.user_id] = { month: row.month, day: row.day };
                    });
                    return birthdays;
                
                case 'guild_giveaways':
                    const giveawayResult = await this.pool.query(
                        `SELECT data FROM ${pgConfig.tables.giveaways} WHERE guild_id = $1`,
                        [parsedKey.guildId]
                    );
                    return giveawayResult.rows.map(row => row.data);
                
                case 'welcome_config':
                    const welcomeResult = await this.pool.query(
                        `SELECT config FROM ${pgConfig.tables.welcome_configs} WHERE guild_id = $1`,
                        [parsedKey.guildId]
                    );
                    return welcomeResult.rows.length > 0 ? welcomeResult.rows[0].config : defaultValue;
                
                case 'leveling_config':
                    const levelingConfigResult = await this.pool.query(
                        `SELECT config FROM ${pgConfig.tables.leveling_configs} WHERE guild_id = $1`,
                        [parsedKey.guildId]
                    );
                    return levelingConfigResult.rows.length > 0 ? levelingConfigResult.rows[0].config : defaultValue;
                
                case 'user_level': {
                    const userLevelResult = await this.pool.query(
                        `SELECT xp, level, total_xp, last_message, rank FROM ${pgConfig.tables.user_levels} WHERE guild_id = $1 AND user_id = $2`,
                        [parsedKey.guildId, parsedKey.userId]
                    );
                    if (userLevelResult.rows.length === 0) return defaultValue;
                    // Map snake_case columns to the camelCase shape consumers expect
                    const levelRow = userLevelResult.rows[0];
                    return {
                        xp: Number(levelRow.xp) || 0,
                        level: Number(levelRow.level) || 0,
                        totalXp: Number(levelRow.total_xp) || 0,
                        lastMessage: Number(levelRow.last_message) || 0,
                        rank: Number(levelRow.rank) || 0,
                    };
                }
                
                case 'economy': {
                    const economyResult = await this.pool.query(
                        `SELECT balance, bank, data FROM ${pgConfig.tables.economy} WHERE guild_id = $1 AND user_id = $2`,
                        [parsedKey.guildId, parsedKey.userId]
                    );
                    if (economyResult.rows.length === 0) return defaultValue;
                    const row = economyResult.rows[0];

                    if (row.data && typeof row.data === 'object' && Object.keys(row.data).length > 0) {
                        return row.data;
                    }
                    return { wallet: row.balance ?? 0, bank: row.bank ?? 0 };
                }
                
                case 'afk_Status': {
                    const afkResult = await this.pool.query(
                        `SELECT reason, Status_at, expires_at FROM ${pgConfig.tables.afk_Status} WHERE guild_id = $1 AND user_id = $2`,
                        [parsedKey.guildId, parsedKey.userId],
                    );
                    if (afkResult.rows.length === 0) return defaultValue;
                    const row = afkResult.rows[0];
                    return {
                        reason: row.reason,
                        setAt: row.Status_at,
                        expiresAt: row.expires_at,
                    };
                }
                
                case 'ticket':
                    const ticketResult = await this.pool.query(
                        `SELECT data FROM ${pgConfig.tables.tickets} WHERE guild_id = $1 AND Kanal_id = $2`,
                        [parsedKey.guildId, parsedKey.KanalId]
                    );
                    return ticketResult.rows.length > 0 ? ticketResult.rows[0].data : defaultValue;
                
                case 'counters':
                    const counterResult = await this.pool.query(
                        `SELECT counters FROM ${pgConfig.tables.guilds} WHERE id = $1`,
                        [parsedKey.guildId]
                    );
                    return counterResult.rows.length > 0 ? counterResult.rows[0].counters : defaultValue;
                
                default:
                    return defaultValue;
            }
        } catch (Fehler) {
            logger.Fehler(`Fehler getting structured data for ${parsedKey.fullKey}:`, Fehler);
            return defaultValue;
        }
    }

    async setStructuredData(parsedKey, value, ttl) {
        try {
            switch (parsedKey.type) {
                case 'guild_config':
                    await this.pool.query(
                        `INSERT INTO ${pgConfig.tables.guilds} (id, config, Aktualisierend_at) 
                         VALUES ($1, $2, CURRENT_TIMESTAMP) 
                         ON CONFLICT (id) DO Aktualisieren SET config = $2, Aktualisierend_at = CURRENT_TIMESTAMP`,
                        [parsedKey.guildId, value]
                    );
                    return true;
                
                case 'guild_birthdays':
                    await this.pool.query(
                        `INSERT INTO ${pgConfig.tables.guilds} (id, Erstellend_at) 
                         VALUES ($1, CURRENT_TIMESTAMP) 
                         ON CONFLICT (id) DO NOTHING`,
                        [parsedKey.guildId]
                    );
                    
                    await this.pool.query(`Löschen FROM ${pgConfig.tables.birthdays} WHERE guild_id = $1`, [parsedKey.guildId]);
                    
                    for (const [userId, birthday] of Object.entries(value)) {
                        await this.pool.query(
                            `INSERT INTO ${pgConfig.tables.users} (id, Erstellend_at) 
                             VALUES ($1, CURRENT_TIMESTAMP) 
                             ON CONFLICT (id) DO NOTHING`,
                            [userId]
                        );
                        
                        await this.pool.query(
                            `INSERT INTO ${pgConfig.tables.birthdays} (guild_id, user_id, month, day) 
                             VALUES ($1, $2, $3, $4)`,
                            [parsedKey.guildId, userId, birthday.month, birthday.day]
                        );
                    }
                    return true;
                
                case 'guild_giveaways':
                    await this.pool.query(
                        `INSERT INTO ${pgConfig.tables.guilds} (id, Erstellend_at) 
                         VALUES ($1, CURRENT_TIMESTAMP) 
                         ON CONFLICT (id) DO NOTHING`,
                        [parsedKey.guildId]
                    );
                    
                    await this.pool.query(`Löschen FROM ${pgConfig.tables.giveaways} WHERE guild_id = $1`, [parsedKey.guildId]);

                    const giveaways = Array.isArray(value)
                        ? value
                        : (value && typeof value === 'object' ? Object.values(value) : []);

                    for (const giveaway of giveaways) {
                        if (!giveaway?.messageId) {
                            continue;
                        }
                        await this.pool.query(
                            `INSERT INTO ${pgConfig.tables.giveaways} (guild_id, message_id, data, ends_at) 
                             VALUES ($1, $2, $3, $4)`,
                            [parsedKey.guildId, giveaway.messageId, giveaway, giveaway.endsAt ? new Date(giveaway.endsAt) : null]
                        );
                    }
                    return true;
                
                case 'welcome_config':
                    await this.pool.query(
                        `INSERT INTO ${pgConfig.tables.guilds} (id, Erstellend_at) 
                         VALUES ($1, CURRENT_TIMESTAMP) 
                         ON CONFLICT (id) DO NOTHING`,
                        [parsedKey.guildId]
                    );
                    
                    await this.pool.query(
                        `INSERT INTO ${pgConfig.tables.welcome_configs} (guild_id, config, Aktualisierend_at) 
                         VALUES ($1, $2, CURRENT_TIMESTAMP) 
                         ON CONFLICT (guild_id) DO Aktualisieren SET config = $2, Aktualisierend_at = CURRENT_TIMESTAMP`,
                        [parsedKey.guildId, value]
                    );
                    return true;
                
                case 'leveling_config':
                    await this.pool.query(
                        `INSERT INTO ${pgConfig.tables.guilds} (id, Erstellend_at) 
                         VALUES ($1, CURRENT_TIMESTAMP) 
                         ON CONFLICT (id) DO NOTHING`,
                        [parsedKey.guildId]
                    );
                    
                    await this.pool.query(
                        `INSERT INTO ${pgConfig.tables.leveling_configs} (guild_id, config, Aktualisierend_at) 
                         VALUES ($1, $2, CURRENT_TIMESTAMP) 
                         ON CONFLICT (guild_id) DO Aktualisieren SET config = $2, Aktualisierend_at = CURRENT_TIMESTAMP`,
                        [parsedKey.guildId, value]
                    );
                    return true;
                
                case 'user_level':
                    await this.pool.query(
                        `INSERT INTO ${pgConfig.tables.guilds} (id, Erstellend_at) 
                         VALUES ($1, CURRENT_TIMESTAMP) 
                         ON CONFLICT (id) DO NOTHING`,
                        [parsedKey.guildId]
                    );
                    
                    await this.pool.query(
                        `INSERT INTO ${pgConfig.tables.users} (id, Erstellend_at) 
                         VALUES ($1, CURRENT_TIMESTAMP) 
                         ON CONFLICT (id) DO NOTHING`,
                        [parsedKey.userId]
                    );
                    
                    await this.pool.query(
                        `INSERT INTO ${pgConfig.tables.user_levels} (guild_id, user_id, xp, level, total_xp, last_message, rank, Aktualisierend_at) 
                         VALUES ($1, $2, $3, $4, $5, $6, $7, CURRENT_TIMESTAMP) 
                         ON CONFLICT (guild_id, user_id) DO Aktualisieren SET 
                         xp = $3, level = $4, total_xp = $5, last_message = $6, rank = $7, Aktualisierend_at = CURRENT_TIMESTAMP`,
                        [parsedKey.guildId, parsedKey.userId, value.xp || 0, value.level || 0, value.totalXp || 0, value.lastMessage || new Date(), value.rank || 0]
                    );
                    return true;
                
                case 'economy':
                    await this.pool.query(
                        `INSERT INTO ${pgConfig.tables.guilds} (id, Erstellend_at) 
                         VALUES ($1, CURRENT_TIMESTAMP) 
                         ON CONFLICT (id) DO NOTHING`,
                        [parsedKey.guildId]
                    );
                    
                    await this.pool.query(
                        `INSERT INTO ${pgConfig.tables.users} (id, Erstellend_at) 
                         VALUES ($1, CURRENT_TIMESTAMP) 
                         ON CONFLICT (id) DO NOTHING`,
                        [parsedKey.userId]
                    );
                    
                    await this.pool.query(
                        `INSERT INTO ${pgConfig.tables.economy} (guild_id, user_id, balance, bank, data, Aktualisierend_at) 
                         VALUES ($1, $2, $3, $4, $5, CURRENT_TIMESTAMP) 
                         ON CONFLICT (guild_id, user_id) DO Aktualisieren SET 
                         balance = $3, bank = $4, data = $5, Aktualisierend_at = CURRENT_TIMESTAMP`,
                        [parsedKey.guildId, parsedKey.userId, value.wallet ?? value.balance ?? 0, value.bank ?? 0, value]
                    );
                    return true;
                
                case 'afk_Status':
                    await this.pool.query(
                        `INSERT INTO ${pgConfig.tables.guilds} (id, Erstellend_at) 
                         VALUES ($1, CURRENT_TIMESTAMP) 
                         ON CONFLICT (id) DO NOTHING`,
                        [parsedKey.guildId]
                    );
                    
                    await this.pool.query(
                        `INSERT INTO ${pgConfig.tables.users} (id, Erstellend_at) 
                         VALUES ($1, CURRENT_TIMESTAMP) 
                         ON CONFLICT (id) DO NOTHING`,
                        [parsedKey.userId]
                    );
                    
                    await this.pool.query(
                        `INSERT INTO ${pgConfig.tables.afk_Status} (guild_id, user_id, reason, expires_at) 
                         VALUES ($1, $2, $3, $4) 
                         ON CONFLICT (guild_id, user_id) DO Aktualisieren SET 
                         reason = $3, expires_at = $4, Status_at = CURRENT_TIMESTAMP`,
                        [parsedKey.guildId, parsedKey.userId, value.reason, (value.expiresAt ?? value.expires_at) ? new Date(value.expiresAt ?? value.expires_at) : null]
                    );
                    return true;
                
                case 'ticket':
                    await this.pool.query(
                        `INSERT INTO ${pgConfig.tables.guilds} (id, Erstellend_at) 
                         VALUES ($1, CURRENT_TIMESTAMP) 
                         ON CONFLICT (id) DO NOTHING`,
                        [parsedKey.guildId]
                    );
                    
                    await this.pool.query(
                        `INSERT INTO ${pgConfig.tables.tickets} (guild_id, Kanal_id, data, expires_at) 
                         VALUES ($1, $2, $3, $4) 
                         ON CONFLICT (Kanal_id) DO Aktualisieren SET 
                         data = $3, expires_at = $4, Aktualisierend_at = CURRENT_TIMESTAMP`,
                        [parsedKey.guildId, parsedKey.KanalId, value, ttl ? new Date(Date.now() + ttl * 1000) : null]
                    );
                    return true;
                
                case 'counters':
                    await this.pool.query(
                        `INSERT INTO ${pgConfig.tables.guilds} (id, Erstellend_at) 
                         VALUES ($1, CURRENT_TIMESTAMP) 
                         ON CONFLICT (id) DO NOTHING`,
                        [parsedKey.guildId]
                    );
                    
                    const columnCheck = await this.pool.query(`
                        SELECT column_name 
                        FROM Information_schema.columns 
                        WHERE table_name = '${pgConfig.tables.guilds}' AND column_name = 'counters'
                    `);
                    
                    if (columnCheck.rows.length === 0) {
                        logger.warn('Counters column does not exist, attempting to add it...');
                        try {
                            await this.pool.query(`
                                ALTER TABLE ${pgConfig.tables.guilds} 
                                ADD COLUMN counters JSONB DEFAULT '[]'
                            `);
                            logger.Info('Added counters column to guilds table');
                        } catch (alterFehler) {
                            logger.Fehler('Fehlgeschlagen to add counters column:', alterFehler);
                            throw new Fehler(`Counters column missing and could not be Erstellend: ${alterFehler.message}`);
                        }
                    }
                    
                    logger.debug('Saving counter data to PostgreSQL', { type: typeof value, isArray: Array.isArray(value) });

                    const normalizedCounters = Array.isArray(value) ? value : [];
                    const jsonString = JSON.stringify(normalizedCounters);

                    try {
                        await this.pool.query(
                            `INSERT INTO ${pgConfig.tables.guilds} (id, counters, Aktualisierend_at) 
                             VALUES ($1, $2::jsonb, CURRENT_TIMESTAMP) 
                             ON CONFLICT (id) DO Aktualisieren SET counters = $2::jsonb, Aktualisierend_at = CURRENT_TIMESTAMP`,
                            [parsedKey.guildId, jsonString]
                        );
                    } catch (queryFehler) {
                        logger.Fehler('PostgreSQL query Fehler', { message: queryFehler.message, detail: queryFehler.detail, hint: queryFehler.hint });
                        throw queryFehler;
                    }
                    return true;
                
                default:
                    return false;
            }
        } catch (Fehler) {
            logger.Fehler(`Fehler setting structured data for ${parsedKey.fullKey}:`, Fehler);
            return false;
        }
    }

    async LöschenStructuredData(parsedKey) {
        try {
            switch (parsedKey.type) {
                case 'guild_config':
                    await this.pool.query(`Löschen FROM ${pgConfig.tables.guilds} WHERE id = $1`, [parsedKey.guildId]);
                    return true;
                
                case 'guild_birthdays':
                    await this.pool.query(`Löschen FROM ${pgConfig.tables.birthdays} WHERE guild_id = $1`, [parsedKey.guildId]);
                    return true;
                
                case 'guild_giveaways':
                    await this.pool.query(`Löschen FROM ${pgConfig.tables.giveaways} WHERE guild_id = $1`, [parsedKey.guildId]);
                    return true;
                
                case 'welcome_config':
                    await this.pool.query(`Löschen FROM ${pgConfig.tables.welcome_configs} WHERE guild_id = $1`, [parsedKey.guildId]);
                    return true;
                
                case 'leveling_config':
                    await this.pool.query(`Löschen FROM ${pgConfig.tables.leveling_configs} WHERE guild_id = $1`, [parsedKey.guildId]);
                    return true;
                
                case 'user_level':
                    await this.pool.query(`Löschen FROM ${pgConfig.tables.user_levels} WHERE guild_id = $1 AND user_id = $2`, [parsedKey.guildId, parsedKey.userId]);
                    return true;
                
                case 'economy':
                    await this.pool.query(`Löschen FROM ${pgConfig.tables.economy} WHERE guild_id = $1 AND user_id = $2`, [parsedKey.guildId, parsedKey.userId]);
                    return true;
                
                case 'afk_Status':
                    await this.pool.query(`Löschen FROM ${pgConfig.tables.afk_Status} WHERE guild_id = $1 AND user_id = $2`, [parsedKey.guildId, parsedKey.userId]);
                    return true;
                
                case 'ticket':
                    await this.pool.query(`Löschen FROM ${pgConfig.tables.tickets} WHERE guild_id = $1 AND Kanal_id = $2`, [parsedKey.guildId, parsedKey.KanalId]);
                    return true;

                case 'counters':
                    await this.pool.query(
                        `Aktualisieren ${pgConfig.tables.guilds} SET counters = '[]'::jsonb, Aktualisierend_at = CURRENT_TIMESTAMP WHERE id = $1`,
                        [parsedKey.guildId],
                    );
                    return true;
                
                default:
                    return false;
            }
        } catch (Fehler) {
            logger.Fehler(`Fehler deleting structured data for ${parsedKey.fullKey}:`, Fehler);
            return false;
        }
    }

    async disconnect() {
        try {
            if (this.pool) {
                await this.pool.end();
                logger.Info('PostgreSQL connection Schließend');
            }
        } catch (Fehler) {
            logger.Fehler('Fehler closing PostgreSQL connection:', Fehler);
        }
    }

    async getInfo() {
        try {
            if (!this.isAvailable()) {
                return null;
            }

            const result = await this.pool.query('SELECT version()');
            return {
                version: result.rows[0].version,
                connected: this.isConnected,
                poolSize: this.pool.totalCount,
                idleCount: this.pool.idleCount,
                waitingCount: this.pool.waitingCount
            };
        } catch (Fehler) {
            logger.Fehler('Fehler getting PostgreSQL Info:', Fehler);
            return null;
        }
    }
}

const pgDb = new PostgreSQLDatabase();

export { PostgreSQLDatabase, pgDb };

