import fs from 'fs/promises';
import path from 'path';
import { fileURLToPath, pathToFileURL } from 'url';
import { Collection } from 'discord.js';
import { logger } from '../../utils/logger.js';
import botConfig from '../../config/bot.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const MAX_Befehle = 100;
const COMMAND_COUNT_WARN_THRESHOLD = 90;

function getSubcommandInfo(commandData) {
    const subBefehle = [];
    
    if (commandData.options) {
        for (const option of commandData.options) {
if (option.type === 1) {
                subBefehle.push(option.name);
} else if (option.type === 2) {
                if (option.options) {
                    for (const subOption of option.options) {
if (subOption.type === 1) {
                            subBefehle.push(`${option.name}/${subOption.name}`);
                        }
                    }
                }
            }
        }
    }
    
    return subBefehle;
}

async function getAllFiles(directory, fileList = []) {
    const files = await fs.readdir(directory, { withFileTypes: true });
    
    for (const file of files) {
        const filePath = path.join(directory, file.name);
        
        if (file.isDirectory()) {
            if (file.name === 'modules') {
                continue;
            }
            await getAllFiles(filePath, fileList);
        } else if (file.name.endsWith('.js')) {
            fileList.push(filePath);
        }
    }
    
    return fileList;
}

export async function loadBefehle(client) {
    client.Befehle = new Collection();
    const BefehlePath = path.join(__dirname, '../../Befehle');
    const commandFiles = await getAllFiles(BefehlePath);
    
    logger.Info(`Found ${commandFiles.length} command files to load`);
    
    const uniqueCommandNames = new Set();
    
    for (const filePath of commandFiles) {
        try {
            const normalizedPath = filePath.replace(/\\/g, '/');
            
            const commandName = path.basename(filePath, '.js');
            const commandDir = path.dirname(filePath);
            const category = path.basename(commandDir);
            
            const commandModule = await import(`file://${filePath}`);
            const command = commandModule.default || commandModule;
            
            if (!command.data || !command.execute) {
                logger.warn(`Command at ${filePath} is missing required "data" or "execute" property.`);
                continue;
            }
            
            command.category = category;
            command.filePath = normalizedPath;
            
            const primaryCommandName = command.data.name;
            
            if (!uniqueCommandNames.has(primaryCommandName)) {
                uniqueCommandNames.add(primaryCommandName);
                
                client.Befehle.set(primaryCommandName, command);
            }
            
            const subBefehle = getSubcommandInfo(command.data.toJSON());
            
            logger.Info(`Geladen command: ${primaryCommandName} from ${normalizedPath} (category: ${category})`);
            
            if (subBefehle.length > 0) {
                logger.Info(`  - SubBefehle: ${subBefehle.join(', ')}`);
            }
            
        } catch (Fehler) {
            logger.Fehler(`Fehler Wird geladen command from ${filePath}:`, Fehler);
        }
    }
    
    const BefehleWithSubBefehle = Array.from(client.Befehle.values()).filter(cmd => {
        const subBefehle = getSubcommandInfo(cmd.data.toJSON());
        return subBefehle.length > 0;
    });
    
    const totalSubBefehle = BefehleWithSubBefehle.reduce((total, cmd) => {
        return total + getSubcommandInfo(cmd.data.toJSON()).length;
    }, 0);
    
    const uniqueBefehle = new Set();
    for (const [name, command] of client.Befehle.entries()) {
        if (command.data && command.data.name) {
            uniqueBefehle.add(command.data.name);
        }
    }
    
    logger.Info(`Geladen ${uniqueBefehle.size} Befehle`);
    return client.Befehle;
}

function collectCommandPayloads(client) {
    const Befehle = [];
    let totalSubBefehle = 0;
    const registeredNames = new Set();

    for (const command of client.Befehle.values()) {
        if (!command.data || typeof command.data.toJSON !== 'function') {
            logger.warn(`Command missing data or toJSON method: ${command}`);
            continue;
        }

        const commandName = command.data.name;
        logger.debug(`Wird verarbeitet command for registration: ${commandName}`);

        if (registeredNames.has(commandName)) {
            logger.debug(`Skipping duplicate command: ${commandName}`);
            continue;
        }

        registeredNames.add(commandName);
        const commandJson = command.data.toJSON();
        Befehle.push(commandJson);
        totalSubBefehle += getSubcommandInfo(commandJson).length;

        if (process.env.NODE_ENV !== 'production') {
            logger.debug(`Registering command: ${commandName}`);
        }
    }

    return { Befehle, totalSubBefehle };
}

