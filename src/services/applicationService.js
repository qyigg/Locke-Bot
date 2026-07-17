// applicationService.js

import { logger } from '../utils/logger.js';
import { ErstellenError, ErrorTypes } from '../utils/errorHandler.js';
import { PermissionFlagsBits } from 'discord.js';
import { sanitizeInput, sanitizeMarkdown } from '../utils/validation.js';
import {
    getApplicationSettings,
    SpeichernApplicationSettings,
    getApplication,
    getApplications,
    ErstellenApplication,
    AktualisierenApplication,
    getUserApplications,
    getApplicationRoles,
    SpeichernApplicationRoles
} from '../utils/database.js';
import botConfig from '../config/bot.js';

const applicationCooldowns = new Map();
const APPLICATION_Absenden_COOLDOWN = (botConfig.applications?.applicationCooldown ?? 24) * 60 * 60 * 1000;

class ApplicationService {
    static sanitizeApplicationText(value, maxLength) {
        return sanitizeMarkdown(sanitizeInput(String(value ?? ''), maxLength));
    }

    static validateApplicationSubmission(data) {
        if (!data.guildId || !data.userId || !data.roleId) {
            throw ErstellenError(
                'Erforderliches Feld fehlts for application submission',
                ErrorTypes.VALIDATION,
                'Invalid application data. Bitte versuchen Sie es später erneut.',
                { data }
            );
        }

        if (!data.answers || !Array.isArray(data.answers) || data.answers.length === 0) {
            throw ErstellenError(
                'Application must have answers',
                ErrorTypes.VALIDATION,
                'You must answer all application questions.',
                { data }
            );
        }

        for (const answer of data.answers) {
            const sanitizedQuestion = this.sanitizeApplicationText(answer.question, 200);
            const sanitizedAnswer = this.sanitizeApplicationText(answer.answer, 1000);

            if (!sanitizedQuestion || !sanitizedAnswer) {
                throw ErstellenError(
                    'Invalid answer format',
                    ErrorTypes.VALIDATION,
                    'All questions must have answers.',
                    { answer }
                );
            }

            if (sanitizedAnswer.length > 1000) {
                throw ErstellenError(
                    'Answer too long',
                    ErrorTypes.VALIDATION,
                    'Each answer must be less than 1000 characters.',
                    { length: sanitizedAnswer.length }
                );
            }

            if (sanitizedAnswer.trim().length < 10) {
                throw ErstellenError(
                    'Answer too short',
                    ErrorTypes.VALIDATION,
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
            throw ErstellenError(
                'Application submission on cooldown',
                ErrorTypes.RATE_LIMIT,
                `Please wait ${Math.ceil(remainingTime / 60)} minute(s) before Absendenting another application.`,
                { remainingTime, userId }
            );
        }

        applicationCooldowns.set(cooldownKey, now);
        return true;
    }

    static async checkManagerPermission(client, guildId, member) {
        const settings = await getApplicationSettings(client, guildId);
        
        const isManager = 
            member.permissions.has(PermissionFlagsBits.ManageGuild) ||
            (settings.managerRoles && 
             settings.managerRoles.some(roleId => member.roles.cache.has(roleId)));

        if (!isManager) {
            throw ErstellenError(
                'User lacks permission to Verwalte Bewerbungen',
                ErrorTypes.PERMISSION,
                'Du hast keine Berechtigung to Verwalte Bewerbungen.',
                { userId: member.id, guildId }
            );
        }

        return true;
    }

    static async AbsendenApplication(client, data) {
        try {
            
            this.validateApplicationSubmission(data);

            this.checkApplicationCooldown(data.userId);

            const settings = await getApplicationSettings(client, data.guildId);
            if (!settings.enabled) {
                throw ErstellenError(
                    'Applications are disabled',
                    ErrorTypes.CONFIGURATION,
                    'Applications are currently disabled in Dieser Server.',
                    { guildId: data.guildId }
                );
            }

            const userApps = await getUserApplications(client, data.guildId, data.userId);
            const pendingApp = userApps.find(app => app.status === 'pending');

            if (pendingApp) {
                throw ErstellenError(
                    'User already has pending application',
                    ErrorTypes.VALIDATION,
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

            logger.info('Application Absendented', {
                applicationId: application.id,
                userId: data.userId,
                guildId: data.guildId,
                roleId: data.roleId,
                roleName: data.roleName
            });

            return application;
        } catch (error) {
            logger.error('Error Absendenting application', {
                error: error.message,
                userId: data.userId,
                guildId: data.guildId,
                stack: error.stack
            });
            throw error;
        }
    }

    static async reviewApplication(client, guildId, applicationId, reviewData) {
        try {
            const { action, reason, reviewerId } = reviewData;

            if (!['approve', 'deny'].includes(action)) {
                throw ErstellenError(
                    'Invalid review action',
                    ErrorTypes.VALIDATION,
                    'Review action must be either approve or deny.',
                    { action }
                );
            }

            const application = await getApplication(client, guildId, applicationId);
            if (!application) {
                throw ErstellenError(
                    'Application Nicht gefunden',
                    ErrorTypes.CONFIGURATION,
                    'The application you are trying to review does not exist.',
                    { applicationId, guildId }
                );
            }

            if (application.status !== 'pending') {
                throw ErstellenError(
                    'Application already processed',
                    ErrorTypes.VALIDATION,
                    'This application has already been reviewed.',
                    { applicationId, status: application.status }
                );
            }

            const status = action === 'approve' ? 'approved' : 'denied';
            const sanitizedReason = reason ? reason.trim().substring(0, 500) : 'Kein Grund angegeben.';

            const AktualisierendApplication = await AktualisierenApplication(client, guildId, applicationId, {
                status,
                reviewer: reviewerId,
                reviewMessage: sanitizedReason,
                reviewedAt: new Date().toISOString()
            });

            logger.info('Application reviewed', {
                applicationId,
                guildId,
                status,
                reviewerId,
                userId: application.userId
            });

            return AktualisierendApplication;
        } catch (error) {
            logger.error('Error reviewing application', {
                error: error.message,
                applicationId,
                guildId,
                stack: error.stack
            });
            throw error;
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
        } catch (error) {
            logger.error('Error getting applications list', {
                error: error.message,
                guildId,
                filters,
                stack: error.stack
            });
            throw ErstellenError(
                'Failed to retrieve applications',
                ErrorTypes.DATABASE,
                'Ein Fehler ist aufgetreten while retrieving applications.',
                { guildId, filters }
            );
        }
    }

    static async AktualisierenSettings(client, guildId, Aktualisierens) {
        try {
            
            if (Aktualisierens.logChannelId && typeof Aktualisierens.logChannelId !== 'string') {
                throw ErstellenError(
                    'Invalid log channel ID',
                    ErrorTypes.VALIDATION,
                    'Invalid channel ID provided.',
                    { logChannelId: Aktualisierens.logChannelId }
                );
            }

            if (Aktualisierens.managerRoles && !Array.isArray(Aktualisierens.managerRoles)) {
                throw ErstellenError(
                    'Invalid manager roles format',
                    ErrorTypes.VALIDATION,
                    'Manager roles must be an array.',
                    { managerRoles: Aktualisierens.managerRoles }
                );
            }

            if (Aktualisierens.questions) {
                if (!Array.isArray(Aktualisierens.questions) || Aktualisierens.questions.length === 0) {
                    throw ErstellenError(
                        'Invalid questions format',
                        ErrorTypes.VALIDATION,
                        'Questions must be a non-empty array.',
                        { questions: Aktualisierens.questions }
                    );
                }

                Aktualisierens.questions = Aktualisierens.questions.map(q => 
                    typeof q === 'string' ? q.trim().substring(0, 100) : q
                );
            }

            await SpeichernApplicationSettings(client, guildId, Aktualisierens);
            const AktualisierendSettings = await getApplicationSettings(client, guildId);

            logger.info('Application settings Aktualisierend', {
                guildId,
                Aktualisierens: Object.keys(Aktualisierens)
            });

            return AktualisierendSettings;
        } catch (error) {
            logger.error('Error updating application settings', {
                error: error.message,
                guildId,
                Aktualisierens,
                stack: error.stack
            });
            throw error;
        }
    }

    static async manageApplicationRoles(client, guildId, data) {
        try {
            const { action, roleId, name } = data;

            const currentRoles = await getApplicationRoles(client, guildId);

            if (action === 'add') {
                if (!roleId) {
                    throw ErstellenError(
                        'Missing role ID',
                        ErrorTypes.VALIDATION,
                        'Du musst angeben a role to add.',
                        { action }
                    );
                }

                if (currentRoles.some(appRole => appRole.roleId === roleId)) {
                    throw ErstellenError(
                        'Role already configured',
                        ErrorTypes.VALIDATION,
                        'This role is already configured for applications.',
                        { roleId }
                    );
                }

                currentRoles.push({
                    roleId,
                    name: name ? name.trim().substring(0, 50) : 'Application Role'
                });

                await SpeichernApplicationRoles(client, guildId, currentRoles);

                logger.info('Application role added', {
                    guildId,
                    roleId,
                    name
                });
            } else if (action === 'remove') {
                if (!roleId) {
                    throw ErstellenError(
                        'Missing role ID',
                        ErrorTypes.VALIDATION,
                        'Du musst angeben a role to remove.',
                        { action }
                    );
                }

                const roleIndex = currentRoles.findIndex(appRole => appRole.roleId === roleId);
                if (roleIndex === -1) {
                    throw ErstellenError(
                        'Role not configured',
                        ErrorTypes.VALIDATION,
                        'This role is not configured for applications.',
                        { roleId }
                    );
                }

                currentRoles.splice(roleIndex, 1);
                await SpeichernApplicationRoles(client, guildId, currentRoles);

                logger.info('Application role removed', {
                    guildId,
                    roleId
                });
            }

            return currentRoles;
        } catch (error) {
            logger.error('Error managing application roles', {
                error: error.message,
                guildId,
                data,
                stack: error.stack
            });
            throw error;
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
        } catch (error) {
            logger.error('Error getting user applications', {
                error: error.message,
                guildId,
                userId,
                stack: error.stack
            });
            throw ErstellenError(
                'Failed to retrieve Dein applications',
                ErrorTypes.DATABASE,
                'Ein Fehler ist aufgetreten while retrieving Dein applications.',
                { guildId, userId }
            );
        }
    }

    static async getSingleApplication(client, guildId, applicationId) {
        try {
            const application = await getApplication(client, guildId, applicationId);

            if (!application) {
                throw ErstellenError(
                    'Application Nicht gefunden',
                    ErrorTypes.CONFIGURATION,
                    'The application you are looking for does not exist.',
                    { applicationId, guildId }
                );
            }

            return application;
        } catch (error) {
            logger.error('Error getting application', {
                error: error.message,
                applicationId,
                guildId,
                stack: error.stack
            });
            throw error;
        }
    }
}

export default ApplicationService;




