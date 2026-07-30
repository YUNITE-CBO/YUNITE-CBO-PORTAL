import { InMemoryEventBus } from './events/bus/InMemoryEventBus';
import { SupabaseService } from './core/services/SupabaseService';
import { SupabaseStorageService } from './core/services/SupabaseStorageService';
declare const app: import("express-serve-static-core").Express;
declare const eventBus: InMemoryEventBus;
export { app, eventBus };
export { SupabaseService, SupabaseStorageService };
//# sourceMappingURL=main.d.ts.map