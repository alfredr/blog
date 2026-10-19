// Recordings for the Recording block, by id. The page decodes them and keeps
// them in the browser, and the worker gets a copy of each one a document uses.
const clips = new Map();
export function addClip(id, clip) {
    clips.set(id, clip);
}
export function clipFor(id) {
    return clips.get(id);
}
