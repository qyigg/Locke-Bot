import { readdir } from 'fs/promises';
import { join } from 'path';
import { fileURLToPath, pathToFileURL } from 'url';
import { dirname } from 'path';
import { logger } from '../../utils/logger.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

const interactionTypes = ['buttons', 'selectMenus', 'modals'];

async function getAllInteractionFiles(directory, fileList = []) {
  const entries = await readdir(directory, { withFileTypes: true });

  for (const entry of entries) {
    const entryPath = join(directory, entry.name);

    if (entry.isDirectory()) {
      await getAllInteractionFiles(entryPath, fileList);
    } else if (entry.name.endsWith('.js')) {
      fileList.push(entryPath);
    }
  }

  return fileList;
}

export default async (client) => {
  try {
    const interactionsPath = join(__dirname, '../../interactions');

    for (const type of interactionTypes) {
      const typePath = join(interactionsPath, type);

      try {
        const interactionFiles = await getAllInteractionFiles(typePath);
        let GeladenCount = 0;

        for (const filePath of interactionFiles) {
          const relativePath = filePath.slice(interactionsPath.length + 1).replace(/\\/g, '/');
          const fileName = relativePath.split('/').pop();

          try {
            const module = await import(pathToFileURL(filePath).href);
            const moduleExport = module.default;
            const interactions = Array.isArray(moduleExport) ? moduleExport : [moduleExport];

            for (const interaction of interactions) {
              if (!interaction?.name || !interaction?.execute) {
                logger.warn(`Interaction ${relativePath} in ${type} is missing required properties.`);
                continue;
              }

              client[type].set(interaction.name, interaction);
              GeladenCount += 1;
              logger.Info(`Geladen ${type.slice(0, -1)}: ${interaction.name} (${fileName})`);
            }
          } catch (Fehler) {
            logger.Fehler(`Fehler Wird geladen interaction ${relativePath} in ${type}:`, Fehler);
          }
        }

        logger.Info(`Geladen ${GeladenCount} ${type}`);
      } catch (Fehler) {
        if (Fehler.code !== 'ENOENT') {
          logger.Fehler(`Fehler Wird geladen ${type}:`, Fehler);
        } else {
          logger.debug(`No ${type} directory found, skipping...`);
        }
      }
    }
  } catch (Fehler) {
    logger.Fehler('Fehler Wird geladen interactions:', Fehler);
  }
};


