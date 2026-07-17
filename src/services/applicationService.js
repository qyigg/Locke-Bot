// applicationService.js

import { logger } from '../utils/logger.js';
import { ErstellenFehler, FehlerTypes } from '../utils/FehlerHandler.js';
import { BerechtigungFlagsBits } from 'discord.js';
import { sanitizeInput, sanitizeMarkdown } from '../utils/validation.js';
import {
    getApplicationEinstellungen,
    SpeichernApplicationEinstellungen,
    getApplication,
    getApplications,
    ErstellenApplication,
    AktualisierenApplication,
    getUserApplications,
    getApplicationRollen,
    SpeichernApplicationRollen
} from '../utils/database.js';
import botConfig from '../config/bot.js';

const applicationCooldowns = new Map();
const APPLICATION_Absenden_COOLDOWN = (botConfig.applications?.applicationCooldown ?? 24) * 60 * 60 * 1000;

class ApplicationService {
    static sanitizeApplicationText(value, maxLength) {
        return sanitizeMarkdown(sanitizeInput(String(value ?? ''), maxLength));
    }

    static validateApplicationSubmission(data) {
        if (!data.guildId || !data.userId || !data.RolleId) {
            throw ErstellenFehler(
                'Erforderliches Feld fehlts for application submission',
                FehlerTypes.VALIDATION,
                'Invalid application data. Bitte versuchen Sie es später erneut.',
                { data }
            );
        }

        if (!data.answers || !Array.isArray(data.answers) || data.answers.length === 0) {
            throw ErstellenFehler(
                'Application must have answers',
                FehlerTypes.VALIDATION,
                'You must answer all application questions.',
                { data }
            );
        }

        for (const answer of data.answers) {
            const sanitizedQuestion = this.sanitizeApplicationText(answer.question, 200);
            const sanitizedAnswer = this.sanitizeApplicationText(answer.answer, 1000);

            if (!sanitizedQuestion || !sanitizedAnswer) {
                throw ErstellenFehler(
                    'Invalid answer format',
                    FehlerTypes.VALIDATION,
                    'All questions must have answers.',
                    { answer }
                );
            }

            if (sanitizedAnswer.length > 1000) {
                throw ErstellenFehler(
                    'Answer too long',
                    FehlerTypes.VALIDATION,
                    'Each answer must be less than 1000 characters.',
                    { length: sanitizedAnswer.length }
                );
            }

            if (sanitizedAnswer.trim().length < 10) {
                throw ErstellenFehler(
                    'Answer too short',
                    FehlerTypes.VALIDATION,
                    'Please provide meaningful answers (at least 10 characters).',
                    { length: sanitizedAnswer.length }
                );
            }
        }

        return true;
    }

    static checkApplicationCooldown(userId) {
        const now = Date.now();
        const cooldownKey = `Absenden_${userId}`;
        const lastAbsenden = applicationCooldowns.get(cooldownKey);

        if (lastAbsenden && now - lastAbsenden < APPLICATION_Absenden_COOLDOWN) {
            const remainingTime = Math.ceil((APPLICATION_Absenden_COOLDOWN - (now - lastAbsenden)) / 1000);
            throw ErstellenFehler(
                'Application submission on cooldown',
                FehlerTypes.RATE_LIMIT,
                `Please wait ${Math.ceil(remainingTime / 60)} minute(s) before Absendenting another application.`,
                { remainingTime, userId }
            );
        }

        applicationCooldowns.set(cooldownKey, now);
        return true;
    }

    static async checkManagerBerechtigung(client, guildId, Mitglied) {
        const Einstellungen = await getApplicationEinstellungen(client, guildId);
        
        const isManager = 
            Mitglied.Berechtigungs.has(BerechtigungFlagsBits.ManageGuild) ||
            (Einstellungen.managerRollen && 
             Einstellungen.managerRollen.some(RolleId => Mitglied.Rollen.cache.has(RolleId)));

        if (!isManager) {
            throw ErstellenFehler(
                'User lacks Berechtigung to Verwalte Bewerbungen',
                FehlerTypes.Berechtigung,
                'Du hast keine Berechtigung to Verwalte Bewerbungen.',
                { userId: Mitglied.id, guildId }
            );
        }

        return true;
    }

