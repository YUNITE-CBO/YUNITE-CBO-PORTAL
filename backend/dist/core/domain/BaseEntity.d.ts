export declare abstract class BaseEntity {
    readonly id: string;
    readonly createdAt: Date;
    updatedAt: Date;
    deletedAt: Date | null;
    isActive: boolean;
    version: number;
    constructor(id: string);
    softDelete(): void;
    restore(): void;
    protected markUpdated(): void;
}
//# sourceMappingURL=BaseEntity.d.ts.map