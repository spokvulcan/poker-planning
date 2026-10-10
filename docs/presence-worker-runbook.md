# Presence disconnect worker runbook

Presence marks someone offline when their tab stops heartbeating. `@convex-dev/presence` does this with a nested `@convex-dev/batch-worker` component running one worker named `disconnect`. Its functions appear in the dashboard and on the usage page as `presence/batchWorker/*`. None of its code lives in this repo: read it in `node_modules/@convex-dev/presence/src/component/public.ts` and `node_modules/@convex-dev/batch-worker/src/component/`.

## How it works

- Each heartbeat moves its session's `deadline` 2.5 heartbeat intervals ahead. The interval is 10 s, the `usePresence` default.
- `loop.loop` sleeps until the earliest deadline, then disconnects every session past it, 64 per run, and sleeps again. With no sessions it goes idle until a new session's heartbeat wakes it.
- `monitor.monitor` is a watchdog scheduled a minute after the loop's next run, and pushed back while the loop keeps running. It fires only when the loop missed its slot, and restarts the loop.

A healthy worker makes a few loop calls a minute while people are online, and almost no monitor calls.

## Read its state

`npx convex data` reads a component's tables with `--component`, and production with `--prod`. The CLI prints 64-bit integers as `123n`, which isn't JSON. `scripts/convex-data.mjs` runs the same command and prints JSON Lines instead:

```bash
node scripts/convex-data.mjs workers --prod --component presence/batchWorker
node scripts/convex-data.mjs workerState --prod --component presence/batchWorker
node scripts/convex-data.mjs _scheduled_functions --prod --component presence/batchWorker --limit 20
node scripts/convex-data.mjs sessions --prod --component presence --limit 200
```

- `workers.status`: `running`, `idle` or `stopped`.
- `workerState.runnerId` and `monitorId`: the scheduled loop run and the watchdog. While running, `monitorRunAtMs` lies in the future.
- `_scheduled_functions`: the latest runs, with their `scheduledTime` and `state`.
- `sessions.deadline`: no session should sit more than a minute past its deadline.

## Spot trouble

- **Spinning**: `_scheduled_functions` fills with `monitor.js:monitor` runs, several a second, all sharing one `scheduledTime` in the past. The usage page shows millions of `presence/batchWorker/monitor.monitor` calls. batch-worker 0.2.0 did this from 7 to 9 October 2026, costing about 1.9M function calls. 0.2.1 and later always schedule the watchdog in the future.
- **Wedged**: `status` is `running`, nothing is pending, and sessions sit past their deadline, so people who closed a tab stay online. Heartbeats can't wake a worker in this state.

## Restart it

```bash
npx convex run --prod --component presence/batchWorker lib:stop '{"name":"disconnect"}'
npx convex run --prod --component presence/batchWorker lib:start '{"name":"disconnect"}'
```

`stop` cancels the scheduled loop run and the watchdog. `start` schedules a fresh loop and watchdog, and the loop then disconnects the overdue sessions. Read the state again afterwards. Either `monitorRunAtMs` is in the future, or, with nobody online, the worker is `idle` with an empty `sessions` table.

## Version pin

An override in `package.json` keeps `@convex-dev/batch-worker` at 0.2.2 or later, within presence's own `^0.2.0` range. Remove it once presence depends on a newer batch-worker line.
