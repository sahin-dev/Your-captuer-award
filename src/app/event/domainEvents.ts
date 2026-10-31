import globalEventHandler from "./eventEmitter";

// Things that happened, announced so that other parts of the app can react
// without the announcing code knowing about them. Add new events here so the
// compiler checks every publish and listener. Listeners live in
// event/listeners/. A failing listener is logged and never fails the request.
//
// These events are in memory, so use them for work that is safe to lose, such as
// clearing a cache that also expires by itself. Work that must not be lost
// belongs on the pending work list (PendingWork/pendingWork.queue.ts).
export type DomainEvents = {
  // A user's coins, boosts, swaps or keys changed.
  "user.storeChanged": { userId: string };
  // A contest's set of photos changed, so its ranking is out of date.
  "contest.photosChanged": { contestId: string; userId: string };
};

export const publishEvent = <K extends keyof DomainEvents>(event: K, payload: DomainEvents[K]) =>
  globalEventHandler.publish(event, payload);

export const onEvent = <K extends keyof DomainEvents>(event: K, listener: (payload: DomainEvents[K]) => unknown) =>
  globalEventHandler.subscribe(event, listener);
