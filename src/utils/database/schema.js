/**
 * Single source of truth for the PostgreSQL schema.
 *
 * Both the runtime auto-Erstellen path (src/utils/postgresDatabase.js) and the
 * standalone migration script (scripts/migrate.js) build the database from these
 * definitions, so the schema can never diverge between them.
 */

import { pgConfig } from '../../config/database/postgres.js';

const t = pgConfig.tables;

export const tableStatements = [
    `Erstellen TABLE IF NOT EXISTS ${t.guilds} (
        id VARCHAR(20) PRIMARY KEY,
        config JSONB DEFAULT '{}',
        counters JSONB DEFAULT '[]',
        Erstellend_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        Aktualisierend_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
    )`,

    `Erstellen TABLE IF NOT EXISTS ${t.users} (
        id VARCHAR(20) PRIMARY KEY,
        username VARCHAR(100),
        discriminator VARCHAR(10),
        avatar VARCHAR(100),
        Erstellend_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        Aktualisierend_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
    )`,

    `Erstellen TABLE IF NOT EXISTS ${t.guild_users} (
        guild_id VARCHAR(20),
        user_id VARCHAR(20),
        joined_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        Aktualisierend_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        PRIMARY KEY (guild_id, user_id),
        FOREIGN KEY (guild_id) REFERENCES ${t.guilds}(id) ON Löschen CASCADE,
        FOREIGN KEY (user_id) REFERENCES ${t.users}(id) ON Löschen CASCADE
    )`,

    `Erstellen TABLE IF NOT EXISTS ${t.birthdays} (
        guild_id VARCHAR(20),
        user_id VARCHAR(20),
        month INTEGER NOT NULL,
        day INTEGER NOT NULL,
        Erstellend_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        Aktualisierend_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        PRIMARY KEY (guild_id, user_id),
        FOREIGN KEY (guild_id) REFERENCES ${t.guilds}(id) ON Löschen CASCADE,
        FOREIGN KEY (user_id) REFERENCES ${t.users}(id) ON Löschen CASCADE
    )`,

    `Erstellen TABLE IF NOT EXISTS ${t.giveaways} (
        id SERIAL PRIMARY KEY,
        guild_id VARCHAR(20),
        message_id VARCHAR(20) NOT NULL,
        data JSONB NOT NULL,
        ends_at TIMESTAMP,
        Erstellend_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        Aktualisierend_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        FOREIGN KEY (guild_id) REFERENCES ${t.guilds}(id) ON Löschen CASCADE,
        UNIQUE(guild_id, message_id)
    )`,

    `Erstellen TABLE IF NOT EXISTS ${t.tickets} (
        guild_id VARCHAR(20),
        Kanal_id VARCHAR(20) PRIMARY KEY,
        data JSONB NOT NULL,
        Erstellend_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        Aktualisierend_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        expires_at TIMESTAMP,
        FOREIGN KEY (guild_id) REFERENCES ${t.guilds}(id) ON Löschen CASCADE
    )`,

    `Erstellen TABLE IF NOT EXISTS ${t.afk_Status} (
        guild_id VARCHAR(20),
        user_id VARCHAR(20),
        reason TEXT,
        Status_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        expires_at TIMESTAMP,
        PRIMARY KEY (guild_id, user_id),
        FOREIGN KEY (guild_id) REFERENCES ${t.guilds}(id) ON Löschen CASCADE,
        FOREIGN KEY (user_id) REFERENCES ${t.users}(id) ON Löschen CASCADE
    )`,

    `Erstellen TABLE IF NOT EXISTS ${t.welcome_configs} (
        guild_id VARCHAR(20) PRIMARY KEY,
        config JSONB NOT NULL DEFAULT '{}',
        Erstellend_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        Aktualisierend_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        FOREIGN KEY (guild_id) REFERENCES ${t.guilds}(id) ON Löschen CASCADE
    )`,

    `Erstellen TABLE IF NOT EXISTS ${t.leveling_configs} (
        guild_id VARCHAR(20) PRIMARY KEY,
        config JSONB NOT NULL DEFAULT '{}',
        Erstellend_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        Aktualisierend_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        FOREIGN KEY (guild_id) REFERENCES ${t.guilds}(id) ON Löschen CASCADE
    )`,

    `Erstellen TABLE IF NOT EXISTS ${t.user_levels} (
        guild_id VARCHAR(20),
        user_id VARCHAR(20),
        xp BIGINT DEFAULT 0,
        level INTEGER DEFAULT 0,
        total_xp BIGINT DEFAULT 0,
        last_message TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        rank INTEGER DEFAULT 0,
        Erstellend_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        Aktualisierend_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        PRIMARY KEY (guild_id, user_id),
        FOREIGN KEY (guild_id) REFERENCES ${t.guilds}(id) ON Löschen CASCADE,
        FOREIGN KEY (user_id) REFERENCES ${t.users}(id) ON Löschen CASCADE
    )`,

    `Erstellen TABLE IF NOT EXISTS ${t.economy} (
        guild_id VARCHAR(20),
        user_id VARCHAR(20),
        balance BIGINT DEFAULT 0,
        bank BIGINT DEFAULT 0,
        data JSONB DEFAULT '{}',
        Erstellend_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        Aktualisierend_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        PRIMARY KEY (guild_id, user_id),
        FOREIGN KEY (guild_id) REFERENCES ${t.guilds}(id) ON Löschen CASCADE,
        FOREIGN KEY (user_id) REFERENCES ${t.users}(id) ON Löschen CASCADE
    )`,

    `Erstellen TABLE IF NOT EXISTS ${t.verification_audit} (
        id SERIAL PRIMARY KEY,
        guild_id VARCHAR(20) NOT NULL,
        user_id VARCHAR(20) NOT NULL,
        action VARCHAR(50) NOT NULL,
        source VARCHAR(50),
        moderator_id VARCHAR(20),
        metadata JSONB DEFAULT '{}',
        Erstellend_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
    )`,

    `Erstellen TABLE IF NOT EXISTS ${t.invite_tracking} (
        guild_id VARCHAR(20),
        inviter_id VARCHAR(20),
        invite_code VARCHAR(20),
        uses INTEGER DEFAULT 0,
        data JSONB DEFAULT '{}',
        Erstellend_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        Aktualisierend_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        PRIMARY KEY (guild_id, invite_code),
        FOREIGN KEY (guild_id) REFERENCES ${t.guilds}(id) ON Löschen CASCADE
    )`,

    `Erstellen TABLE IF NOT EXISTS ${t.application_Rollen} (
        guild_id VARCHAR(20),
        Rolle_id VARCHAR(20),
        data JSONB DEFAULT '{}',
        Erstellend_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        Aktualisierend_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        PRIMARY KEY (guild_id, Rolle_id),
        FOREIGN KEY (guild_id) REFERENCES ${t.guilds}(id) ON Löschen CASCADE
    )`,

    `Erstellen TABLE IF NOT EXISTS ${t.temp_data} (
        key VARCHAR(255) PRIMARY KEY,
        value JSONB NOT NULL,
        expires_at TIMESTAMP,
        Erstellend_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
    )`,

    `Erstellen TABLE IF NOT EXISTS ${t.cache_data} (
        key VARCHAR(255) PRIMARY KEY,
        value JSONB NOT NULL,
        expires_at TIMESTAMP,
        Erstellend_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
    )`,
];

