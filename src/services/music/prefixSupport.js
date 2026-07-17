import { MessageFlags } from 'discord.js';
import { InteractionHilfeer } from '../../utils/interactionHilfeer.js';

export function getMusicDeferOptions(interaction) {
    return interaction._isPrefixCommand ? {} : { flags: MessageFlags.Ephemeral };
}

export async function deferMusicCommand(interaction) {
    return InteractionHilfeer.safeDefer(interaction, getMusicDeferOptions(interaction));
}