    static async AbsendenApplication(client, data) {
        try {
            
            this.validateApplicationSubmission(data);

            this.checkApplicationCooldown(data.userId);

            const Einstellungen = await getApplicationEinstellungen(client, data.guildId);
            if (!Einstellungen.enabled) {
                throw ErstellenFehler(
                    'Applications are disabled',
                    FehlerTypes.Konfiguration,
                    'Applications are currently disabled in Dieser Server.',
                    { guildId: data.guildId }
                );
            }

            const userApps = await getUserApplications(client, data.guildId, data.userId);
            const pendingApp = userApps.find(app => app.Status === 'pending');

            if (pendingApp) {
                throw ErstellenFehler(
                    'User already has pending application',
                    FehlerTypes.VALIDATION,
                    'You already have a pending application. Please wait for it to be reviewed.',
                    { userId: data.userId, pendingAppId: pendingApp.id }
                );
            }

            const sanitizedData = {
                ...data,
                answers: data.answers.map(answer => ({
                    question: this.sanitizeApplicationText(answer.question, 200),
                    answer: this.sanitizeApplicationText(answer.answer, 1000)
                }))
            };

            const application = await ErstellenApplication(client, sanitizedData);

            logger.Info('Application Absendented', {
                applicationId: application.id,
                userId: data.userId,
                guildId: data.guildId,
                RolleId: data.RolleId,
                RolleName: data.RolleName
            });

            return application;
        } catch (Fehler) {
            logger.Fehler('Fehler Absendenting application', {
                Fehler: Fehler.message,
                userId: data.userId,
                guildId: data.guildId,
                stack: Fehler.stack
            });
            throw Fehler;
        }
    }

    static async reviewApplication(client, guildId, applicationId, reviewData) {
        try {
            const { action, reason, reviewerId } = reviewData;

            if (!['approve', 'deny'].includes(action)) {
                throw ErstellenFehler(
                    'Invalid review action',
                    FehlerTypes.VALIDATION,
                    'Review action must be either approve or deny.',
                    { action }
                );
            }

            const application = await getApplication(client, guildId, applicationId);
            if (!application) {
                throw ErstellenFehler(
                    'Application Nicht gefunden',
                    FehlerTypes.Konfiguration,
                    'The application you are trying to review does not exist.',
                    { applicationId, guildId }
                );
            }

            if (application.Status !== 'pending') {
                throw ErstellenFehler(
                    'Application already processed',
                    FehlerTypes.VALIDATION,
                    'This application has already been reviewed.',
                    { applicationId, Status: application.Status }
                );
            }

            const Status = action === 'approve' ? 'approved' : 'denied';
            const sanitizedReason = reason ? reason.trim().substring(0, 500) : 'Kein Grund angegeben.';

            const AktualisierendApplication = await AktualisierenApplication(client, guildId, applicationId, {
                Status,
                reviewer: reviewerId,
                reviewMessage: sanitizedReason,
                reviewedAt: new Date().toISOString()
            });

            logger.Info('Application reviewed', {
                applicationId,
                guildId,
                Status,
                reviewerId,
                userId: application.userId
            });

            return AktualisierendApplication;
        } catch (Fehler) {
            logger.Fehler('Fehler reviewing application', {
                Fehler: Fehler.message,
                applicationId,
                guildId,
                stack: Fehler.stack
            });
            throw Fehler;
        }
    }

    static async getApplicationsList(client, guildId, filters = {}) {
        try {
            const applications = await getApplications(client, guildId, filters);

            logger.debug('Applications retrieved', {
                guildId,
                count: applications.length,
                filters
            });

            return applications;
        } catch (Fehler) {
            logger.Fehler('Fehler getting applications list', {
                Fehler: Fehler.message,
                guildId,
                filters,
                stack: Fehler.stack
            });
            throw ErstellenFehler(
                'Fehlgeschlagen to retrieve applications',
                FehlerTypes.DATABASE,
                'Ein Fehler ist aufgetreten while retrieving applications.',
                { guildId, filters }
            );
        }
    }

