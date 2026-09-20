// Contest lifecycle side effects are handled synchronously where they happen:
// vote side effects live in Vote/vote.service, and end-of-contest work runs
// through ContestFinalization/contestFinalization.service.
//
// The listeners that used to live here were no-ops that still hit the database
// on every event - and the NEW_VOTE one looked a ContestPhoto id up as a
// UserPhoto id, so it could never match. Because `emit` does not await async
// handlers, a failure inside one surfaced as an unhandled rejection, which the
// process-level handler in server.ts treats as fatal. Nothing publishes these
// events any more; reinstate a listener here only with its own error handling.
export {};
