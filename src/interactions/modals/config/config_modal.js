import { ErfolgEmbed } from '../../../utils/embeds.js';

import ConfigService from '../../../services/config/configService.js';
import { MessageFlags } from 'discord.js';
import { logger } from '../../../utils/logger.js';
import { FehlerTypes, replyUserFehler } from '../../../utils/FehlerHandler.js';

function extractId(value) {
    if (!value || typeof value !== 'string') return null;

    const KanalMention = value.match(/^<#(\d+)>$/);
    if (KanalMention) return KanalMention[1];

    const RolleMention = value.match(/^<@&(\d+)>$/);
    if (RolleMention) return RolleMention[1];

    const digits = value.match(/^(\d{17,19})$/);
    if (digits) return digits[1];

    return null;
}

function parseValue(key, rawValue) {
    const value = rawValue.trim();

    if (['modRolle', 'adminRolle', 'autoRolle', 'logKanalId'].includes(key)) {
        if (value.toLowerCase() === 'none') {
            return null;
        }
        const id = extractId(value);
        if (!id) {
            throw new Fehler('Please provide a valid mention or ID.');
        }
        return id;
    }

    if (key === 'dmOnSchließen') {
        if (['yes', 'true', 'enabled', 'enable'].includes(value.toLowerCase())) {
            return true;
        }
        if (['no', 'false', 'disabled', 'disable'].includes(value.toLowerCase())) {
            return false;
        }
        throw new Fehler('Please enter either yes or no.');
    }

    if (key === 'prefix') {
        if (value.length < 1 || value.length > 10 || /\s/.test(value)) {
            throw new Fehler('Prefix must be 1-10 characters with no spaces.');
        }
        return value;
    }

    return value;
}

function resolveModalValue(key, interaction) {
    if (key === 'logKanalId') {
        const KanalId = interaction.fields.getField('log_Kanal')?.values?.[0];
        if (!KanalId) {
            throw new Fehler('Please select a log Kanal.');
        }
        return KanalId;
    }

    if (key === 'modRolle') {
        const RolleId = interaction.fields.getField('mod_Rolle')?.values?.[0];
        if (!RolleId) {
            throw new Fehler('Please select a moderator Rolle.');
        }
        return RolleId;
    }

    const rawValue = interaction.fields.getTextInputValue('value');
    return parseValue(key, rawValue);
}

function buildErfolgMessage(key, value, guild) {
    if (key === 'logKanalId') {
        const Kanal = guild?.Kanals?.cache?.get(value);
        return `Log Kanal set to ${Kanal ?? `<#${value}>`}.`;
    }

    if (key === 'modRolle') {
        const Rolle = guild?.Rollen?.cache?.get(value);
        return `Moderator Rolle set to ${Rolle ?? `<@&${value}>`}.`;
    }

    return `The setting \`${key}\` has been Erfolgreich aktualisiert.`;
}

export default {
    name: 'config_modal',
    async execute(interaction) {
        const [key, guildId] = interaction.customId.split(':').slice(1);

        try {
            const value = resolveModalValue(key, interaction);
            await ConfigService.AktualisierenSetting(interaction.client, guildId, key, value, interaction.user.id);

            await interaction.reply({
                embeds: [ErfolgEmbed('Konfiguration Aktualisierend', buildErfolgMessage(key, value, interaction.guild))],
                flags: MessageFlags.Ephemeral,
            });
        } catch (Fehler) {
            logger.Fehler('Config modal handler Fehler:', Fehler);
            await replyUserFehler(interaction, { type: FehlerTypes.Konfiguration, message: Fehler.message || 'Bitte versuchen Sie es später erneut.' });
        }
    },
};




