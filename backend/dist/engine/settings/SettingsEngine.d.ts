export interface SettingDefinition {
    key: string;
    value: any;
    type: 'string' | 'number' | 'boolean' | 'json' | 'array';
    group: string;
    category: string;
    isPublic?: boolean;
    isSystem?: boolean;
    description?: string;
    allowedValues?: any[];
    defaultValue?: any;
    minValue?: number;
    maxValue?: number;
    pattern?: string;
    organizationId?: string;
}
export declare class SettingsEngine {
    private static instance;
    private cache;
    private constructor();
    static getInstance(): SettingsEngine;
    /**
     * Get a setting value by key
     */
    get(key: string, organizationId?: string): Promise<any>;
    /**
     * Set a setting value
     */
    set(key: string, value: any, options?: Partial<SettingDefinition>, userId?: string): Promise<void>;
    /**
     * Get all settings grouped by category
     */
    getAll(organizationId?: string): Promise<Record<string, SettingDefinition[]>>;
    /**
     * Register default system settings
     */
    registerDefaults(organizationId: string): Promise<void>;
    /**
     * Delete a setting
     */
    delete(key: string, organizationId?: string): Promise<void>;
    /**
     * Clear cache for a specific key or all
     */
    clearCache(key?: string, organizationId?: string): void;
}
//# sourceMappingURL=SettingsEngine.d.ts.map