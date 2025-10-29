import React, { useEffect, useRef, useState } from "react";
import { useLocation, useNavigate, useParams } from "react-router-dom";
import { gameAPI } from "../services/api";
import { gameJoinAPI } from "../services/gameJoinAPI";
import '../styles/GameScreen.css';

const GameScreen = ({
    game,
    username: usernameProp,
    onBackToLobby,
    gamePassword: passwordProp = "", // Recibir contraseña como prop
}) => {
    const [gameDetails, setGameDetails] = useState(null);
    const [loading, setLoading] = useState(true);
    const [starting, setStarting] = useState(false);
    const [authError, setAuthError] = useState("");

    const { gameId } = useParams();
    const navigate = useNavigate();
    const location = useLocation();
    const hasRedirectedRef = useRef(false);

    const getCredentials = () => {
        const gameIdToUse = game?.id ?? gameId;
        
        // prop 1: props recibidas
        // prop 2: sessionStorage específico del juego
        // prop 3: sessionStorage global
        const username = 
            usernameProp ??
            location.state?.username ??
            sessionStorage.getItem(`playerName:${gameIdToUse}`) ??
            sessionStorage.getItem("username") ??
            "";

        const gamePassword = 
            passwordProp ?? 
            location.state?.gamePassword ??
            sessionStorage.getItem(`gamePassword:${gameIdToUse}`) ??
            sessionStorage.getItem("gamePassword") ??
            "";

        console.log(`GameScreen Credenciales para ${gameIdToUse}:`, { 
            username, 
            hasPassword: !!gamePassword,
            source: passwordProp ? 'prop' : 
                   location.state?.gamePassword ? 'location.state' : 
                   sessionStorage.getItem(`gamePassword:${gameIdToUse}`) ? 'sessionStorage' : 'none'
        });

        return { username, gamePassword };
    };

    const [credentials, setCredentials] = useState({ username: "", gamePassword: "" });

    useEffect(() => {
        const creds = getCredentials();
        console.log("GameScreen: verificando credenciales: ", {
            gameId: game?.id ?? gameId,
            username: creds.username,
            hasPassword: !!creds.gamePassword,
            fromProp: !!passwordProp
        });

        if (!creds.username) {
            console.error("No se pudo obtener username para cargar la partida");
            setAuthError("No se pudo identificar al jugador. Vuelva al lobby.");
            setLoading(false);
            return;
        }

        if (game?.requiresPassword && !creds.gamePassword) {
            console.error("Partida privada sin contraseña");
            setAuthError("Esta partida es privada y no se encontró la contraseña. Vuelva a unirse.");
            setLoading(false);
            return;
        }

        setCredentials(creds);
        
        sessionStorage.setItem(`playerName:${game?.id ?? gameId}`, creds.username);
        if (creds.gamePassword) {
            sessionStorage.setItem(`gamePassword:${game?.id ?? gameId}`, creds.gamePassword);
            console.log(`Contraseña guardada en sessionStorage para ${game?.id ?? gameId}`);
        }

        loadGameDetails();
    }, [game?.id, gameId, passwordProp]);

    useEffect(() => {
        if (!credentials.username || hasRedirectedRef.current) return;

        const interval = setInterval(() => {
            loadGameDetails();
        }, 5000);

        return () => clearInterval(interval);
    }, [credentials.username, hasRedirectedRef.current]);

    const loadGameDetails = async () => {
        try {
            setAuthError("");
            
            if (!credentials.username) {
                console.warn("Esperando credenciales...");
                return;
            }

            console.log(`Consultando partida ${game?.id ?? gameId} para ${credentials.username}`);
            
            const details = await gameAPI.getGameDetails(
                game?.id ?? gameId,
                credentials.username,
                credentials.gamePassword
            );
            
            const d = details?.data || null;
            setGameDetails(d);
            setLoading(false);

            if (!hasRedirectedRef.current && d?.status === "rounds") {
                hasRedirectedRef.current = true;
                console.log(`Partida iniciada, redirigiendo a juego...`);

                const roomName = d?.name || location.state?.roomName || game?.name || "";
                const playersArr = Array.isArray(d?.players) ? d.players : [];
                
                navigate(`/game/${game?.id ?? gameId}`, {
                    replace: true,
                    state: {
                        username: credentials.username,
                        roomName,
                        players: playersArr,
                        playersCount: playersArr.length,
                        gamePassword: credentials.gamePassword, // PASAR PASSWORD
                    },
                });
            }
        } catch (err) {
            console.error("Error loading game details:", err);
            setLoading(false);
            
            if (err.message.includes("Invalid credentials") || err.message.includes("403")) {
                setAuthError("Credenciales inválidas. No tienes acceso a esta partida.");
                
                sessionStorage.removeItem(`playerName:${game?.id ?? gameId}`);
                sessionStorage.removeItem(`gamePassword:${game?.id ?? gameId}`);
                
            } else if (err.message.includes("Failed to fetch")) {
                setAuthError("Error de conexión. Verifica tu internet.");
            } else {
                setAuthError(err.message || "Error al cargar la partida");
            }
        }
    };

    const handleStartGame = async () => {
        try {
            setStarting(true);
            setAuthError("");
            
            await gameJoinAPI.startGame(
                game.id,
                credentials.username,
                credentials.gamePassword
            );

            const updatedDetails = await gameAPI.getGameDetails(
                game.id,
                credentials.username,
                credentials.gamePassword
            );
            
            setGameDetails(updatedDetails.data);

            navigate(`/game/${game.id}`, {
                replace: true,
                state: {
                    username: credentials.username,
                    roomName: updatedDetails?.data?.name || game?.name || "",
                    players: updatedDetails?.data?.players || [],
                    playersCount: updatedDetails?.data?.players?.length || 0,
                    gamePassword: credentials.gamePassword, // PASAR PASSWORD
                },
            });
        } catch (err) {
            console.error("Error al iniciar partida:", err);
            
            if (err.message.includes("Invalid credentials") || err.message.includes("403")) {
                setAuthError("No tienes permisos para iniciar esta partida.");
            } else if (err.message.includes("428")) {
                setAuthError("Se necesitan al menos 5 jugadores para iniciar.");
            } else if (err.message.includes("409")) {
                setAuthError("La partida ya ha sido iniciada.");
            } else {
                setAuthError(err.message || "Error desconocido al iniciar partida");
            }
        } finally {
            setStarting(false);
        }
    };

    if (loading && !authError) {
        return (
            <div className="game-screen-container">
                <div className="loading-state">
                    <div className="spinner"></div>
                    <p>Cargando partida...</p>
                    {credentials.username && (
                        <p className="muted">Conectando como: {credentials.username}</p>
                    )}
                </div>
            </div>
        );
    }

    if (authError) {
        return (
            <div className="game-screen-container">
                <div className="error-state">
                    <div className="error-icon">!!!</div>
                    <h3>Error de Acceso</h3>
                    <p>{authError}</p>
                    <div className="error-actions">
                        <button 
                            className="btn btn-primary"
                            onClick={onBackToLobby}
                        >
                            Volver al Lobby
                        </button>
                        <button 
                            className="btn btn-secondary"
                            onClick={() => {
                                setAuthError("");
                                setLoading(true);
                                loadGameDetails();
                            }}
                        >
                            Reintentar
                        </button>
                    </div>
                </div>
            </div>
        );
    }

    const displayGame = gameDetails || game;
    const isOwner = displayGame?.owner === credentials.username;
    const canStartGame = isOwner && 
                        (displayGame?.players?.length || 0) >= 5 && 
                        displayGame?.status === "lobby";

    return (
        <div className="game-screen-container">
            <div className="game-header">
                <div className="header-content">
                    <h1 className="game-title">contaminaDOS</h1>
                    <p className="game-subtitle">Sala de espera</p>
                </div>
            </div>

            <div className="game-info-section">
                <div className={`privacy-badge ${displayGame?.password ? 'private' : 'public'}`}>
                    {displayGame?.password ? 
                        "Partida privada" : 
                        "Partida pública"
                    }
                </div>

                <div className="game-basic-info">
                    <h2>{displayGame?.name}</h2>
                    <div className="info-grid">
                        <div className="info-item">
                            <span className="info-label">Estado:</span>
                            <span className="info-value">
                                {displayGame?.status === "rounds" ? "En Rondas" : "En Lobby"}
                            </span>
                        </div>
                        <div className="info-item">
                            <span className="info-label">Ronda Actual:</span>
                            <span className="info-value">
                                {displayGame?.currentRound || "1"}
                            </span>
                        </div>
                        <div className="info-item">
                            <span className="info-label">Tu usuario:</span>
                            <span className="info-value username-highlight">
                                {credentials.username}
                            </span>
                        </div>
                        {isOwner && (
                            <div className="info-item">
                                <span className="info-label">Rol:</span>
                                <span className="info-value owner-badge">Creador</span>
                            </div>
                        )}
                    </div>
                </div>

                <div className="players-section">
                    <h3>Jugadores en la Partida ({displayGame?.players?.length || 0})</h3>
                    <div className="players-grid">
                        {displayGame?.players?.map((player, index) => (
                            <div
                                key={index}
                                className={`player-card ${player === credentials.username ? "current-player" : ""}`}
                            >
                                <div className="player-avatar">
                                    {player?.charAt(0)?.toUpperCase()}
                                </div>
                                <div className="player-info">
                                    <span className="player-name">
                                        {player}
                                        {player === credentials.username && (
                                            <span className="you-badge"> (Tú)</span>
                                        )}
                                    </span>
                                    {displayGame?.owner === player && (
                                        <span className="owner-badge">Creador</span>
                                    )}
                                </div>
                            </div>
                        ))}
                    </div>
                </div>

                {displayGame?.enemies && displayGame.enemies.length > 0 && 
                 displayGame.enemies.includes(credentials.username) && (
                    <div className="enemies-section">
                        <h3>Psicópatas Conocidos</h3>
                        <div className="enemies-list">
                            {displayGame.enemies.map((enemy, index) => (
                                <div key={index} className="enemy-tag">
                                    {enemy}
                                </div>
                            ))}
                        </div>
                    </div>
                )}

                <div className="game-status">
                    <div className="status-card">
                        <h4>Estado del Juego</h4>
                        {displayGame?.status === "lobby" ? (
                            isOwner ? (
                                <div>
                                    <p>Eres el creador de esta partida.</p>
                                    {(displayGame?.players?.length || 0) >= 5 ? (
                                        <div>
                                            <p>Ya hay {displayGame.players.length} jugadores. Puedes iniciar la partida.</p>
                                            <button
                                                className="btn btn-success"
                                                onClick={handleStartGame}
                                                disabled={starting}
                                            >
                                                {starting ? "Iniciando..." : "Iniciar Partida"}
                                            </button>
                                        </div>
                                    ) : (
                                        <p>Esperando más jugadores... ({displayGame?.players?.length || 0}/5)</p>
                                    )}
                                </div>
                            ) : (
                                <p>Esperando que el creador inicie la partida...</p>
                            )
                        ) : (
                            <div>
                                <p>La partida está en progreso. Redirigiendo…</p>
                                <div className="loading-small">
                                    <div className="spinner-small"></div>
                                </div>
                            </div>
                        )}
                    </div>
                </div>

                <div className="lobby-actions">
                    <button 
                        className="btn btn-secondary"
                        onClick={onBackToLobby}
                    >
                        Volver al Lobby
                    </button>
                </div>
            </div>
        </div>
    );
};

export default GameScreen;