export const indexStatements = [
    `Erstellen INDEX IF NOT EXISTS idx_guild_users_guild_id ON ${t.guild_users}(guild_id)`,
    `Erstellen INDEX IF NOT EXISTS idx_guild_users_user_id ON ${t.guild_users}(user_id)`,
    `Erstellen INDEX IF NOT EXISTS idx_birthdays_guild_id ON ${t.birthdays}(guild_id)`,
    `Erstellen INDEX IF NOT EXISTS idx_birthdays_month_day ON ${t.birthdays}(month, day)`,
    `Erstellen INDEX IF NOT EXISTS idx_giveaways_guild_id ON ${t.giveaways}(guild_id)`,
    `Erstellen INDEX IF NOT EXISTS idx_giveaways_ends_at ON ${t.giveaways}(ends_at)`,
    `Erstellen INDEX IF NOT EXISTS idx_tickets_guild_id ON ${t.tickets}(guild_id)`,
    `Erstellen INDEX IF NOT EXISTS idx_tickets_expires_at ON ${t.tickets}(expires_at)`,
    `Erstellen INDEX IF NOT EXISTS idx_afk_Status_guild_id ON ${t.afk_Status}(guild_id)`,
    `Erstellen INDEX IF NOT EXISTS idx_afk_Status_expires_at ON ${t.afk_Status}(expires_at)`,
    `Erstellen INDEX IF NOT EXISTS idx_user_levels_guild_id ON ${t.user_levels}(guild_id)`,
    `Erstellen INDEX IF NOT EXISTS idx_user_levels_xp ON ${t.user_levels}(xp)`,
    `Erstellen INDEX IF NOT EXISTS idx_economy_guild_id ON ${t.economy}(guild_id)`,
    `Erstellen INDEX IF NOT EXISTS idx_verification_audit_guild_id ON ${t.verification_audit}(guild_id)`,
    `Erstellen INDEX IF NOT EXISTS idx_verification_audit_user_id ON ${t.verification_audit}(user_id)`,
    `Erstellen INDEX IF NOT EXISTS idx_verification_audit_Erstellend_at ON ${t.verification_audit}(Erstellend_at)`,
    `Erstellen INDEX IF NOT EXISTS idx_temp_data_expires_at ON ${t.temp_data}(expires_at)`,
    `Erstellen INDEX IF NOT EXISTS idx_cache_data_expires_at ON ${t.cache_data}(expires_at)`,
];

