export interface BattleEventMap {
  "battle.prepStarted": { levelId: string };
  "wave.started": { index: number };
  "wave.ended": { index: number };
  "battle.settled": { victory: boolean; wavesCleared: number; totalSteps: number };
}

type EventHandler<K extends keyof BattleEventMap> = (payload: BattleEventMap[K]) => void;
type StoredEventHandler = (payload: unknown) => void;

export class EventBus {
  private readonly handlers = new Map<keyof BattleEventMap, Set<StoredEventHandler>>();

  on<K extends keyof BattleEventMap>(type: K, handler: EventHandler<K>): () => void {
    let handlers = this.handlers.get(type);

    if (!handlers) {
      handlers = new Set<StoredEventHandler>();
      this.handlers.set(type, handlers);
    }

    const storedHandler = (payload: unknown): void => {
      handler(payload as BattleEventMap[K]);
    };

    handlers.add(storedHandler);

    return () => {
      handlers.delete(storedHandler);
    };
  }

  emit<K extends keyof BattleEventMap>(type: K, payload: BattleEventMap[K]): void {
    const handlers = this.handlers.get(type);

    if (!handlers) {
      return;
    }

    for (const handler of handlers) {
      handler(payload);
    }
  }
}
