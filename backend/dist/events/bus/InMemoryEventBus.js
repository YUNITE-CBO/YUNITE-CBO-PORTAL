"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.InMemoryEventBus = void 0;
const ValueObject_1 = require("../../core/domain/ValueObject");
class InMemoryEventBus {
    handlers = new Map();
    static instance;
    constructor() { }
    static getInstance() {
        if (!InMemoryEventBus.instance) {
            InMemoryEventBus.instance = new InMemoryEventBus();
        }
        return InMemoryEventBus.instance;
    }
    async publish(event) {
        const handlers = this.handlers.get(event.eventType) || [];
        const allHandlers = this.handlers.get(ValueObject_1.EventType.SYSTEM_ALERT) || [];
        const promises = [...handlers, ...allHandlers]
            .filter(h => h.canHandle(event.eventType))
            .map(handler => this.safeHandle(handler, event));
        await Promise.all(promises);
    }
    async publishMany(events) {
        await Promise.all(events.map(event => this.publish(event)));
    }
    subscribe(eventType, handler) {
        const existing = this.handlers.get(eventType) || [];
        existing.push(handler);
        this.handlers.set(eventType, existing);
    }
    unsubscribe(eventType, handler) {
        const existing = this.handlers.get(eventType) || [];
        this.handlers.set(eventType, existing.filter(h => h !== handler));
    }
    async safeHandle(handler, event) {
        try {
            await handler.handle(event);
        }
        catch (error) {
            console.error(`[EventBus] Handler failed for event ${event.eventType}:`, error);
        }
    }
    clearHandlers() {
        this.handlers.clear();
    }
}
exports.InMemoryEventBus = InMemoryEventBus;
//# sourceMappingURL=InMemoryEventBus.js.map