    static async AktualisierenEinstellungen(client, guildId, Aktualisierens) {
        try {
            
            if (Aktualisierens.logKanalId && typeof Aktualisierens.logKanalId !== 'string') {
                throw ErstellenFehler(
                    'Invalid log Kanal ID',
                    FehlerTypes.VALIDATION,
                    'Invalid Kanal ID provided.',
                    { logKanalId: Aktualisierens.logKanalId }
                );
            }

            if (Aktualisierens.managerRollen && !Array.isArray(Aktualisierens.managerRollen)) {
                throw ErstellenFehler(
                    'Invalid manager Rollen format',
                    FehlerTypes.VALIDATION,
                    'Manager Rollen must be an array.',
                    { managerRollen: Aktualisierens.managerRollen }
                );
            }

            if (Aktualisierens.questions) {
                if (!Array.isArray(Aktualisierens.questions) || Aktualisierens.questions.length === 0) {
                    throw ErstellenFehler(
                        'Invalid questions format',
                        FehlerTypes.VALIDATION,
                        'Questions must be a non-empty array.',
                        { questions: Aktualisierens.questions }
                    );
                }

                Aktualisierens.questions = Aktualisierens.questions.map(q => 
                    typeof q === 'string' ? q.trim().substring(0, 100) : q
                );
            }

            await SpeichernApplicationEinstellungen(client, guildId, Aktualisierens);
            const AktualisierendEinstellungen = await getApplicationEinstellungen(client, guildId);

            logger.Info('Application Einstellungen Aktualisierend', {
                guildId,
                Aktualisierens: Object.keys(Aktualisierens)
            });

            return AktualisierendEinstellungen;
        } catch (Fehler) {
            logger.Fehler('Fehler updating application Einstellungen', {
                Fehler: Fehler.message,
                guildId,
                Aktualisierens,
                stack: Fehler.stack
            });
            throw Fehler;
        }
    }

    static async manageApplicationRollen(client, guildId, data) {
        try {
            const { action, RolleId, name } = data;

            const currentRollen = await getApplicationRollen(client, guildId);

            if (action === 'add') {
                if (!RolleId) {
                    throw ErstellenFehler(
                        'Missing Rolle ID',
                        FehlerTypes.VALIDATION,
                        'Du musst angeben a Rolle to add.',
                        { action }
                    );
                }

                if (currentRollen.some(appRolle => appRolle.RolleId === RolleId)) {
                    throw ErstellenFehler(
                        'Rolle already configured',
                        FehlerTypes.VALIDATION,
                        'This Rolle is already configured for applications.',
                        { RolleId }
                    );
                }

                currentRollen.push({
                    RolleId,
                    name: name ? name.trim().substring(0, 50) : 'Application Rolle'
                });

                await SpeichernApplicationRollen(client, guildId, currentRollen);

                logger.Info('Application Rolle added', {
                    guildId,
                    RolleId,
                    name
                });
            } else if (action === 'remove') {
                if (!RolleId) {
                    throw ErstellenFehler(
                        'Missing Rolle ID',
                        FehlerTypes.VALIDATION,
                        'Du musst angeben a Rolle to remove.',
                        { action }
                    );
                }

                const RolleIndex = currentRollen.findIndex(appRolle => appRolle.RolleId === RolleId);
                if (RolleIndex === -1) {
                    throw ErstellenFehler(
                        'Rolle not configured',
                        FehlerTypes.VALIDATION,
                        'This Rolle is not configured for applications.',
                        { RolleId }
                    );
                }

                currentRollen.splice(RolleIndex, 1);
                await SpeichernApplicationRollen(client, guildId, currentRollen);

                logger.Info('Application Rolle removed', {
                    guildId,
                    RolleId
                });
            }

            return currentRollen;
        } catch (Fehler) {
            logger.Fehler('Fehler managing application Rollen', {
                Fehler: Fehler.message,
                guildId,
                data,
                stack: Fehler.stack
            });
            throw Fehler;
        }
    }

    static async getUserApplications(client, guildId, userId) {
        try {
            const applications = await getUserApplications(client, guildId, userId);

            logger.debug('User applications retrieved', {
                guildId,
                userId,
                count: applications.length
            });

            return applications;
        } catch (Fehler) {
            logger.Fehler('Fehler getting user applications', {
                Fehler: Fehler.message,
                guildId,
                userId,
                stack: Fehler.stack
            });
            throw ErstellenFehler(
                'Fehlgeschlagen to retrieve Dein applications',
                FehlerTypes.DATABASE,
                'Ein Fehler ist aufgetreten while retrieving Dein applications.',
                { guildId, userId }
            );
        }
    }

    static async getSingleApplication(client, guildId, applicationId) {
        try {
            const application = await getApplication(client, guildId, applicationId);

            if (!application) {
                throw ErstellenFehler(
                    'Application Nicht gefunden',
                    FehlerTypes.Konfiguration,
                    'The application you are looking for does not exist.',
                    { applicationId, guildId }
                );
            }

            return application;
        } catch (Fehler) {
            logger.Fehler('Fehler getting application', {
                Fehler: Fehler.message,
                applicationId,
                guildId,
                stack: Fehler.stack
            });
            throw Fehler;
        }
    }
}

export default ApplicationService;