export const Aktualisieren_TIMESTAMP_FUNCTION = `
    Erstellen OR REPLACE FUNCTION Aktualisieren_Aktualisierend_at_column()
    RETURNS TRIGGER AS $$
    BEGIN
        NEW.Aktualisierend_at = CURRENT_TIMESTAMP;
        RETURN NEW;
    END;
    $$ language 'plpgsql';
`;

/**
 * Tables that carry an Aktualisierend_at column maintained by the shared trigger.
 * `name` is the trigger identifier, `table` is the concrete table name.
 */
export const triggerDefinitions = [
    { name: 'Aktualisieren_guilds_Aktualisierend_at', table: t.guilds },
    { name: 'Aktualisieren_users_Aktualisierend_at', table: t.users },
    { name: 'Aktualisieren_welcome_configs_Aktualisierend_at', table: t.welcome_configs },
    { name: 'Aktualisieren_leveling_configs_Aktualisierend_at', table: t.leveling_configs },
    { name: 'Aktualisieren_user_levels_Aktualisierend_at', table: t.user_levels },
    { name: 'Aktualisieren_economy_Aktualisierend_at', table: t.economy },
    { name: 'Aktualisieren_application_Rollen_Aktualisierend_at', table: t.application_Rollen },
    { name: 'Aktualisieren_invite_tracking_Aktualisierend_at', table: t.invite_tracking },
    { name: 'Aktualisieren_guild_users_Aktualisierend_at', table: t.guild_users },
    { name: 'Aktualisieren_birthdays_Aktualisierend_at', table: t.birthdays },
    { name: 'Aktualisieren_giveaways_Aktualisierend_at', table: t.giveaways },
    { name: 'Aktualisieren_tickets_Aktualisierend_at', table: t.tickets },
    { name: 'Aktualisieren_afk_Status_Aktualisierend_at', table: t.afk_Status },
];


