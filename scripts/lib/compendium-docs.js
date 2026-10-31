/**
 * Session cache of compendium Actor documents (pack.getDocument), shared by
 * token replacement and the D&D Beyond overwrite. Bounded FIFO: insertion
 * order eviction, no recency refresh.
 */
class CompendiumDocs {
  static #cache = new Map();
  static #MAX = 100;

  /** Compendium document for an index entry, through the bounded FIFO cache. */
  static async load(compendiumEntry, pack) {
    const docCacheKey = `${pack.collection}|${compendiumEntry._id}`;
    let compendiumActor = CompendiumDocs.#cache.get(docCacheKey);
    if (!compendiumActor) {
      compendiumActor = await pack.getDocument(compendiumEntry._id);
      if (CompendiumDocs.#cache.size >= CompendiumDocs.#MAX) {
        // Evict oldest entry (Map preserves insertion order)
        const oldest = CompendiumDocs.#cache.keys().next().value;
        CompendiumDocs.#cache.delete(oldest);
      }
      CompendiumDocs.#cache.set(docCacheKey, compendiumActor);
    }
    return compendiumActor;
  }

  static clear() {
    CompendiumDocs.#cache.clear();
  }

  static get size() {
    return CompendiumDocs.#cache.size;
  }
}

export { CompendiumDocs };
