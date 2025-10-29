import { apiConfig } from './apiConfig';

const getAPIBaseUrl = () => apiConfig.getBaseUrl();

export const buildHeaders = ({ 
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

export function invalidateCache(key) {
    if (!key) return;
    _cache.delete(key);
}

export const parseError = async (response) => {
    const headerMsg = response.headers.get('X-Msg') || response.headers.get('x-msg');
    if (headerMsg) return headerMsg;

    let jsonMsg = '';
    try {
        const data = await response.clone().json();
        jsonMsg = data?.msg || '';
    } catch (_) { }

    if (jsonMsg) return jsonMsg;

    switch (response.status) {
        case 401: return 'Credenciales inválidas';
        case 403: return 'No autorizado para esta acción';
        case 404: return 'Recurso no encontrado';
        case 409: return 'Acción inválida para la fase actual';
        case 428: return 'Condición previa no satisfecha';
        default: return `Error: ${response.status} ${response.statusText}`;
    }
};

export const handleJSON = async (response) => {
    if (!response.ok) {
        const message = await parseError(response);
        throw new Error(message);
    }
    return response.json();
};

const _cache = new Map();

export function getCache(key) {
    return key ? (_cache.get(key) || null) : null;
}

export function setCache(key, { etag = null, body }) {
    if (!key) return;
    _cache.set(key, { etag, body, timestamp: Date.now() });
}

export async function fetchJSON(url, { method = 'GET', headers, signal, cacheKey } = {}) {
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
}

export const gameAPI = {
    searchGames: async (name = "", status = "", page = 0, limit = 100) => {
        try {
            const API_BASE_URL = getAPIBaseUrl();
            const params = new URLSearchParams();

            if (name && name.length >= 3 && name.length <= 20) {
                params.append('name', name);
            }

            if (status) {
                params.append('status', status);
            }

            if (page > 0) {
                params.append('page', page.toString());
            }

            if (limit > 0 && limit <= 200) {
                params.append('limit', limit.toString());
            } else {
                params.append('limit', '100');
            }

            const url = `${API_BASE_URL}/api/games?${params.toString()}`;
            console.log('Fetcheando juegos de:', url);

            const response = await fetch(url, {
                method: 'GET',
                headers: {
                    'Accept': 'application/json',
                    'Content-Type': 'application/json',
                },
            });

            console.log('Response status:', response.status, response.statusText);

            if (!response.ok) {
                console.warn('Error del servidor:', response.status);
                return [];
            }

            const data = await response.json();
            console.log('API response data:', data);

            let games = [];

            if (data.data && Array.isArray(data.data)) {
                games = data.data.map(game => ({
                    id: game.id,
                    name: game.name,
                    players: game.players ? game.players.length : 0,
                    maxPlayers: 10,
                    requiresPassword: game.password || false,
                    status: game.status || 'lobby',
                    owner: game.players && game.players.length > 0 ? game.players[0] : 'Unknown',
                    currentRound: game.currentRound,
                    enemies: game.enemies || []
                }));
            }

            console.log('Juegos procesados:', games.length);
            return games;
        } catch (error) {
            console.error('Error buscando juegos:', error);
            return [];
        }
    },

    getAllGames: async (name = "") => {
        try {
            let allGames = [];
            let currentPage = 0;
            let hasMore = true;
            const limit = 100;

            while (hasMore) {
                console.log(`Cargando pagina ${currentPage}...`);

                const games = await gameAPI.searchGames(name, "", currentPage, limit);

                if (games.length == 0) {
                    hasMore = false;
                } else {
                    allGames = [...allGames, ...games];
                    currentPage++;
                }

                if (games.length < limit) {
                    hasMore = false;
                }
            }

            console.log(`Total de juegos cargados: ${allGames.length}`);
            return allGames;
        } catch (error) {
            console.error('Error cargando todes les juegues:', error);
            return [];
        }
    },

    getGameDetails: async (gameId, playerName, password = '') => {
        try {
            const API_BASE_URL = getAPIBaseUrl();
            const headers = {
                'Accept': 'application/json',
                'Content-Type': 'application/json',
                'player': playerName
            };

            if (password) {
                headers['password'] = password;
            }

            const url = `${API_BASE_URL}/api/games/${gameId}/`;
            console.log(`Consultando estado de partida ${gameId} para ${playerName}`);

            const response = await fetch(url, {
                method: 'GET',
                headers: headers
            });

            console.log('Response status del game details:', response.status, response.statusText);

            if (!response.ok) {
                const errorText = await response.text();
                console.warn(`Error en consulta de estado: ${response.status}`, errorText);
                let errorData;
                try {
                    errorData = JSON.parse(errorText);
                } catch {
                    errorData = { msg: errorText || `Error: ${response.status} ${response.statusText}` };
                }
                throw new Error(errorData.msg || `Error: ${response.status} ${response.statusText}`);
            }

            const data = await response.json();
            console.log(`Estado de partida ${gameId}: ${data.data?.status}`);

            return data;
        } catch (error) {
            console.error('Error fetcheando detalles de juego:', error);
            throw error;
        }
    }
};