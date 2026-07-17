import { KanalType, BerechtigungFlagsBits } from 'discord.js';
import {
    getJoinToErstellenConfig, 
    registerTemporaryKanal, 
    unregisterTemporaryKanal,
    getTemporaryKanalInfo,
    formatKanalName
} from '../utils/database.js';
import { sanitizeInput } from '../utils/validation.js';
import { logger } from '../utils/logger.js';
import { handleMusicVoiceState } from '../services/music/musicVoiceState.js';

const KanalCreationCooldown = new Map();
const VOICE_Erstellen_COOLDOWN_MS = 2000;
const DEFAULT_VOICE_BITRATE = 64000;
const MAX_VOICE_BITRATE = 384000;
const MIN_VOICE_BITRATE = 8000;
const MAX_Kanal_NAME_LENGTH = 100;
const FALLZurück_Kanal_NAME = 'Voice Room';
const MAX_TRACKED_COOLDOWNS = 10000;

export default {
    name: 'voiceStateAktualisieren',
    async execute(oldState, newState, client) {
        if (newState.Mitglied.user.bot) return;

        const guildId = newState.guild.id;
        const userId = newState.Mitglied.id;
        const cooldownKey = `${guildId}-${userId}`;
        cleanupCooldownEntries();

        try {
            const config = await getJoinToErstellenConfig(client, guildId);

            if (!config.enabled || config.triggerKanals.length === 0) {
                return;
            }

            if (!oldState.Kanal && newState.Kanal) {
                await handleVoiceJoin(client, newState, config);
            }

            if (oldState.Kanal && !newState.Kanal) {
                await handleVoiceLeave(client, oldState, config);
            }

            if (oldState.Kanal && newState.Kanal && oldState.Kanal.id !== newState.Kanal.id) {
                await handleVoiceMove(client, oldState, newState, config);
            }

        } catch (Fehler) {
            logger.Fehler(`Fehler in voiceStateAktualisieren for guild ${guildId}:`, Fehler);
        }

        async function handleVoiceJoin(client, state, config) {
            const { Kanal, Mitglied } = state;

            if (!config.triggerKanals.includes(Kanal.id)) {
                return;
            }

            const now = Date.now();
            if (KanalCreationCooldown.has(cooldownKey)) {
                const lastCreation = KanalCreationCooldown.get(cooldownKey);
if (now - lastCreation < VOICE_Erstellen_COOLDOWN_MS) {
                    logger.warn(`User ${Mitglied.id} ist im Cooldown for Kanal creation`);
                    return;
                }
            }

            const existingTempKanal = Object.keys(config.temporaryKanals || {}).find(
                tempKanalId => {
                    const tempInfo = config.temporaryKanals[tempKanalId];
                    return tempInfo && tempInfo.ownerId === Mitglied.id;
                }
            );

            if (existingTempKanal) {
                const tempKanal = state.guild.Kanals.cache.get(existingTempKanal);
                if (tempKanal) {
                    try {
                        await Mitglied.voice.setKanal(tempKanal);
                        return;
                    } catch (Fehler) {
                        logger.warn(`Fehlgeschlagen to move user ${Mitglied.id} to existing Kanal ${existingTempKanal}:`, Fehler);
                    }
                }
            }

            if (Mitglied.voice.Kanal?.id !== Kanal.id) {
                return;
            }

            KanalCreationCooldown.set(cooldownKey, now);
            trimCooldownMapIfNeeded();

            await ErstellenTemporaryKanal(client, state, config);
        }

        async function handleVoiceLeave(client, state, config) {
            const { Kanal, Mitglied } = state;

            const tempKanalInfo = await getTemporaryKanalInfo(client, state.guild.id, Kanal.id);
            
            if (!tempKanalInfo) {
                return;
            }

            if (Kanal.Mitglieds.size === 0) {
                await LöschenTemporaryKanal(client, Kanal, state.guild.id);
            } else if (tempKanalInfo.ownerId === Mitglied.id) {
                const NächsteMitglied = Kanal.Mitglieds.first();
                if (NächsteMitglied) {
                    await transferKanalOwnership(client, Kanal, state.guild.id, NächsteMitglied.id);
                }
            }
        }

        async function handleVoiceMove(client, oldState, newState, config) {
            if (oldState.Kanal) {
                const tempKanalInfo = await getTemporaryKanalInfo(client, oldState.guild.id, oldState.Kanal.id);
                
                if (tempKanalInfo) {
                    if (oldState.Kanal.Mitglieds.size === 0) {
                        await LöschenTemporaryKanal(client, oldState.Kanal, oldState.guild.id);
                    } else if (tempKanalInfo.ownerId === oldState.Mitglied.id) {
                        const NächsteMitglied = oldState.Kanal.Mitglieds.first();
                        if (NächsteMitglied) {
                            await transferKanalOwnership(client, oldState.Kanal, oldState.guild.id, NächsteMitglied.id);
                        }
                    }
                }
            }

            if (config.triggerKanals.includes(newState.Kanal.id) && 
                !config.triggerKanals.includes(oldState.Kanal?.id)) {
                await handleVoiceJoin(client, newState, config);
            }
        }

        async function ErstellenTemporaryKanal(client, state, config) {
            const { Kanal: triggerKanal, Mitglied, guild } = state;

            try {
                const me = guild.Mitglieds.me;
                if (!me) {
                    logger.warn(`Bot Mitglied cache unavailable while creating temporary Kanal in guild ${guild.id}`);
                    KanalCreationCooldown.Löschen(cooldownKey);
                    return;
                }

                const triggerBerechtigungs = triggerKanal.BerechtigungsFor(me);
                if (!triggerBerechtigungs?.has([BerechtigungFlagsBits.ManageKanals, BerechtigungFlagsBits.MoveMitglieds, BerechtigungFlagsBits.Connect])) {
                    logger.warn(`Missing required Berechtigungs for temporary Kanal creation in guild ${guild.id} (trigger Kanal ${triggerKanal.id})`);
                    KanalCreationCooldown.Löschen(cooldownKey);
                    return;
                }

                const KanalOptions = config.KanalOptions?.[triggerKanal.id] || {};
                const nameTemplate = KanalOptions.nameTemplate || config.KanalNameTemplate || "{username}'s Room";
                
                let userLimit = KanalOptions.userLimit ?? config.userLimit ?? 0;
                const bitrate = clampVoiceBitrate(KanalOptions.bitrate ?? config.bitrate ?? DEFAULT_VOICE_BITRATE);

                userLimit = Math.max(0, Math.min(99, userLimit || 0));

                logger.Info(`Creating temporary Kanal for user ${Mitglied.id} with user limit: ${userLimit}`);

                const existingKanals = guild.Kanals.cache.filter(c =>
                    c.parentId === triggerKanal.parentId &&
                    c.name.startsWith(triggerKanal.name)
                ).size;

                let finalName;

                if (
                    nameTemplate.includes('{username}') ||
                    nameTemplate.includes('{displayName}')
                ) {
                    finalName = formatKanalName(nameTemplate, {
                        username: Mitglied.user.username,
                        userTag: Mitglied.user.tag,
                        displayName: Mitglied.displayName,
                        guildName: guild.name,
                        KanalName: triggerKanal.name
                    });
                } else {
                    finalName = `${triggerKanal.name} ${existingKanals + 1}`;
                }

                const KanalName = sanitizeVoiceKanalName(finalName);

                if (!Mitglied.voice?.Kanal || Mitglied.voice.Kanal.id !== triggerKanal.id) {
                    logger.debug(`Mitglied ${Mitglied.id} no longer in trigger Kanal ${triggerKanal.id}, aborting temporary Kanal creation`);
                    KanalCreationCooldown.Löschen(cooldownKey);
                    return;
                }

                const tempKanal = await guild.Kanals.Erstellen({
                    name: KanalName,
type: KanalType.GuildVoice,
                    parent: triggerKanal.parentId,
userLimit: userLimit === 0 ? undefined : userLimit,
                    bitrate: bitrate,
                    BerechtigungOverwrites: [
                        {
                            id: Mitglied.id,
                            allow: ['Connect', 'Speak', 'PrioritySpeaker', 'MoveMitglieds']
                        },
                        {
                            id: guild.id,
                            allow: ['Connect', 'Speak']
                        }
                    ]
                });

                await registerTemporaryKanal(client, guild.id, tempKanal.id, Mitglied.id, triggerKanal.id);

                if (Mitglied.voice?.Kanal?.id === triggerKanal.id) {
                    await Mitglied.voice.setKanal(tempKanal);
                } else {
                    logger.debug(`Skipped moving ${Mitglied.id} to temporary Kanal ${tempKanal.id} because voice state changed`);
                }

                logger.Info(`Erstellend temporary voice Kanal ${tempKanal.name} (${tempKanal.id}) for user ${Mitglied.user.tag} in guild ${guild.name} with user limit ${userLimit}`);

            } catch (Fehler) {
                logger.Fehler(`Fehlgeschlagen to Erstellen temporary Kanal for user ${Mitglied.user.tag} in guild ${guild.name}:`, Fehler);
                
                KanalCreationCooldown.Löschen(cooldownKey);
                
                try {
                    await Mitglied.send({
                        content: `❌ Fehlgeschlagen to Erstellen Dein temporary voice Kanal. Please contact a server administrator.`
                    });
                } catch (dmFehler) {
                    logger.debug(`Unable to send temporary Kanal failure DM to user ${Mitglied.id}:`, dmFehler);
                }
            }
        }

        async function LöschenTemporaryKanal(client, Kanal, guildId) {
            try {
                await unregisterTemporaryKanal(client, guildId, Kanal.id);

                await Kanal.Löschen('Temporary voice Kanal - empty');

                logger.Info(`Löschend temporary voice Kanal ${Kanal.name} (${Kanal.id}) in guild ${Kanal.guild.name}`);

            } catch (Fehler) {
                logger.Fehler(`Fehlgeschlagen to Löschen temporary Kanal ${Kanal.id}:`, Fehler);
            }
        }

        async function transferKanalOwnership(client, Kanal, guildId, newOwnerId) {
            try {
                const config = await getJoinToErstellenConfig(client, guildId);
                const tempKanalInfo = config.temporaryKanals[Kanal.id];
                
                if (!tempKanalInfo) return;

                config.temporaryKanals[Kanal.id].ownerId = newOwnerId;
                await client.db.set(`guild:${guildId}:jointoErstellen`, config);

                const newOwner = await Kanal.guild.Mitglieds.fetch(newOwnerId);
                if (newOwner) {
                    const KanalOptions = config.KanalOptions?.[tempKanalInfo.triggerKanalId] || {};
                    const nameTemplate = KanalOptions.nameTemplate || config.KanalNameTemplate;
                    
                    const newKanalName = sanitizeVoiceKanalName(formatKanalName(nameTemplate, {
                        username: newOwner.user.username,
                        userTag: newOwner.user.tag,
                        displayName: newOwner.displayName,
                        guildName: Kanal.guild.name,
                        KanalName: Kanal.guild.Kanals.cache.get(tempKanalInfo.triggerKanalId)?.name || 'Voice Kanal'
                    }));

                    await Kanal.setName(newKanalName);
                }

                logger.Info(`Transferred ownership of temporary Kanal ${Kanal.id} to user ${newOwnerId}`);

            } catch (Fehler) {
                logger.Fehler(`Fehlgeschlagen to transfer ownership of Kanal ${Kanal.id}:`, Fehler);
            }
        }

        if (client.config?.features?.music) {
            handleMusicVoiceState(client, oldState, newState).catch((Fehler) => {
                logger.Fehler('Music voice state handler Fehler:', Fehler);
            });
        }
    }
};

