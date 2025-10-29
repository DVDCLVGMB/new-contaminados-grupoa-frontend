import { apiConfig } from './apiConfig';

const getAPIBaseUrl = () => apiConfig.getBaseUrl();

export const gameCreateAPI = {
    createGame: async (gameData) => {
        try {
            const API_BASE_URL = getAPIBaseUrl(); // para la URL dinamica
            const { name, owner, password } = gameData;

            if (!name || !name.trim()) {
                throw new Error('El nombre de la partida es requerido');
            }

            if (name.length < 3 || name.length > 20) {
                throw new Error('El nombre de la partida debe tener entre 3 y 20 caracteres');
            }

            if (!owner || !owner.trim()) {
                throw new Error('El nombre del propietario es requerido');
            }

            if (owner.length < 3 || owner.length > 20) {
                throw new Error('El nombre del propietario debe tener entre 3 y 20 caracteres');
            }

            const requestBody = {
                name: name.trim(),
                owner: owner.trim()
            };

            if (password && password.trim()) {
                if (password.length < 3 || password.length > 20) {
                    throw new Error('La contraseña debe tener entre 3 y 20 caracteres');
                }
                requestBody.password = password.trim();
            }

            console.log('Creando juego en:', API_BASE_URL);
            console.log('Creando juego con esta data:', requestBody);

            const response = await fetch(`${API_BASE_URL}/api/games`, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    'Accept': 'application/json',
                },
                body: JSON.stringify(requestBody)
            });

            console.log('Server response:', {
                status: response.status,
                statusText: response.statusText,
                ok: response.ok
            });

            if (!response.ok) {
                let errorMessage = `Error ${response.status}: ${response.statusText}`;

                try {
                    const errorData = await response.json();
                    if (errorData.msg) errorMessage = errorData.msg;
                    if (errorData.message) errorMessage = errorData.message;
                } catch (e) {
                    const text = await response.text();
                    if (text) errorMessage = text;
                }

                throw new Error(errorMessage);
            }

            const responseData = await response.json();
            console.log('Full response del juegue creade:', responseData);

            const gameDataFromServer = responseData.data || responseData;

            const newGame = {
                id: gameDataFromServer.id,
                name: gameDataFromServer.name || requestBody.name,
                players: gameDataFromServer.players ?
                    (Array.isArray(gameDataFromServer.players) ?
                        gameDataFromServer.players.length :
                        gameDataFromServer.players) : 1,
                maxPlayers: 10,
                requiresPassword: gameDataFromServer.password || !!requestBody.password,
                status: gameDataFromServer.status || 'lobby',
                owner: requestBody.owner,
                currentRound: gameDataFromServer.currentRound,
                enemies: gameDataFromServer.enemies || []
            };

            console.log('Final game object:', newGame);
            return newGame;

        } catch (error) {
            console.error('Error creating game:', error);
            throw error;
        }
    }
};

export default gameCreateAPI;