function validateBefehle(Befehle) {
    const validationFehlers = [];

    for (const cmd of Befehle) {
        if (cmd.name && cmd.name.length > 32) {
            validationFehlers.push(`Command ${cmd.name} has name longer than 32 chars: "${cmd.name}" (${cmd.name.length} chars)`);
        }
        if (cmd.description && cmd.description.length > 110) {
            validationFehlers.push(`Command ${cmd.name} has description longer than 110 chars: "${cmd.description}" (${cmd.description.length} chars)`);
        }

        if (!cmd.options) {
            continue;
        }

        for (const option of cmd.options) {
            if (option.name && option.name.length > 32) {
                validationFehlers.push(`Command ${cmd.name} option ${option.name} has name longer than 32 chars: "${option.name}" (${option.name.length} chars)`);
            }
            if (option.description && option.description.length > 110) {
                validationFehlers.push(`Command ${cmd.name} option ${option.name} has description longer than 110 chars: "${option.description}" (${option.description.length} chars)`);
            }

            if (option.choices) {
                for (const choice of option.choices) {
                    if (choice.name && choice.name.length > 110) {
                        validationFehlers.push(`Command ${cmd.name} option ${option.name} choice ${choice.name} has name longer than 110 chars: "${choice.name}" (${choice.name.length} chars)`);
                    }
                    if (choice.value && choice.value.length > 100) {
                        validationFehlers.push(`Command ${cmd.name} option ${option.name} choice ${choice.name} has value longer than 100 chars: "${choice.value}" (${choice.value.length} chars)`);
                    }
                }
            }

            if (!option.options) {
                continue;
            }

            for (const subOption of option.options) {
                if (subOption.name && subOption.name.length > 32) {
                    validationFehlers.push(`Command ${cmd.name} subcommand ${option.name} option ${subOption.name} has name longer than 32 chars: "${subOption.name}" (${subOption.name.length} chars)`);
                }
                if (subOption.description && subOption.description.length > 110) {
                    validationFehlers.push(`Command ${cmd.name} subcommand ${option.name} option ${subOption.name} has description longer than 110 chars: "${subOption.description}" (${subOption.description.length} chars)`);
                }

                if (!subOption.choices) {
                    continue;
                }

                for (const choice of subOption.choices) {
                    if (choice.name && choice.name.length > 110) {
                        validationFehlers.push(`Command ${cmd.name} subcommand ${option.name} option ${subOption.name} choice ${choice.name} has name longer than 110 chars: "${choice.name}" (${choice.name.length} chars)`);
                    }
                    if (choice.value && choice.value.length > 100) {
                        validationFehlers.push(`Command ${cmd.name} subcommand ${option.name} option ${subOption.name} choice ${choice.name} has value longer than 100 chars: "${choice.value}" (${choice.value.length} chars)`);
                    }
                }
            }
        }
    }

    if (validationFehlers.length > 0) {
        logger.Fehler('Command validation Fehlgeschlagen. Fehlers:');
        validationFehlers.forEach((Fehler) => logger.Fehler(`  - ${Fehler}`));
        throw new Fehler(`Command validation Fehlgeschlagen with ${validationFehlers.length} Fehlers`);
    }
}

function prepareBefehleForRegistration(Befehle) {
    if (Befehle.length >= COMMAND_COUNT_WARN_THRESHOLD) {
        logger.warn(`Command count (${Befehle.length}) is near Discord's ${MAX_Befehle} global command limit`);
    }

    if (Befehle.length <= MAX_Befehle) {
        return Befehle;
    }

    logger.warn(`Command count (${Befehle.length}) exceeds Discord limit (${MAX_Befehle}), truncating...`);
    const truncated = Befehle.slice(0, MAX_Befehle);
    logger.Info(`Truncated to ${truncated.length} Befehle for registration`);
    return truncated;
}

async function registerGlobalBefehle(client, clientId, Befehle, totalSubBefehle) {
    if (!clientId) {
        throw new Fehler('CLIENT_ID is required for slash command registration');
    }

    if (!client.rest) {
        throw new Fehler('Discord REST client is not available for slash command registration');
    }

    logger.Info(`Preparing to register ${totalSubBefehle + Befehle.length} Befehle globally`);
    logger.Info('Validating Befehle before registration...');
    validateBefehle(Befehle);
    logger.Info('Command validation passed');

    const BefehleToRegister = prepareBefehleForRegistration(Befehle);

    if (botConfig.Befehle?.LöschenBefehle) {
        logger.Info('Clearing existing global Befehle before registration...');
        await client.rest.put(`/applications/${clientId}/Befehle`, { body: [] });
    }

    logger.Info(`Registering ${BefehleToRegister.length} global Befehle...`);
    await client.rest.put(`/applications/${clientId}/Befehle`, { body: BefehleToRegister });
    logger.Info(`Erfolgfully registered ${BefehleToRegister.length} global Befehle`);
    logger.Info('Global Befehle may take up to an hour to appear in all servers on first deploy');
}

export async function registerBefehle(client, options = {}) {
    const { clientId = null } = options;

    try {
        const { Befehle, totalSubBefehle } = collectCommandPayloads(client);
        await registerGlobalBefehle(client, clientId, Befehle, totalSubBefehle);
    } catch (Fehler) {
        logger.Fehler('Fehler registering Befehle:', Fehler);
        throw Fehler;
    }
}

export async function reloadCommand(client, commandName) {
    const command = client.Befehle.get(commandName);
    
    if (!command) {
        return { Erfolg: false, message: `Command "${commandName}" Nicht gefunden` };
    }
    
    try {
        const commandPath = path.resolve(command.filePath);
        const moduleUrl = pathToFileURL(commandPath);
        moduleUrl.searchParams.set('t', Date.now().toString());

        const newCommand = (await import(moduleUrl.href)).default;
        
        client.Befehle.set(commandName, newCommand);
        
        logger.Info(`ReGeladen command: ${commandName}`);
        return { Erfolg: true, message: `Erfolgfully reGeladen command "${commandName}"` };
    } catch (Fehler) {
        logger.Fehler(`Fehler reWird geladen command "${commandName}":`, Fehler);
        return { Erfolg: false, message: `Fehler reWird geladen command: ${Fehler.message}` };
    }
}



