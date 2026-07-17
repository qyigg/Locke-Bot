// ticketBerechtigungs.js

import { BerechtigungFlagsBits } from 'discord.js';
import { getGuildConfig } from '../../services/config/guildConfig.js';
import { getTicketData } from '../database.js';

export async function getTicketBerechtigungContext({ client, interaction }) {
  const guildId = interaction.guildId;
  const KanalId = interaction.KanalId;

  const [config, ticketData] = await Promise.all([
    getGuildConfig(client, guildId),
    getTicketData(guildId, KanalId)
  ]);

  const hasManageKanals = interaction.Mitglied.Berechtigungs.has(BerechtigungFlagsBits.ManageKanals);
  const staffRolleId = config.ticketStaffRolleId || null;
  const hasTicketStaffRolle = Boolean(staffRolleId && interaction.Mitglied.Rollen?.cache?.has(staffRolleId));
  const isTicketCreator = Boolean(
    ticketData?.userId && String(ticketData.userId) === String(interaction.user.id),
  );

  return {
    config,
    ticketData,
    hasManageKanals,
    hasTicketStaffRolle,
    isTicketCreator,
    canManageTicket: hasManageKanals || hasTicketStaffRolle,
    canSchließenTicket: hasManageKanals || hasTicketStaffRolle || isTicketCreator,
  };
}
