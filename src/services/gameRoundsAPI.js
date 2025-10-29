// gameRoundsAPI.js
import { apiConfig } from './apiConfig';

const getAPIBaseUrl = () => apiConfig.getBaseUrl();

const MAX_ROUNDS = 5;
const STATUSES = ['waiting-on-leader', 'voting', 'waiting-on-group', 'ended'];
const RESULTS = ['none', 'citizens', 'enemies'];
const PHASES = ['vote1', 'vote2', 'vote3'];

// ✅ CORREGIDO: Importaciones simplificadas
// Elimina estas líneas problemáticas:
// import { buildHeaders, fetchJSON, handleJSON, setCache } from './api';
// import { getCache } from './cache';

// ✅ REEMPLAZA con funciones locales simplificadas
const buildHeaders = ({ 
    player,
    password, 
    json,
    ifNoneMatch,
    idempotencyKey,
} = {}) => {
    const headers = new Headers();
    headers.set('Accept', 'application/json');
    if (player) headers.set('player', player);
    if (password) headers.set('password', password);
    if (json) headers.set('Content-Type', 'application/json');
    if (ifNoneMatch) headers.set('If-None-Match', ifNoneMatch);
    if (idempotencyKey) headers.set('Idempotency-Key', idempotencyKey);
    return headers;
};

// Cache local simple
const _cache = new Map();
const getCache = (key) => key ? (_cache.get(key) || null) : null;
const setCache = (key, { etag = null, body }) => {
    if (!key) return;
    _cache.set(key, { etag, body, timestamp: Date.now() });
};

const fetchJSON = async (url, { method = 'GET', headers, signal, cacheKey } = {}) => {
    headers = headers instanceof Headers ? headers : new Headers(headers || {});
    headers.set('Accept', 'application/json');

    const cached = cacheKey ? getCache(cacheKey) : null;

    if (cacheKey && !headers.get('If-None-Match') && cached?.etag) {
        headers.set('If-None-Match', cached.etag);
    }

    const res = await fetch(url, { method, headers, signal });

    if (res.status === 304 && cacheKey && cached?.body) {
        return cached.body;
    }

    let body = null;
    try {
        body = await res.json();
    }
    catch (_) { }

    if (!res.ok) {
        const msg = (body && (body.msg || body.message)) || `${res.status} ${res.statusText}`;
        const err = new Error(msg);
        err.status = res.status;
        throw err;
    }

    if (cacheKey) {
        const etag = res.headers.get('ETag') || res.headers.get('Etag') || res.headers.get('etag');
        setCache(cacheKey, { etag, body });
    }

    return body;
};

const handleResponse = async (response) => {
    if (!response.ok) {
        const errorData = await response.json().catch(() => ({}));
        const errorMessage = errorData.msg || `Error: ${response.status} ${response.statusText}`;
        throw new Error(errorMessage);
    }
    return response.json();
};

// ... el resto de las funciones auxiliares permanecen igual ...
function isRoundLike(x) {
    return x && typeof x === 'object' &&
        typeof x.id === 'string' &&
        typeof x.leader === 'string' &&
        STATUSES.includes(x.status) &&
        RESULTS.includes(x.result) &&
        PHASES.includes(x.phase) &&
        Array.isArray(x.group) &&
        Array.isArray(x.votes);
}

function normalizeRound(raw) {
    return {
        id: String(raw.id).trim(),
        leader: String(raw.leader).trim(),
        status: raw.status,
        result: raw.result,
        phase: raw.phase,
        group: raw.group.map(p => String(p).trim()).filter(Boolean),
        votes: raw.votes.filter(v => typeof v === 'boolean')
    };
}

function dedupeById(rounds) {
    const seen = new Set();
    const out = [];
    for (const r of rounds) {
        if (!seen.has(r.id)) {
            seen.add(r.id);
            out.push(r);
        }
    }
    return out;
}

function readRoundSnapshot(gameId, roundId) {
    const specific = getCache(`round:${gameId}:${roundId}`);
    if (specific?.body?.data && specific.body.data.id === roundId) {
        return specific.body;
    }

    const list = getCache(`rounds-list:${gameId}`);
    const arr = list?.body?.data;
    if (Array.isArray(arr)) {
        const match = arr.find(r => r && r.id === roundId);
        if (match) {
            return { status: 200, msg: 'From list cache', data: match };
        }
    }

    return null;
}

