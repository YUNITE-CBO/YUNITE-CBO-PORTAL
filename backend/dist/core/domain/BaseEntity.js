"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.BaseEntity = void 0;
class BaseEntity {
    id;
    createdAt;
    updatedAt;
    deletedAt;
    isActive;
    version;
    constructor(id) {
        this.id = id;
        this.createdAt = new Date();
        this.updatedAt = new Date();
        this.deletedAt = null;
        this.isActive = true;
        this.version = 1;
    }
    softDelete() {
        this.deletedAt = new Date();
        this.isActive = false;
        this.version++;
    }
    restore() {
        this.deletedAt = null;
        this.isActive = true;
        this.version++;
    }
    markUpdated() {
        this.updatedAt = new Date();
        this.version++;
    }
}
exports.BaseEntity = BaseEntity;
//# sourceMappingURL=BaseEntity.js.map