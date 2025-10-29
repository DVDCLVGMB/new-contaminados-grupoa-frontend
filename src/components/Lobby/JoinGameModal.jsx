import React, { useState, useEffect } from 'react';
import { gameJoinAPI } from '../../services/gameJoinAPI';
import '../../styles/JoinGameModal.css';

const JoinGameModal = ({ game, onClose, onGameJoined, username }) => {
    const [password, setPassword] = useState("");
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState("");
    const [isAlreadyJoined, setIsAlreadyJoined] = useState(false);
    const [isOwner, setIsOwner] = useState(false);
    const [statusChecked, setStatusChecked] = useState(false);

    useEffect(() => {
        checkUserStatus();
    }, [game, username]);

    const checkUserStatus = async () => {
        try {
            const owner = game.owner === username;
            setIsOwner(owner);

            if (owner) {
                setIsAlreadyJoined(true);
                setStatusChecked(true);
                return;
            }

            try {
                const details = await gameJoinAPI.getGame(game.id, username, "");
                setIsAlreadyJoined(true);
            } catch (err) {
                setIsAlreadyJoined(false);
            }
        } catch (err) {
            console.error("Error verificando estado:", err);
            setIsAlreadyJoined(false);
        } finally {
            setStatusChecked(true);
        }
    };

    const handleJoin = async () => {
        try {
            setLoading(true);
            setError("");

            const joinPassword = game.requiresPassword ? password : "";

            console.log(`Uniéndose a partida ${game.id} como ${username}`, 
                joinPassword ? `(con contraseña: ${joinPassword})` : '(sin contraseña)');

            const result = await gameJoinAPI.joinGame(game.id, username, joinPassword);

            console.log('Unión exitosa a partida:', result.data);

            // Llamar a onGameJoined con la contraseña
            onGameJoined(game, result.data, joinPassword);

        } catch (err) {
            console.error('Error al unirse:', err);
            
            sessionStorage.removeItem(`playerName:${game.id}`);
            sessionStorage.removeItem(`gamePassword:${game.id}`);
            
            if (err.message.includes('403') || err.message.includes('Invalid credentials')) {
                setError('Credenciales inválidas. Verifica la contraseña.');
            } else if (err.message.includes('Failed to fetch')) {
                setError('Error de conexión. Verifica tu conexión a internet.');
            } else if (err.message.includes('already') || err.message.includes('Already')) {
                setError('Ya estás en esta partida.');
                setIsAlreadyJoined(true);
            } else {
                setError(err.message || 'Error al unirse a la partida');
            }
        } finally {
            setLoading(false);
        }
    };

    const handleStartGame = async () => {
        try {
            setLoading(true);
            setError("");

            console.log(`Iniciando partida ${game.id} como creador...`);

            const gamePassword = game.requiresPassword ? password : "";

            await gameJoinAPI.startGame(game.id, username, gamePassword);

            // Llamar onGameJoined con la contraseña
            onGameJoined(
                game,
                {
                    ...game,
                    status: 'rounds'
                },
                gamePassword // ENVIAR PASSWORD
            );

        } catch (err) {
            console.error('Error iniciando partida: ', err);
            
            if (err.message.includes('Failed to fetch')) {
                setError('Error de conexión. Verifica tu conexión a internet.');
            } else if (err.message.includes('403') || err.message.includes('Invalid credentials')) {
                setError('No autorizado para iniciar la partida.');
            } else if (err.message.includes('428')) {
                setError('Se necesitan al menos 5 jugadores para iniciar.');
            } else if (err.message.includes('409')) {
                setError('La partida ya ha sido iniciada.');
            } else {
                const errorMsg = err.message || 'Error al iniciar la partida';
                setError(errorMsg);
            }
        } finally {
            setLoading(false);
        }
    };

    const canStartGame = isOwner && isAlreadyJoined && game.players >= 5;
    const shouldShowPasswordField = game.requiresPassword && !isAlreadyJoined;
    const shouldShowJoinButton = !isOwner && !isAlreadyJoined;

    if (!statusChecked) {
        return (
            <div className="modal-overlay">
                <div className="modal-content join-game-modal">
                    <div className="loading-state">
                        <div className="spinner"></div>
                        <p>Verificando estado...</p>
                    </div>
                </div>
            </div>
        );
    }

    return (
        <div className="modal-overlay">
            <div className="modal-content join-game-modal">
                <div className="modal-header">
                    <h2>Unirse a {game.name}</h2>
                    <button className="close-btn" onClick={onClose}>×</button>
                </div>

                <div className="modal-body">
                    {error && (
                        <div className="error-message">
                            <strong>Error:</strong> {error}
                        </div>
                    )}

                    <div className="game-basic-info">
                        <p><strong>Jugadores:</strong> {game.players}/{game.maxPlayers}</p>
                        <p><strong>Estado:</strong> {game.status === 'lobby' ? 'En espera' : 'En progreso'}</p>
                        <p><strong>Tipo:</strong> {game.requiresPassword ? 'Privada' : 'Pública'}</p>

                        {isOwner && (
                            <div className="creator-notice">
                                <strong>Eres el creador de esta partida!</strong>
                                {game.players >= 5 && <span> - Puedes iniciar la partida</span>}
                                {game.players < 5 && <span> - Necesitas al menos 5 jugadores para iniciar</span>}
                            </div>
                        )}

                        {isAlreadyJoined && !isOwner && (
                            <div className="joined-notice">
                                Ya estás en esta partida
                            </div>
                        )}

                        {!isAlreadyJoined && game.requiresPassword && (
                            <div className="password-info">
                                Esta partida requiere contraseña para unirse
                            </div>
                        )}
                    </div>

                    {shouldShowPasswordField && (
                        <div className="input-group">
                            <label>Contraseña de la partida:</label>
                            <input
                                type="password"
                                value={password}
                                onChange={(e) => setPassword(e.target.value)}
                                placeholder="Ingresa la contraseña de la partida"
                                className="input-field"
                                disabled={loading}
                                autoFocus={game.requiresPassword}
                            />
                            <small className="password-hint">
                                Esta partida es privada. Necesitas la contraseña para {isOwner ? 'iniciarla' : 'unirte'}.
                            </small>
                        </div>
                    )}

                    {isOwner && game.requiresPassword && isAlreadyJoined && (
                        <div className="input-group">
                            <label>Contraseña de tu partida:</label>
                            <input
                                type="password"
                                value={password}
                                onChange={(e) => setPassword(e.target.value)}
                                placeholder="Contraseña de tu partida privada"
                                className="input-field"
                                disabled={loading}
                            />
                            <small className="password-hint">
                                Necesitas ingresar la contraseña para iniciar tu partida privada
                            </small>
                        </div>
                    )}
                </div>

                <div className="modal-actions">
                    <button className="btn btn-secondary" onClick={onClose} disabled={loading}>
                        Cancelar
                    </button>

                    {canStartGame && (
                        <button 
                            className="btn btn-success" 
                            onClick={handleStartGame} 
                            disabled={loading || (game.requiresPassword && !password.trim())}
                        >
                            {loading ? 'Iniciando...' : 'Iniciar Partida'}
                        </button>
                    )}

                    {shouldShowJoinButton && (
                        <button
                            className="btn btn-primary"
                            onClick={handleJoin}
                            disabled={loading || (shouldShowPasswordField && !password.trim())}
                        >
                            {loading ? 'Uniéndose...' : 'Unirse a Partida'}
                        </button>
                    )}

                    {isOwner && isAlreadyJoined && game.players < 5 && (
                        <div className="waiting-message">
                            Esperando más jugadores... ({game.players}/5)
                        </div>
                    )}

                    {isAlreadyJoined && !isOwner && (
                        <div className="waiting-message">
                            Esperando que el creador inicie la partida...
                        </div>
                    )}
                </div>
            </div>
        </div>
    );
};

export default JoinGameModal;