import { apiConfig } from './apiConfig';

const getAPIBaseUrl = () => apiConfig.getBaseUrl();

const handleResponse = async (response) => {
    if (!response.ok) {
        const errorData = await response.json().catch(() => ({}));
        const errorMessage = errorData.msg || `Error: ${response.status} ${response.statusText}`;
        throw new Error(errorMessage);
    }
    return response.json();
};

export const gameJoinAPI = {
    joinGame: async (gameId, playerName, password = '') => {
        const BASE_URL = getAPIBaseUrl(); // url dinamica
        const headers = {
            'Content-Type': 'application/json',
            'player': playerName
        };

        if (password) {
            headers['password'] = password;
        }

        const config = {
            method: 'PUT',
            headers: headers,
            body: JSON.stringify({ player: playerName })
        };

        console.log('Uniendose a un juego en:', BASE_URL);
        const response = await fetch(`${BASE_URL}/api/games/${gameId}/`, config);
        return handleResponse(response);
    },

    startGame: async (gameId, playerName, password = '') => {
        const BASE_URL = getAPIBaseUrl(); // url dinamica
        const headers = {
            'player': playerName
        };

        if (password) {
            headers['password'] = password;
        }

        const config = {
            method: 'HEAD',
            headers: headers
        };

        console.log('Empezando juego en:', BASE_URL);
        const response = await fetch(`${BASE_URL}/api/games/${gameId}/start`, config);

        if (!response.ok) {
            let errorMsg = response.headers.get('x-msg');
            if (!errorMsg) {
                switch (response.status) {
                    case 428:
                        errorMsg = 'Se necesitan al menos 5 jugadores para iniciar';
                        break;
                    case 409:
                        errorMsg = 'La partida ya ha sido iniciada';
                        break;
                    case 403:
                        errorMsg = 'No autorizado para iniciar la partida';
                        break;
                    case 401:
                        errorMsg = 'Credenciales inválidas';
                        break;
                    default:
                        errorMsg = `Error: ${response.status} ${response.statusText}`;
                }
            }
            throw new Error(errorMsg);
        }

        return { status: response.status, headers: Object.fromEntries(response.headers) };
    },

    getGame: async (gameId, playerName, password = '') => {
        const BASE_URL = getAPIBaseUrl();
        const player = (playerName ?? '').trim();
        const pass = (password ?? '').trim();

        if (!player) {
            throw new Error('getGame: missing player name for header');
        }

        const headers = {
            'Accept': 'application/json',
            'Content-Type': 'application/json',
            'player': player
        };
        if (pass) headers['password'] = pass;

        console.log('Agarrando juego de:', BASE_URL);
        const config = { method: 'GET', headers };
        const response = await fetch(`${BASE_URL}/api/games/${gameId}/`, config);
        return handleResponse(response);
    }
};