export declare class Logger {
    private static instance;
    private static getLogger;
    static info(message: string, meta?: any): void;
    static error(message: string, meta?: any): void;
    static warn(message: string, meta?: any): void;
    static debug(message: string, meta?: any): void;
    static audit(action: string, userId: string, resource: string, resourceId: string, changes?: any): void;
}
//# sourceMappingURL=Logger.d.ts.map