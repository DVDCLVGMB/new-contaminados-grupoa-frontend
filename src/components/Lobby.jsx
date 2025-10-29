import React, { useState, useEffect } from 'react';
import { useNavigate } from "react-router-dom";
import { gameAPI } from '../services/api';
import { gameJoinAPI } from '../services/gameJoinAPI';
import { apiConfig } from '../services/apiConfig';
import CreateGameModal from './CreateGameModal';
import JoinGameModal from './Lobby/JoinGameModal';
import GameScreen from './GameScreen';
import '../styles/Lobby.css';

const Lobby = () => {
    const [games, setGames] = useState([]);
    const [searchTerm, setSearchTerm] = useState("");
    const [loading, setLoading] = useState(true);
    const [showCreateModal, setShowCreateModal] = useState(false);
    const [searchValidation, setSearchValidation] = useState("");
    const [showSpinner, setShowSpinner] = useState(false);
    const [showUserModal, setShowUserModal] = useState(true);
    const [username, setUsername] = useState("");
    const [userUrl, setUserUrl] = useState("");
    const [selectedGame, setSelectedGame] = useState(null);
    const [showJoinModal, setShowJoinModal] = useState(false);
    const [currentScreen, setCurrentScreen] = useState('lobby');
    const [currentGame, setCurrentGame] = useState(null);
    const [currentGamePassword, setCurrentGamePassword] = useState("");
    
    const navigate = useNavigate();

    const handleUserSubmit = (e) => {
        e.preventDefault();
        if (username.trim() && username.length >= 3 && userUrl.trim()) {
            // Validar formato de URL
            if (!userUrl.startsWith('http://') && !userUrl.startsWith('https://')) {
                alert('La URL debe comenzar con http:// o https://');
                return;
            }
            
            // Guardar datos
            sessionStorage.setItem("username", username.trim());
            localStorage.setItem("username", username.trim());
            sessionStorage.setItem("userUrl", userUrl.trim());
            localStorage.setItem("userUrl", userUrl.trim());
            
            // ACTUALIZAR URL GLOBAL EN LAS APIs
            apiConfig.setBaseUrl(userUrl.trim());
            
            setShowUserModal(false);
        }
    };

    const loadGames = async (search = "") => {
        try {
            setLoading(true);
            setShowSpinner(true);
            setSearchValidation("");

            let gamesData;

            if (search && search.length >= 3) {
                gamesData = await gameAPI.searchGames(search, "", 0, 100);
            } else {
                gamesData = await gameAPI.getAllGames(search);
            }

            setGames(gamesData);
        } catch (err) {
            console.error('Error loading games:', err);
            setGames([]);
        } finally {
            setLoading(false);
            setShowSpinner(false);
        }
    };

    useEffect(() => {
        // Carga tanto username como URL guardados
        const savedUsername = sessionStorage.getItem("username") || localStorage.getItem("username");
        const savedUrl = sessionStorage.getItem("userUrl") || localStorage.getItem("userUrl");
        
        if (savedUsername) {
            setUsername(savedUsername);
        }
        
        if (savedUrl) {
            setUserUrl(savedUrl);
            // ACTUALIZAR URL GLOBAL AL CARGAR
            apiConfig.setBaseUrl(savedUrl);
        }
        
        // Solo ocultar modal si ambos están presentes
        if (savedUsername && savedUrl) {
            setShowUserModal(false);
        }
    }, []);

    useEffect(() => {
        if (!showUserModal) {
            loadGames();
        }
    }, [showUserModal]);

    useEffect(() => {
        if (showUserModal) return;

        const delaySearch = setTimeout(() => {
            if (searchTerm && searchTerm.length > 0) {
                if (searchTerm.length < 3) {
                    setSearchValidation('La busqueda requiere al menos 3 caracteres');
                    return;
                } else if (searchTerm.length > 20) {
                    setSearchValidation('La busqueda no puede exceder 20 caracteres');
                    return;
                } else {
                    setSearchValidation("");
                }
            } else {
                setSearchValidation("");
            }
            loadGames(searchTerm);
        }, 500);

        return () => clearTimeout(delaySearch);
    }, [searchTerm, showUserModal]);

    const handleRefresh = () => {
        if (searchTerm && (searchTerm.length < 3 || searchTerm.length > 20)) {
            setSearchValidation(
                searchTerm.length < 3
                    ? 'La busqueda requiere al menos 3 caracteres'
                    : 'La busqueda no puede exceder 20 caracteres'
            );
            return;
        }
        setSearchValidation("");
        loadGames(searchTerm);
    };

    const handleClearSearch = () => {
        setSearchTerm("");
        setSearchValidation("");
        loadGames();
    };

    const handleGameCreated = (newGame) => {
        console.log('Nueva partida creada:', newGame);
        setShowCreateModal(false);
        
        sessionStorage.setItem(`playerName:${newGame.id}`, username);
        if (newGame.password) {
            sessionStorage.setItem(`gamePassword:${newGame.id}`, newGame.password);
            setCurrentGamePassword(newGame.password);
        }

        setCurrentGame({
            ...newGame,
            id: newGame.id,
            status: 'lobby',
            name: newGame.name,
            players: [username],
            owner: username,
            password: newGame.password || ""
        });
        setCurrentScreen('game');

        loadGames(searchTerm);
    };

    const handleJoinClick = (game) => {
        setSelectedGame(game);
        setShowJoinModal(true);
    };

    const handleGameJoined = (game, updatedGame, password = "") => {
        console.log('Usuario se unió a la partida:', game.id);
        setShowJoinModal(false);
        setSelectedGame(null);
        loadGames(searchTerm);

        sessionStorage.setItem(`playerName:${game.id}`, username);
        if (password) {
            sessionStorage.setItem(`gamePassword:${game.id}`, password);
            setCurrentGamePassword(password);
        }

        setCurrentGame({
            ...updatedGame,
            id: game.id,
            name: game.name,
            players: updatedGame.players || game.players,
            status: updatedGame.status || 'lobby',
            owner: game.owner,
            password: password
        });
        setCurrentScreen('game');
    };

    const handleBackToLobby = () => {
        setCurrentScreen('lobby');
        setCurrentGame(null);
        setCurrentGamePassword("");
        loadGames();
    };

    const getStatusColor = (game) => {
        if (game.status === 'playing' || game.status === 'rounds') return '#FF9800';
        if (game.players >= game.maxPlayers) return '#f44336';
        return '#4CAF50';
    };

    const getStatusText = (game) => {
        if (game.status === 'playing' || game.status === 'rounds') return 'En progresso';
        if (game.players >= game.maxPlayers) return 'Llena';
        return 'Esperando jugadores';
    };

    if (currentScreen === 'game' && currentGame) {
        return (
            <GameScreen
                game={currentGame}
                username={username}
                onBackToLobby={handleBackToLobby}
                gamePassword={currentGame.password || currentGamePassword}
            />
        );
    }

    return (
        <div className="lobby-container">
            {showUserModal && (
                <div className="user-modal-overlay">
                    <div className="user-modal">
                        <div className="user-modal-content">
                            <div className="user-modal-header">
                                <h2>Bienvenido a <span className="game-title-modal">contaminaDOS</span></h2>
                                <p className="modal-subtitle">Ingresa tu usuario y URL para comenzar la aventura</p>
                            </div>

                            <form onSubmit={handleUserSubmit} className="user-form">
                                <div className="input-container">
                                    <input
                                        type="text"
                                        placeholder="Escribe tu nombre de usuario (minimo 3 caracteres)..."
                                        value={username}
                                        onChange={(e) => setUsername(e.target.value)}
                                        className={`user-input ${username && username.length < 3 ? 'input-error' : ''}`}
                                        autoFocus
                                        maxLength={20}
                                    />
                                    <div className="input-underline"></div>
                                    {username && username.length < 3 && (
                                        <div className="validation-message error">
                                            El nombre debe tener al menos 3 caracteres
                                        </div>
                                    )}
                                    {username && (
                                        <div className={`character-count ${username.length < 3 ? 'count-error' : ''}`}>
                                            {username.length}/20 {username.length < 3 && '(minimo 3)'}
                                        </div>
                                    )}
                                </div>

                                <div className="input-container">
                                    <input
                                        type="text"
                                        placeholder="Ingresa tu URL (debe comenzar con http:// o https://)..."
                                        value={userUrl}
                                        onChange={(e) => setUserUrl(e.target.value)}
                                        className={`user-input ${userUrl && (!userUrl.startsWith('http://') && !userUrl.startsWith('https://')) ? 'input-error' : ''}`}
                                        maxLength={200}
                                    />
                                    <div className="input-underline"></div>
                                    {userUrl && (!userUrl.startsWith('http://') && !userUrl.startsWith('https://')) && (
                                        <div className="validation-message error">
                                            La URL debe comenzar con http:// o https://
                                        </div>
                                    )}
                                    {userUrl && (
                                        <div className={`character-count ${(!userUrl.startsWith('http://') && !userUrl.startsWith('https://')) ? 'count-error' : ''}`}>
                                            {userUrl.length}/200
                                        </div>
                                    )}
                                    <div className="url-example">
                                        Ejemplo: https://tu-servidor.com
                                    </div>
                                </div>

                                <button
                                    type="submit"
                                    className={`btn-accept ${!username.trim() || username.length < 3 || !userUrl.trim() || (!userUrl.startsWith('http://') && !userUrl.startsWith('https://')) ? 'btn-disabled' : ''}`}
                                    disabled={!username.trim() || username.length < 3 || !userUrl.trim() || (!userUrl.startsWith('http://') && !userUrl.startsWith('https://'))}
                                >
                                    <span>Ingresar al Lobby</span>
                                    <div className="btn-arrow">{'>'}</div>
                                </button>
                            </form>

                            <div className="modal-footer">
                                <p>¡Prepárate para salvar o destruir a la comunidad!</p>
                            </div>
                        </div>
                    </div>
                </div>
            )}

            {!showUserModal && (
                <>
                    <div className="lobby-header">
                        <div className="header-content">
                            <h1 className="game-title">contaminaDOS</h1>
                            <p className="game-subtitle">Salva o destruye a la comunidad</p>
                            <div className="user-welcome">
                                <span className="welcome-text">Bienvenido,</span>
                                <h3 className="username-display">{username}</h3>
                                {/* Mostrar URL actual */}
                                <div className="user-url-display">
                                    <small>Conectado a: {userUrl}</small>
                                </div>
                            </div>
                        </div>
                    </div>

                    <div className="lobby-controls">
                        <div className="search-container">
                            <div className="search-wrapper">
                                <input
                                    type="text"
                                    placeholder="Buscar partida por nombre..."
                                    value={searchTerm}
                                    onChange={(e) => setSearchTerm(e.target.value)}
                                    className={`search-input ${searchValidation ? 'input-error' : ''}`}
                                    maxLength={20}
                                />
                            </div>
                            {searchValidation && (
                                <div className="validation-message error">
                                    {searchValidation}
                                </div>
                            )}
                            {searchTerm && (
                                <div className={`character-count ${searchTerm.length < 3 || searchTerm.length > 20 ? 'count-error' : ''}`}>
                                    {searchTerm.length}/20
                                </div>
                            )}
                        </div>

                        <div className="action-buttons">
                            <button
                                className="btn btn-clear"
                                onClick={handleClearSearch}
                                disabled={showSpinner}
                            >
                                Limpiar
                            </button>
                            <button
                                className="btn btn-refresh"
                                onClick={handleRefresh}
                                disabled={showSpinner || searchValidation}
                            >
                                {showSpinner ? 'Cargando...' : 'Actualizar'}
                            </button>
                            <button
                                className="btn btn-create"
                                onClick={() => setShowCreateModal(true)}
                                disabled={showSpinner}
                            >
                                Crear Partida
                            </button>
                        </div>
                    </div>

                    {showCreateModal && (
                        <CreateGameModal
                            onClose={() => setShowCreateModal(false)}
                            onGameCreated={handleGameCreated}
                            username={username}
                        />
                    )}

                    {showJoinModal && selectedGame && (
                        <JoinGameModal
                            game={selectedGame}
                            onClose={() => {
                                setShowJoinModal(false);
                                setSelectedGame(null);
                            }}
                            onGameJoined={handleGameJoined}
                            username={username}
                        />
                    )}

                    {showSpinner && (
                        <div className="loading-state">
                            <div className="spinner"></div>
                            <p>Cargando partidas...</p>
                        </div>
                    )}

                    {!showSpinner && (
                        <div className="games-section">
                            <div className="section-header">
                                <h2>Partidas Disponibles</h2>
                                <div className="section-info">
                                    <span className="games-count">{games.length} partida{games.length !== 1 ? 's' : ''} encontrada{games.length !== 1 ? 's' : ''}</span>
                                    {searchTerm && !searchValidation && (
                                        <span className="search-info">
                                            Buscando: "{searchTerm}"
                                        </span>
                                    )}
                                </div>
                            </div>

                            {games.length > 0 ? (
                                <div className="games-grid">
                                    {games.map(game => {
                                        const statusColor = getStatusColor(game);
                                        const statusText = getStatusText(game);

                                        return (
                                            <div key={game.id} className="game-card">
                                                <div className="game-header">
                                                    <h3 className="game-name">{game.name}</h3>
                                                    <div className="game-badges">
                                                        {game.requiresPassword && <span className="lock-badge" title="Partida con contraseña">Privada</span>}
                                                        <span
                                                            className="status-badge"
                                                            style={{ backgroundColor: statusColor }}
                                                        >
                                                            {statusText}
                                                        </span>
                                                    </div>
                                                </div>

                                                <div className="game-info">
                                                    <div className="players-info">
                                                        <span className="players-count">Jugadores: {game.players}/{game.maxPlayers}</span>
                                                        <div className="progress-bar">
                                                            <div
                                                                className="progress-fill"
                                                                style={{ width: `${(game.players / game.maxPlayers) * 100}%` }}
                                                            ></div>
                                                        </div>
                                                    </div>

                                                    <div className="game-id">
                                                        <small>ID: {game.id}</small>
                                                    </div>
                                                </div>

                                                <div className="game-actions">
                                                    <button
                                                        className="btn-join"
                                                        onClick={() => handleJoinClick(game)}
                                                        disabled={game.status === 'playing' || game.players >= game.maxPlayers}
                                                    >
                                                        {game.status === 'playing' || game.players >= game.maxPlayers ? 'Ver' : 'Unirse'}
                                                    </button>
                                                </div>
                                            </div>
                                        );
                                    })}
                                </div>
                            ) : (
                                <div className="empty-state">
                                    <h3>No hay partidas disponibles</h3>
                                    <p>
                                        {searchTerm && !searchValidation
                                            ? `No se encontraron partidas con "${searchTerm}"`
                                            : 'Se el primero en crear una partida y comienza la aventura'
                                        }
                                    </p>
                                    <button
                                        className="btn btn-create-empty"
                                        onClick={() => setShowCreateModal(true)}
                                    >
                                        Crear primera partida
                                    </button>
                                </div>
                            )}
                        </div>
                    )}
                </>
            )}
        </div>
    );
};

export default Lobby;