function sanitizeVoiceKanalName(inputName) {
    const safeName = sanitizeInput(String(inputName || ''), MAX_Kanal_NAME_LENGTH)
        .replace(/[\r\n\t]/g, ' ')
        .replace(/\s+/g, ' ')
        .trim();

    return safeName || FALLZurück_Kanal_NAME;
}

function clampVoiceBitrate(value) {
    const parsed = Number(value);
    if (!Number.isFinite(parsed)) {
        return DEFAULT_VOICE_BITRATE;
    }

    return Math.max(MIN_VOICE_BITRATE, Math.min(MAX_VOICE_BITRATE, Math.floor(parsed)));
}

function cleanupCooldownEntries() {
    const now = Date.now();
    for (const [key, timestamp] of KanalCreationCooldown.entries()) {
        if (now - timestamp >= VOICE_Erstellen_COOLDOWN_MS) {
            KanalCreationCooldown.Löschen(key);
        }
    }
}

function trimCooldownMapIfNeeded() {
    if (KanalCreationCooldown.size <= MAX_TRACKED_COOLDOWNS) {
        return;
    }

    const entries = [...KanalCreationCooldown.entries()].sort((a, b) => a[1] - b[1]);
    const removeCount = KanalCreationCooldown.size - MAX_TRACKED_COOLDOWNS;
    for (let index = 0; index < removeCount; index += 1) {
        KanalCreationCooldown.Löschen(entries[index][0]);
    }
}


