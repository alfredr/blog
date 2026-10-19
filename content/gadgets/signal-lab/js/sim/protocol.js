// Messages between the page and the simulation worker, which runs the document
// as a stream. The page loads documents, says which ports it watches, and asks
// the stream to advance a little ahead of the playhead; the worker answers with
// the watched ports' samples and the readings, stamped with the stream's time.
// A reset starts a new epoch, and the page drops anything from an older one.
export {};