export const gameRoundsAPI = {
    getRounds: async (gameId, playerName, password = '') => {
        const BASE_URL = getAPIBaseUrl();
        if (!gameId || !gameId.trim()) throw new Error('gameId no encontrada.');
        if (!playerName || !playerName.trim()) throw new Error('playerName no encontrado.');

        const cacheKey = `rounds-list:${gameId}:${playerName}`;
        const controller = new AbortController();
        const signal1 = controller.signal;
        const headers = buildHeaders({
            'player': playerName,
            password,
        });
        const thisURL = `${BASE_URL}/api/games/${gameId}/rounds`

        console.log('Getting rounds from:', BASE_URL);
        const res = await fetchJSON(thisURL, { method: 'GET', headers, signal1, cacheKey });

        let envelope;
        if (res && typeof res === 'object' && Array.isArray(res.data)) {
            envelope = res;
        } else if (Array.isArray(res)) {
            envelope = { status: 200, msg: 'Rounds found', data: res };
        } else {
            throw new Error('Malformed server response: se esperaba un arreglo o { data [] }');
        }

        if (!Array.isArray(envelope.data)) {
            throw new Error('Malformed server response: "data" debe ser un arreglo');
        }

        const normalized = envelope.data.filter(isRoundLike).map(normalizeRound);
        const unique = dedupeById(normalized);
        const capped = unique.slice(0, MAX_ROUNDS);

        return {
            status: envelope.status ?? 200,
            msg: envelope.msg ?? 'Rounds found',
            data: capped
        };
    },

    showRound: async (gameId, roundId, playerName, password = '', opts = {}) => {
        const BASE_URL = getAPIBaseUrl();
        const { preferCache = true, onUpdate, signal } = opts;

        if (!gameId || !gameId.trim()) throw new Error('gameId no encontrada.');
        if (!roundId || !roundId.trim()) throw new Error('roundId no encontrada');
        if (!playerName || !playerName.trim()) throw new Error('playerName no encontrado.');

        const thisURL = `${BASE_URL}/api/games/${gameId}/rounds/${roundId}`;
        const cacheKey = `round:${gameId}:${roundId}:${playerName}`;

        const headers = buildHeaders({
            player: playerName,
            password,
        });

        console.log('Showing round from:', BASE_URL);

        if (preferCache) {
            const snapshot = readRoundSnapshot(gameId, roundId);
            if (snapshot) {
                fetchJSON(thisURL, { method: 'GET', headers, signal, cacheKey })
                    .then(fresh => {
                        if (onUpdate && JSON.stringify(fresh) !== JSON.stringify(snapshot)) {
                            onUpdate(fresh);
                        }
                    })
                    .catch(() => { });
                return snapshot;
            }
        }

        return fetchJSON(thisURL, { method: 'GET', headers, signal, cacheKey });
    },

    // ... el resto de las funciones (proposeGroup, voteForGroup, submitAction) permanecen igual ...
    proposeGroup: async function proposeGroup(
        gameId,
        roundId,
        groupArray,
        playerName,
        password = '',
        { idempotencyKey, signal, etag } = {}
    ) {
        const BASE_URL = getAPIBaseUrl();
        console.log('[proposeGroup] called', { BASE_URL, gameId, roundId, groupArray, playerName });

        if (!gameId || !gameId.trim()) throw new Error('gameId es requerido');
        if (!roundId || !roundId.trim()) throw new Error('roundId es requerido');
        if (!playerName || !playerName.trim()) throw new Error('playerName es requerido');
        if (!Array.isArray(groupArray)) throw new Error('El cuerpo del grupo debe ser un arreglo');

        const seen = new Set();
        const normalizedGroup = [];
        for (const name of groupArray) {
            const n = String(name || '').trim();
            if (n && !seen.has(n)) {
                seen.add(n);
                normalizedGroup.push(n);
            }
        }
        
        if (normalizedGroup.length === 0) {
            throw new Error('El grupo no puede estar vacío');
        }

        const detailURL = `${BASE_URL}/api/games/${gameId}/rounds/${roundId}`;
        const listURL = `${BASE_URL}/api/games/${gameId}/rounds`;
        const roundCacheKey = `round:${gameId}:${roundId}`;
        const listCacheKey = `rounds-list:${gameId}`;

        const headers = buildHeaders({
            player: playerName,
            password,
            json: true,
            idempotencyKey
        });

        const pre = await fetchJSON(detailURL, { method: 'GET', headers, signal, cacheKey: roundCacheKey });
        const current = pre && pre.data ? pre.data : null;
        if (!current) throw new Error('No se pudo cargar el estado actual del round.');

        if (current.status !== 'waiting-on-leader') {
            throw new Error('No se puede proponer grupo en el estado actual del round.');
        }

        if (etag) headers.set && headers.set('If-Match', etag);

        const patchRes = await fetch(detailURL, {
            method: 'PATCH',
            headers,
            body: JSON.stringify({ group: normalizedGroup }),
            signal
        });

        if (!patchRes.ok) {
            let msg = `${patchRes.status} ${patchRes.statusText}`;
            try {
                const errBody = await patchRes.json();
                if (errBody && (errBody.msg || errBody.message)) msg = errBody.msg || errBody.message;
            } catch (_) {}
            const err = new Error(msg);
            err.status = patchRes.status;
            throw err;
        }
        setCache(`round:${gameId}:${roundId}:${playerName}`, { etag: null, body: null });
        setCache(`rounds-list:${gameId}:${playerName}`, { etag: null, body: null });

        const updatedDetail = await fetchJSON(detailURL, { method: 'GET', headers, signal, cacheKey: roundCacheKey });

        fetchJSON(listURL, { method: 'GET', headers, signal, cacheKey: listCacheKey }).catch(() => { });

        return updatedDetail;
    },

    voteForGroup: async function voteForGroup(
        gameId,
        roundId,
        vote,
        playerName,
        password = '',
        { idempotencyKey, signal, etag } = {}
    ) {
        const BASE_URL = getAPIBaseUrl();
        console.log('[voteForGroup] called', { BASE_URL, gameId, roundId, vote, playerName });
        
        let finalPlayer = playerName || '';
        try {
            if (typeof location !== 'undefined') {
                const as = new URL(location.href).searchParams.get('as');
                if (as && as.trim()) finalPlayer = as.trim();
            }
            if (!finalPlayer && typeof sessionStorage !== 'undefined') {
                const ss = sessionStorage.getItem(`playerName:${gameId}`)
                    || sessionStorage.getItem(`player:${gameId}`);
                if (ss && ss.trim()) finalPlayer = ss.trim();
            }
        } catch { }
        
        if (!gameId || !gameId.trim()) throw new Error('gameId es requerido');
        if (!roundId || !roundId.trim()) throw new Error('roundId es requerido');
        if (!playerName || !playerName.trim()) throw new Error('playerName es requerido');
        if (typeof vote !== 'boolean') throw new Error('El voto debe ser un valor booleano (true/false)');

        const base = (BASE_URL || '').replace(/\/+$/, '');
        const detailURL = `${base}/api/games/${encodeURIComponent(gameId)}/rounds/${encodeURIComponent(roundId)}`;

        const headers = {
            'Accept': 'application/json',
            'Content-Type': 'application/json',
            'player': finalPlayer.trim()
        };
        
        if (password && password.trim()) {
            headers['password'] = password.trim();
        }

        if (etag) {
            headers['If-Match'] = etag;
        }
        
        if (idempotencyKey) {
            headers['Idempotency-Key'] = idempotencyKey;
        }

        const body = { vote };

        console.log('[voteForGroup] POST', detailURL, body);

        const res = await fetch(detailURL, {
            method: 'POST',         
            headers,
            body: JSON.stringify(body),
            signal,
        });

        return handleResponse(res);
    },

    submitAction: async function submitAction(
        gameId,
        roundId,
        collaborate,
        playerName,
        password = '',
        { idempotencyKey, signal, etag } = {}
    ) {
        const BASE_URL = getAPIBaseUrl();
        if (!gameId || !gameId.trim()) throw new Error('gameId es requerido');
        if (!roundId || !roundId.trim()) throw new Error('roundId es requerido');
        if (!playerName || !playerName.trim()) throw new Error('playerName es requerido');
        if (typeof collaborate !== 'boolean')
            throw new Error('La acción debe ser un valor booleano (true/false)');

        const url = `${BASE_URL}/api/games/${encodeURIComponent(gameId)}/rounds/${encodeURIComponent(roundId)}`;

        const headers = {
            'Accept': 'application/json',
            'Content-Type': 'application/json',
            'player': playerName.trim()
        };
        
        if (password && password.trim()) {
            headers['password'] = password.trim();
        }

        if (etag) {
            headers['If-Match'] = etag;
        }
        
        if (idempotencyKey) {
            headers['Idempotency-Key'] = idempotencyKey;
        }

        const body = { action: collaborate };

        console.log('[submitAction request]', {method: 'PUT', url, body });

        const res = await fetch(url, {
            method: 'PUT',
            headers,
            body: JSON.stringify(body),
            signal
        });

        return handleResponse(res);
    }
};