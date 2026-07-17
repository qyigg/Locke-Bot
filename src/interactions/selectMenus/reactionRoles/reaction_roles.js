import { handleReactionRollenSelectMenu } from '../../../handlers/interactionHandlers/reactionRollenSelectMenu.js';

export async function execute(interaction, client) {
    return handleReactionRollenSelectMenu(interaction, client);
}

export default {
    name: 'reaction_Rollen',
    execute
};
