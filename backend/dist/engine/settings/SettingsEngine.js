"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.SettingsEngine = void 0;
const Logger_1 = require("../../core/services/Logger");
const DatabaseService_1 = require("../../core/services/DatabaseService");
const AppError_1 = require("../../common/errors/AppError");
class SettingsEngine {
    static instance;
    cache = new Map();
    constructor() { }
    static getInstance() {
        if (!SettingsEngine.instance) {
            SettingsEngine.instance = new SettingsEngine();
        }
        return SettingsEngine.instance;
    }
    /**
     * Get a setting value by key
     */
    async get(key, organizationId) {
        const cacheKey = organizationId ? `${organizationId}:${key}` : key;
        // Check cache first
        if (this.cache.has(cacheKey)) {
            return this.cache.get(cacheKey);
        }
        const prisma = DatabaseService_1.DatabaseService.getInstance();
        const setting = await prisma.setting.findFirst({
            where: {
                key,
                ...(organizationId ? { organizationId } : { organizationId: null }),
            },
        });
        if (!setting) {
            return null;
        }
        this.cache.set(cacheKey, setting.value);
        return setting.value;
    }
    /**
     * Set a setting value
     */
    async set(key, value, options, userId) {
        const prisma = DatabaseService_1.DatabaseService.getInstance();
        const organizationId = options?.organizationId;
        const data = {
            key,
            value: typeof value === 'string' && options?.type !== 'string' ? JSON.parse(value) : value,
            type: options?.type || 'string',
            group: options?.group || 'general',
            category: options?.category || 'general',
            isPublic: options?.isPublic || false,
            isSystem: options?.isSystem || false,
            description: options?.description,
            allowedValues: options?.allowedValues,
            defaultValue: options?.defaultValue,
            minValue: options?.minValue,
            maxValue: options?.maxValue,
            pattern: options?.pattern,
            ...(organizationId ? { organizationId } : {}),
            ...(userId ? { updatedById: userId } : {}),
        };
        // Check if setting exists
        const existing = await prisma.setting.findFirst({
            where: {
                key,
                ...(organizationId ? { organizationId } : { organizationId: null }),
            },
        });
        if (existing) {
            await prisma.setting.update({
                where: { id: existing.id },
                data: {
                    value: data.value,
                    updatedById: userId,
                },
            });
        }
        else {
            await prisma.setting.create({
                data: {
                    ...data,
                    createdById: userId,
                },
            });
        }
        // Update cache
        const cacheKey = organizationId ? `${organizationId}:${key}` : key;
        this.cache.set(cacheKey, value);
        Logger_1.Logger.info(`Setting updated: ${key}`, { organizationId });
    }
    /**
     * Get all settings grouped by category
     */
    async getAll(organizationId) {
        const prisma = DatabaseService_1.DatabaseService.getInstance();
        const settings = await prisma.setting.findMany({
            where: organizationId ? { organizationId } : { organizationId: null },
            orderBy: [{ category: 'asc' }, { group: 'asc' }],
        });
        const grouped = {};
        for (const setting of settings) {
            if (!grouped[setting.category]) {
                grouped[setting.category] = [];
            }
            grouped[setting.category].push(setting);
        }
        return grouped;
    }
    /**
     * Register default system settings
     */
    async registerDefaults(organizationId) {
        const defaults = [
            { key: 'organization.name', value: '', type: 'string', group: 'general', category: 'organization', description: 'Organization name' },
            { key: 'organization.currency', value: 'KES', type: 'string', group: 'general', category: 'organization', description: 'Default currency', allowedValues: ['KES', 'USD', 'UGX', 'TZS', 'RWF'] },
            { key: 'organization.timezone', value: 'Africa/Nairobi', type: 'string', group: 'general', category: 'organization', description: 'Default timezone' },
            { key: 'financial.interestRate.default', value: 12, type: 'number', group: 'loans', category: 'financial', description: 'Default annual interest rate (%)', minValue: 0, maxValue: 100 },
            { key: 'financial.loan.maxAmount', value: 1000000, type: 'number', group: 'loans', category: 'financial', description: 'Maximum loan amount', minValue: 0 },
            { key: 'financial.savings.minBalance', value: 0, type: 'number', group: 'savings', category: 'financial', description: 'Minimum savings balance', minValue: 0 },
            { key: 'financial.share.nominalValue', value: 100, type: 'number', group: 'shares', category: 'financial', description: 'Nominal value per share', minValue: 1 },
            { key: 'notifications.email.enabled', value: true, type: 'boolean', group: 'email', category: 'notifications', description: 'Enable email notifications' },
            { key: 'notifications.sms.enabled', value: false, type: 'boolean', group: 'sms', category: 'notifications', description: 'Enable SMS notifications' },
            { key: 'notifications.inApp.enabled', value: true, type: 'boolean', group: 'inApp', category: 'notifications', description: 'Enable in-app notifications' },
            { key: 'security.mfa.enabled', value: false, type: 'boolean', group: 'mfa', category: 'security', description: 'Enable multi-factor authentication' },
            { key: 'security.session.timeout', value: 30, type: 'number', group: 'session', category: 'security', description: 'Session timeout in minutes', minValue: 5 },
            { key: 'security.password.minLength', value: 8, type: 'number', group: 'password', category: 'security', description: 'Minimum password length', minValue: 6, maxValue: 128 },
            { key: 'membership.requiresApproval', value: true, type: 'boolean', group: 'registration', category: 'membership', description: 'Require approval for new members' },
            { key: 'membership.maxMembers', value: 0, type: 'number', group: 'limits', category: 'membership', description: 'Maximum members (0 = unlimited)', minValue: 0 },
        ];
        for (const setting of defaults) {
            const existing = await DatabaseService_1.DatabaseService.getInstance().setting.findFirst({
                where: {
                    key: setting.key,
                    organizationId,
                },
            });
            if (!existing) {
                await DatabaseService_1.DatabaseService.getInstance().setting.create({
                    data: {
                        key: setting.key,
                        value: setting.value,
                        type: setting.type,
                        group: setting.group,
                        category: setting.category,
                        isPublic: setting.isPublic || false,
                        isSystem: setting.isSystem || false,
                        description: setting.description,
                        allowedValues: setting.allowedValues,
                        defaultValue: setting.defaultValue,
                        minValue: setting.minValue,
                        maxValue: setting.maxValue,
                        pattern: setting.pattern,
                        organizationId,
                    },
                });
            }
        }
        Logger_1.Logger.info(`Default settings registered for organization: ${organizationId}`);
    }
    /**
     * Delete a setting
     */
    async delete(key, organizationId) {
        const prisma = DatabaseService_1.DatabaseService.getInstance();
        const setting = await prisma.setting.findFirst({
            where: {
                key,
                ...(organizationId ? { organizationId } : { organizationId: null }),
            },
        });
        if (!setting) {
            throw new AppError_1.BusinessRuleError(`Setting not found: ${key}`);
        }
        if (setting.isSystem) {
            throw new AppError_1.BusinessRuleError(`Cannot delete system setting: ${key}`);
        }
        await prisma.setting.delete({ where: { id: setting.id } });
        const cacheKey = organizationId ? `${organizationId}:${key}` : key;
        this.cache.delete(cacheKey);
    }
    /**
     * Clear cache for a specific key or all
     */
    clearCache(key, organizationId) {
        if (key) {
            const cacheKey = organizationId ? `${organizationId}:${key}` : key;
            this.cache.delete(cacheKey);
        }
        else {
            this.cache.clear();
        }
    }
}
exports.SettingsEngine = SettingsEngine;
//# sourceMappingURL=SettingsEngine.js.map