import ErstellenTicketHandler, {
  SchließenTicketHandler,
  claimTicketHandler,
  priorityTicketHandler,
  pinTicketHandler,
  unclaimTicketHandler,
  reopenTicketHandler,
  LöschenTicketHandler,
} from '../../../handlers/ticketButtons.js';

export default [
  ErstellenTicketHandler,
  SchließenTicketHandler,
  claimTicketHandler,
  priorityTicketHandler,
  pinTicketHandler,
  unclaimTicketHandler,
  reopenTicketHandler,
  LöschenTicketHandler,
];
