import { EventType } from './ValueObject';
export interface DomainEvent {
    eventId: string;
    eventType: EventType;
    aggregateId: string;
    aggregateType: string;
    timestamp: Date;
    data: Record<string, any>;
    metadata: {
        userId: string;
        organizationId: string;
        branchId?: string;
        ipAddress?: string;
        userAgent?: string;
        correlationId: string;
        causationId?: string;
    };
}
export interface EventHandler {
    handle(event: DomainEvent): Promise<void>;
    canHandle(eventType: EventType): boolean;
}
export interface EventBus {
    publish(event: DomainEvent): Promise<void>;
    publishMany(events: DomainEvent[]): Promise<void>;
    subscribe(eventType: EventType, handler: EventHandler): void;
    unsubscribe(eventType: EventType, handler: EventHandler): void;
}
//# sourceMappingURL=DomainEvent.d.ts.map