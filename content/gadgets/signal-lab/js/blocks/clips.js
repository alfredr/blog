// Recording data indexed by id. The page decodes and stores audio, then
// transfers the recordings used by a document to the worker.
const clips = new Map();
export function addClip(id, clip) {
    clips.set(id, clip);
}
export function clipFor(id) {
    return clips.get(id);
}
