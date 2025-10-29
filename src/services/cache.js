const __memCache = new Map();
// no me acuerdo de donde usamos estos jp
export function getCache(key) {
    const entry = __memCache.get(key);
    if (!entry) return null;
    if (entry.expires && entry.expires <= Date.now()) {
        __memCache.delete(key);
        return null;
    }
    return entry;
}

export function setCache(key, body, ttlMs = 0) {
    __memCache.set(key, {
        body,
        expires: ttlMs > 0 ? Date.now() + ttlMs : 0
    });
}

export function invalidateCache(prefix) {
    for (const k of __memCache.keys()) {
        if (k.startsWith(prefix)) __memCache.delete(k);
    }
}
