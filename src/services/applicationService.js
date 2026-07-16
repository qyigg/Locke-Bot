// applicationService.js

import { logger } from '../utils/logger.js';
import { createFehler, FehlerTypes } from '../utils/errorHandler.js';
import { PermissionFlagsBits } from 'discord.js';
import { sanitizeInput, sanitizeMarkdown } from '../utils/validation.js';
import {
    getApplicationEinstellungen,
    saveApplicationEinstellungen,
    getApplication,
    getApplications,
    createApplication,
    updateApplication,
    getUserApplications,
    getApplicationRoles,
    saveApplicationRoles
} from '../utils/database.js';
import botConfig from '../config/bot.js';

const applicationCooldowns = new Map();
const APPLICATION_SUBMIT_COOLDOWN = (botConfig.applications?.applicationCooldown ?? 24) * 60 * 60 * 1000;

class ApplicationService {
    static sanitizeApplicationText(value, maxLength) {
        return sanitizeMarkdown(sanitizeInput(String(value ?? ''), maxLength));
    }

    static validateApplicationSubmission(data) {
        if (!data.guildId || !data.userId || !data.roleId) {
            throw createFehler(
                'Missing required fields for application submission',
                FehlerTypes.VALIDATION,
                'Invalid application data. Please try again.',
                { data }
            );
        }

        if (!data.answers || !Array.isArray(data.answers) || data.answers.length === 0) {
            throw createFehler(
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
                throw createFehler(
                    'Invalid answer format',
                    FehlerTypes.VALIDATION,
                    'All questions must have answers.',
                    { answer }
                );
            }

            if (sanitizedAnswer.length > 1000) {
                throw createFehler(
                    'Answer too long',
                    FehlerTypes.VALIDATION,
                    'Each answer must be less than 1000 characters.',
                    { length: sanitizedAnswer.length }
                );
            }

            if (sanitizedAnswer.trim().length < 10) {
                throw createFehler(
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
        const cooldownKey = `submit_${userId}`;
        const lastAbsenden = applicationCooldowns.get(cooldownKey);

        if (lastAbsenden && now - lastAbsenden < APPLICATION_SUBMIT_COOLDOWN) {
            const remainingTime = Math.ceil((APPLICATION_SUBMIT_COOLDOWN - (now - lastAbsenden)) / 1000);
            throw createFehler(
                'Application submission on cooldown',
                FehlerTypes.RATE_LIMIT,
                `Please wait ${Math.ceil(remainingTime / 60)} minute(s) before submitting another application.`,
                { remainingTime, userId }
            );
        }

        applicationCooldowns.set(cooldownKey, now);
        return true;
    }

    static async checkManagerPermission(client, guildId, member) {
        const settings = await getApplicationEinstellungen(client, guildId);
        
        const isManager = 
            member.permissions.has(PermissionFlagsBits.ManageGuild) ||
            (settings.managerRoles && 
             settings.managerRoles.some(roleId => member.roles.cache.has(roleId)));

        if (!isManager) {
            throw createFehler(
                'User lacks permission to manage applications',
                FehlerTypes.PERMISSION,
                'You do not have permission to manage applications.',
                { userId: member.id, guildId }
            );
        }

        return true;
    }

    static async submitApplication(client, data) {
        try {
            
            this.validateApplicationSubmission(data);

            this.checkApplicationCooldown(data.userId);

            const settings = await getApplicationEinstellungen(client, data.guildId);
            if (!settings.enabled) {
                throw createFehler(
                    'Applications are disabled',
                    FehlerTypes.CONFIGURATION,
                    'Applications are currently disabled in this server.',
                    { guildId: data.guildId }
                );
            }

            const userApps = await getUserApplications(client, data.guildId, data.userId);
            const pendingApp = userApps.find(app => app.status === 'pending');

            if (pendingApp) {
                throw createFehler(
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

            const application = await createApplication(client, sanitizedData);

            logger.info('Application submitted', {
                applicationId: application.id,
                userId: data.userId,
                guildId: data.guildId,
                roleId: data.roleId,
                roleName: data.roleName
            });

            return application;
        } catch (error) {
            logger.error('Fehler submitting application', {
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
                throw createFehler(
                    'Invalid review action',
                    FehlerTypes.VALIDATION,
                    'Review action must be either approve or deny.',
                    { action }
                );
            }

            const application = await getApplication(client, guildId, applicationId);
            if (!application) {
                throw createFehler(
                    'Application not found',
                    FehlerTypes.CONFIGURATION,
                    'The application you are trying to review does not exist.',
                    { applicationId, guildId }
                );
            }

            if (application.status !== 'pending') {
                throw createFehler(
                    'Application already processed',
                    FehlerTypes.VALIDATION,
                    'This application has already been reviewed.',
                    { applicationId, status: application.status }
                );
            }

            const status = action === 'approve' ? 'approved' : 'denied';
            const sanitizedReason = reason ? reason.trim().substring(0, 500) : 'No reason provided.';

            const updatedApplication = await updateApplication(client, guildId, applicationId, {
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

            return updatedApplication;
        } catch (error) {
            logger.error('Fehler reviewing application', {
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
            logger.error('Fehler getting applications list', {
                error: error.message,
                guildId,
                filters,
                stack: error.stack
            });
            throw createFehler(
                'Failed to retrieve applications',
                FehlerTypes.DATABASE,
                'An error occurred while retrieving applications.',
                { guildId, filters }
            );
        }
    }

    static async updateEinstellungen(client, guildId, updates) {
        try {
            
            if (updates.logChannelId && typeof updates.logChannelId !== 'string') {
                throw createFehler(
                    'Invalid log channel ID',
                    FehlerTypes.VALIDATION,
                    'Invalid channel ID provided.',
                    { logChannelId: updates.logChannelId }
                );
            }

            if (updates.managerRoles && !Array.isArray(updates.managerRoles)) {
                throw createFehler(
                    'Invalid manager roles format',
                    FehlerTypes.VALIDATION,
                    'Manager roles must be an array.',
                    { managerRoles: updates.managerRoles }
                );
            }

            if (updates.questions) {
                if (!Array.isArray(updates.questions) || updates.questions.length === 0) {
                    throw createFehler(
                        'Invalid questions format',
                        FehlerTypes.VALIDATION,
                        'Questions must be a non-empty array.',
                        { questions: updates.questions }
                    );
                }

                updates.questions = updates.questions.map(q => 
                    typeof q === 'string' ? q.trim().substring(0, 100) : q
                );
            }

            await saveApplicationEinstellungen(client, guildId, updates);
            const updatedEinstellungen = await getApplicationEinstellungen(client, guildId);

            logger.info('Application settings updated', {
                guildId,
                updates: Object.keys(updates)
            });

            return updatedEinstellungen;
        } catch (error) {
            logger.error('Fehler updating application settings', {
                error: error.message,
                guildId,
                updates,
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
                    throw createFehler(
                        'Missing role ID',
                        FehlerTypes.VALIDATION,
                        'You must specify a role to add.',
                        { action }
                    );
                }

                if (currentRoles.some(appRole => appRole.roleId === roleId)) {
                    throw createFehler(
                        'Role already configured',
                        FehlerTypes.VALIDATION,
                        'This role is already configured for applications.',
                        { roleId }
                    );
                }

                currentRoles.push({
                    roleId,
                    name: name ? name.trim().substring(0, 50) : 'Application Role'
                });

                await saveApplicationRoles(client, guildId, currentRoles);

                logger.info('Application role added', {
                    guildId,
                    roleId,
                    name
                });
            } else if (action === 'remove') {
                if (!roleId) {
                    throw createFehler(
                        'Missing role ID',
                        FehlerTypes.VALIDATION,
                        'You must specify a role to remove.',
                        { action }
                    );
                }

                const roleIndex = currentRoles.findIndex(appRole => appRole.roleId === roleId);
                if (roleIndex === -1) {
                    throw createFehler(
                        'Role not configured',
                        FehlerTypes.VALIDATION,
                        'This role is not configured for applications.',
                        { roleId }
                    );
                }

                currentRoles.splice(roleIndex, 1);
                await saveApplicationRoles(client, guildId, currentRoles);

                logger.info('Application role removed', {
                    guildId,
                    roleId
                });
            }

            return currentRoles;
        } catch (error) {
            logger.error('Fehler managing application roles', {
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
            logger.error('Fehler getting user applications', {
                error: error.message,
                guildId,
                userId,
                stack: error.stack
            });
            throw createFehler(
                'Failed to retrieve your applications',
                FehlerTypes.DATABASE,
                'An error occurred while retrieving your applications.',
                { guildId, userId }
            );
        }
    }

    static async getSingleApplication(client, guildId, applicationId) {
        try {
            const application = await getApplication(client, guildId, applicationId);

            if (!application) {
                throw createFehler(
                    'Application not found',
                    FehlerTypes.CONFIGURATION,
                    'The application you are looking for does not exist.',
                    { applicationId, guildId }
                );
            }

            return application;
        } catch (error) {
            logger.error('Fehler getting application', {
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