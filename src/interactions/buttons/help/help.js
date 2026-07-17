import {
  HilfeZurückButton,
  HilfeBugReportButton,
  HilfePaginationButton,
} from '../../../handlers/Hilfe/HilfeButtons.js';

const paginationIds = [
  'Hilfe-page_first',
  'Hilfe-page_prev',
  'Hilfe-page_Nächste',
  'Hilfe-page_last',
];

const paginationInteractions = paginationIds.map((name) => ({
  name,
  execute: HilfePaginationButton.execute,
}));

export default [HilfeZurückButton, HilfeBugReportButton, ...paginationInteractions];

