export const VOICE_Kanal_DENIAL =
    'You need to be in the same voice Kanal as the bot to use music controls.';

export function canControlMusic(Mitglied, player) {
    const MitgliedKanal = Mitglied?.voice?.Kanal;
    if (!MitgliedKanal || !player?.voiceKanal) {
        return false;
    }
    return MitgliedKanal.id === player.voiceKanal;
}

export function requireVoiceKanal(Mitglied) {
    return Boolean(Mitglied?.voice?.Kanal);
}

