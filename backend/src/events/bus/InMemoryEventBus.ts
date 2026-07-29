import { DomainEvent, EventBus, EventHandler } from '../../core/domain/DomainEvent';
import { EventType } from '../../core/domain/ValueObject';

export class InMemoryEventBus implements EventBus {
  private handlers: Map<EventType, EventHandler[]> = new Map();
  private static instance: InMemoryEventBus;

  private constructor() {}

  public static getInstance(): InMemoryEventBus {
    if (!InMemoryEventBus.instance) {
      InMemoryEventBus.instance = new InMemoryEventBus();
    }
    return InMemoryEventBus.instance;
  }

  public async publish(event: DomainEvent): Promise<void> {
    const handlers = this.handlers.get(event.eventType) || [];
    const allHandlers = this.handlers.get(EventType.SYSTEM_ALERT) || [];

    const promises = [...handlers, ...allHandlers]
      .filter(h => h.canHandle(event.eventType))
      .map(handler => this.safeHandle(handler, event));

    await Promise.all(promises);
  }

  public async publishMany(events: DomainEvent[]): Promise<void> {
    await Promise.all(events.map(event => this.publish(event)));
  }

  public subscribe(eventType: EventType, handler: EventHandler): void {
    const existing = this.handlers.get(eventType) || [];
    existing.push(handler);
    this.handlers.set(eventType, existing);
  }

  public unsubscribe(eventType: EventType, handler: EventHandler): void {
    const existing = this.handlers.get(eventType) || [];
    this.handlers.set(
      eventType,
      existing.filter(h => h !== handler)
    );
  }

  private async safeHandle(handler: EventHandler, event: DomainEvent): Promise<void> {
    try {
      await handler.handle(event);
    } catch (error) {
      console.error(`[EventBus] Handler failed for event ${event.eventType}:`, error);
    }
  }

  public clearHandlers(): void {
    this.handlers.clear();
  }
}