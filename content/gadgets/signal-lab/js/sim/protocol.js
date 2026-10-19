// Messages between the page and simulation worker. The page sends documents,
// watched ports, and advance requests; the worker returns samples and
// timestamped readings. Resets increment an epoch so stale responses can be
// discarded.
export {};
