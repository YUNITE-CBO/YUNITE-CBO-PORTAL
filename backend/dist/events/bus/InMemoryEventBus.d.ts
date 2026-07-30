import { DomainEvent, EventBus, EventHandler } from '../../core/domain/DomainEvent';
import { EventType } from '../../core/domain/ValueObject';
export declare class InMemoryEventBus implements EventBus {
    private handlers;
    private static instance;
    private constructor();
    static getInstance(): InMemoryEventBus;
    publish(event: DomainEvent): Promise<void>;
    publishMany(events: DomainEvent[]): Promise<void>;
    subscribe(eventType: EventType, handler: EventHandler): void;
    unsubscribe(eventType: EventType, handler: EventHandler): void;
    private safeHandle;
    clearHandlers(): void;
}
//# sourceMappingURL=InMemoryEventBus.d.ts.map