import React, { useEffect, useMemo, useState, useCallback, useRef } from "react";
import { useLocation, useNavigate, useParams } from "react-router-dom";
import { gameAPI, invalidateCache } from '../services/api';            
import { gameRoundsAPI } from '../services/gameRoundsAPI';
import '../styles/InGame.css';

const SUMMARY_MS = 1500;
const MAX_DECADES = 5;
const WIN_TARGET = 3;

const GROUP_SIZES = {
    5: [0, 2, 3, 2, 3, 3],
    6: [0, 2, 3, 4, 3, 4],
    7: [0, 2, 3, 3, 4, 4],
    8: [0, 3, 4, 4, 5, 5],
    9: [0, 3, 4, 4, 5, 5],
    10: [0, 3, 4, 4, 5, 5],
};

const clamp = (n, lo, hi) => Math.max(lo, Math.min(hi, n));
const requiredGroupSize = (totalPlayers, decade) => {
    const t = GROUP_SIZES[clamp(totalPlayers, 5, 10)];
    return t ? t[clamp(decade, 1, 5)] : 0;
};

function Icon({ name, className = "icon" }) {
    return <span className={className} aria-hidden="true" />;
}

function IconBtn({ icon, label, className = "btn btn-icon", ...rest }) {
    return (
        <button className={className} {...rest}>
            <Icon name={icon} />
            <span>{label}</span>
        </button>
    );
}

export default function InGame({ playerName: propPlayerName, gamePassword: propGamePassword }) {
    const { gameId } = useParams();
    const location = useLocation();
    const navigate = useNavigate();
    const lobbyPath = "/";

    const getCredentials = useCallback(() => {
        const initialName = propPlayerName || location.state?.username || "";
        const initialPassword = propGamePassword || location.state?.gamePassword || "";

        const storedPlayer = sessionStorage.getItem(`playerName:${gameId}`) || 
                            localStorage.getItem(`playerName:${gameId}`) || 
                            sessionStorage.getItem("username") ||
                            localStorage.getItem("username") || "";
        
        const storedPassword = sessionStorage.getItem(`gamePassword:${gameId}`) || 
                              localStorage.getItem(`gamePassword:${gameId}`) || 
                              sessionStorage.getItem("gamePassword") ||
                              localStorage.getItem("gamePassword") || "";

        const finalPlayer = initialName || storedPlayer || "";
        const finalPassword = initialPassword || storedPassword || "";

        console.log('In-Game: credenciales recibidas:', {
            gameId,
            finalPlayer,
            hasPassword: !!finalPassword,
            passwordLength: finalPassword?.length,
            source: propGamePassword ? 'prop' : 
                   initialPassword ? 'location.state' : 
                   sessionStorage.getItem(`gamePassword:${gameId}`) ? 'sessionStorage' :
                   localStorage.getItem(`gamePassword:${gameId}`) ? 'localStorage' : 'none'
        });

        return { player: finalPlayer, password: finalPassword };
    }, [gameId, propPlayerName, propGamePassword, location.state]);

    const [credentials, setCredentials] = useState({ player: "", password: "" });
    const [effectivePlayer, setEffectivePlayer] = useState("");
    const [effectivePassword, setEffectivePassword] = useState("");

    useEffect(() => {
        const creds = getCredentials();
        setCredentials(creds);
        setEffectivePlayer(creds.player);
        setEffectivePassword(creds.password);
        
        if (creds.player) {
            sessionStorage.setItem(`playerName:${gameId}`, creds.player);
        }
        if (creds.password) {
            sessionStorage.setItem(`gamePassword:${gameId}`, creds.password);
        }
    }, [getCredentials, gameId]);

    const [playerName] = useState(effectivePlayer);
    const [roomName, setRoomName] = useState(
        location.state?.roomName ||
        sessionStorage.getItem("roomName") ||
        localStorage.getItem("roomName") ||
        ""
    );

    const [players, setPlayers] = useState([]);
    const [details, setDetails] = useState(null);
    const [loading, setLoading] = useState(true);
    const [apiError, setApiError] = useState("");
    const [rounds, setRounds] = useState([]);
    const [currentRound, setCurrentRound] = useState(null);
    const [roundDetail, setRoundDetail] = useState(null);
    const [roundStatus, setRoundStatus] = useState('waiting-on-leader');
    const [groupMembers, setGroupMembers] = useState([]);
    const [votesYes, setVotesYes] = useState(0);
    const [votesNo, setVotesNo] = useState(0);
    const [votesTotal, setVotesTotal] = useState(0);
    const [pendingVotes, setPendingVotes] = useState(0);
    const [proposedGroup, setProposedGroup] = useState([]);
    const [selectionDirty, setSelectionDirty] = useState(false);
    const [leaderName, setLeaderName] = useState('');
    const [submitting, setSubmitting] = useState(false);
    const [showSummary, setShowSummary] = useState(false);
    const [scores, setScores] = useState({ citizens: 0, enemies: 0 });
    const [isLeader, setIsLeader] = useState(false);
    const [phase, setPhase] = useState("waiting-on-leader");
    const [isTransitioning, setIsTransitioning] = useState(false);
    const [banner, setBanner] = useState(null);
    const [yourVote, setYourVote] = useState(null);
    const [yourAction, setYourAction] = useState(null);
    const [decade, setDecade] = useState(1);
    const [votingPhase, setVotingPhase] = useState(1);

    const betweenDecadesRef = useRef(false);
    const lastRoundIdRef = useRef(null);
    const lastDecadeRef = useRef(1);
    const resumeTimerRef = useRef(null);
    const pollIntervalRef = useRef(null);
    const isUpdatingRef = useRef(false);
    const consecutiveFailedVotesRef = useRef(0);

    const serverStatus = roundDetail?.status || roundStatus;
    const betweenDecades = betweenDecadesRef.current;

    // Para limpiar votos entre fases
    const resetVotingState = useCallback(() => {
        setYourVote(null);
        setVotesYes(0);
        setVotesNo(0);
        setVotesTotal(0);
        setPendingVotes(players.length);
    }, [players.length]);

    const isGameFinished = useCallback(() => {
        if (scores.citizens >= WIN_TARGET || scores.enemies >= WIN_TARGET) {
            return true;
        }
        
        if (decade > MAX_DECADES) {
            return true;
        }
        
        return false;
    }, [scores, decade]);

    const getActiveRound = useCallback(async () => {
        if (!gameId || !effectivePlayer) return null;

        try {
            console.log('getActiveRound: credenciales recibidas:', {
                gameId,
                effectivePlayer,
                hasPassword: !!effectivePassword,
                passwordLength: effectivePassword?.length
            });

            const roundsRes = await gameRoundsAPI.getRounds(gameId, effectivePlayer, effectivePassword);
            const roundsList = Array.isArray(roundsRes?.data) ? roundsRes.data : [];
            
            if (roundsList.length === 0) return null;
            
            for (let i = roundsList.length - 1; i >= 0; i--) {
                const round = roundsList[i];
                if (round.status !== 'ended') {
                    return { round, detail: round };
                }
            }
            
            const lastRound = roundsList[roundsList.length - 1];
            return { round: lastRound, detail: lastRound };
            
        } catch (error) {
            console.error("Error getting active round:", error);
            return null;
        }
    }, [gameId, effectivePlayer, effectivePassword]);

    const calculateVotes = useCallback((votesArray, playersCount) => {
        if (!Array.isArray(votesArray)) {
            return { yes: 0, no: 0, total: 0, allVoted: false, pendingVotes: playersCount };
        }

        const yesVotes = votesArray.filter(vote => vote === true).length;
        const noVotes = votesArray.filter(vote => vote === false).length;
        const totalVotes = votesArray.length;
        const pendingVotes = playersCount - totalVotes;
        const allVoted = totalVotes >= playersCount;

        return { yes: yesVotes, no: noVotes, total: totalVotes, allVoted, pendingVotes };
    }, []);

    const updateFullGameState = useCallback(async () => {
        if (isUpdatingRef.current) {
            return;
        }

        if (!gameId || !effectivePlayer) return;

        isUpdatingRef.current = true;

        try {
            console.log('updateFullGameState:', {
                gameId,
                effectivePlayer,
                hasPassword: !!effectivePassword,
                passwordLength: effectivePassword?.length
            });

            const gameRes = await gameAPI.getGameDetails(gameId, effectivePlayer, effectivePassword);
            const gameData = gameRes?.data;
            
            if (gameData) {
                setDetails(gameData);
                setRoomName(gameData?.name || '');
                
                if (Array.isArray(gameData?.players)) {
                    setPlayers(gameData.players);
                }
            }

            const activeRoundData = await getActiveRound();
            
            if (activeRoundData) {
                const { round, detail } = activeRoundData;
                
                setCurrentRound(round);
                setRoundDetail(detail);
                
                const amLeader = (detail.leader || '').trim() === (effectivePlayer || '').trim();
                setIsLeader(amLeader);
                setLeaderName(detail.leader || '');

                const group = Array.isArray(detail.group) ? detail.group : [];
                setGroupMembers(group);

                // Para detectar cambio de fase de votacion
                const oldVotingPhase = votingPhase;
                let currentVotingPhase = 1;
                if (detail.phase === 'vote2') currentVotingPhase = 2;
                else if (detail.phase === 'vote3') currentVotingPhase = 3;
                
                // Si cambio la fase de votacion, se limpia el estado local
                if (oldVotingPhase !== currentVotingPhase && detail.status === 'voting') {
                    console.log(`Cambio de fase de votación: ${oldVotingPhase} → ${currentVotingPhase}`);
                    setYourVote(null);
                }
                
                setVotingPhase(currentVotingPhase);

                let newPhase = 'waiting-on-leader';
                
                if (isGameFinished()) {
                    newPhase = 'ended';
                } else {
                    switch (detail.status) {
                        case 'waiting-on-leader':
                            newPhase = amLeader ? 'choose-group' : 'waiting-on-leader';
                            break;
                        case 'voting':
                            newPhase = 'voting';
                            if (detail.phase === 'vote3') {
                                consecutiveFailedVotesRef.current = 2;
                            } else if (detail.phase === 'vote2') {
                                consecutiveFailedVotesRef.current = 1;
                            } else {
                                consecutiveFailedVotesRef.current = 0;
                            }
                            break;
                        case 'waiting-on-group':
                            newPhase = 'waiting-on-group';
                            break;
                        case 'ended':
                            newPhase = 'between-rounds';
                            break;
                        default:
                            newPhase = 'waiting-on-leader';
                    }
                }

                setPhase(newPhase);
                setRoundStatus(detail.status);

                if (detail.votes && Array.isArray(detail.votes)) {
                    const votesInfo = calculateVotes(detail.votes, players.length);
                    
                    if (votesInfo.yes !== votesYes || votesInfo.no !== votesNo || votesInfo.total !== votesTotal) {
                        setVotesYes(votesInfo.yes);
                        setVotesNo(votesInfo.no);
                        setVotesTotal(votesInfo.total);
                        setPendingVotes(votesInfo.pendingVotes);
                        
                        console.log(`Votos actualizados: ${votesInfo.yes}si!!! ${votesInfo.no}no (Fase ${currentVotingPhase})`);
                    }
                } else {
                    // Si no hay votos, reiniciar contadores
                    if (votesYes !== 0 || votesNo !== 0 || votesTotal !== 0) {
                        setVotesYes(0);
                        setVotesNo(0);
                        setVotesTotal(0);
                        setPendingVotes(players.length);
                    }
                }

                if (amLeader && newPhase === 'choose-group') {
                    if (proposedGroup.length === 0 && group.length > 0) {
                        setProposedGroup(group);
                    }
                } else {
                    setProposedGroup(group);
                }

                const roundsRes = await gameRoundsAPI.getRounds(gameId, effectivePlayer, effectivePassword);
                const allRounds = Array.isArray(roundsRes?.data) ? roundsRes.data : [];
                setRounds(allRounds);
                
                const completedRounds = allRounds.filter(round => 
                    round.status === 'ended' && round.result !== 'none'
                );
                const currentDecade = Math.min(completedRounds.length + 1, MAX_DECADES);
                setDecade(currentDecade);
                
                const citizensWins = allRounds.filter(r => r.result === 'citizens').length;
                const enemiesWins = allRounds.filter(r => r.result === 'enemies').length;
                setScores({ citizens: citizensWins, enemies: enemiesWins });
            }

            setApiError("");

        } catch (err) {
            console.error("Error updating full game state:", err);
            if (!err.message.includes('Failed to fetch')) {
                setApiError(err?.message || "Error de conexión");
            }
        } finally {
            setLoading(false);
            isUpdatingRef.current = false;
        }
    }, [gameId, effectivePlayer, effectivePassword, getActiveRound, isGameFinished, players, proposedGroup.length, calculateVotes, votingPhase, votesYes, votesNo, votesTotal]);

    useEffect(() => {
        if (!gameId || !effectivePlayer) return;
        
        if (effectivePlayer) {
            sessionStorage.setItem(`playerName:${gameId}`, effectivePlayer);
        }
        if (effectivePassword) {
            sessionStorage.setItem(`gamePassword:${gameId}`, effectivePassword);
        }
        
        updateFullGameState();
        
        const getPollingInterval = () => {
            const baseInterval = 3000 + (decade * 500);
            
            if (phase === 'voting' || phase === 'waiting-on-group') {
                return Math.min(2000, baseInterval);
            } else if (phase === 'choose-group' && isLeader) {
                return 3000;
            } else {
                return baseInterval;
            }
        };

        const startPolling = () => {
            if (pollIntervalRef.current) {
                clearInterval(pollIntervalRef.current);
            }

            const interval = getPollingInterval();
            console.log(`Polling cada ${interval}ms (Década ${decade}, Fase: ${phase})`);
            
            pollIntervalRef.current = setInterval(() => {
                updateFullGameState();
            }, interval);
        };

        startPolling();

        const reconfigInterval = setInterval(() => {
            startPolling();
        }, 15000);

        return () => {
            if (pollIntervalRef.current) {
                clearInterval(pollIntervalRef.current);
            }
            clearInterval(reconfigInterval);
        };
    }, [gameId, effectivePlayer, effectivePassword, updateFullGameState, phase, isLeader, decade]);

    useEffect(() => {
        if (decade !== lastDecadeRef.current) {
            console.log(`Cambio de década: ${lastDecadeRef.current} → ${decade}`);
            lastDecadeRef.current = decade;
            
            setYourVote(null);
            setYourAction(null);
            setSelectionDirty(false);
            setProposedGroup([]);
            setVotesYes(0);
            setVotesNo(0);
            setVotesTotal(0);
            setPendingVotes(players.length);
            consecutiveFailedVotesRef.current = 0;
            
            invalidateCache(`rounds-list:${gameId}`);
        }
    }, [decade, players.length, gameId]);

    // Reset entre rondas y fases de votación
    useEffect(() => {
        if (currentRound?.id && lastRoundIdRef.current !== currentRound.id) {
            console.log("Nueva ronda detectada");
            lastRoundIdRef.current = currentRound.id;
            setYourVote(null);
            setYourAction(null);
            setSelectionDirty(false);
            resetVotingState(); // Limpiar votos
            
            if (!isLeader) {
                setProposedGroup([]);
            }
        }
    }, [currentRound?.id, isLeader, resetVotingState]);

    // oara limpiar votos cuando cambia la fase de votación
    useEffect(() => {
        if (phase === 'voting') {
            // Cuando se entra en la fase de votación, limpiar el voto personal
            // pero mantener los votos del servidor que llegan de updateFullGameState
            setYourVote(null);
            console.log(`Nueva fase de votación (${votingPhase}) - Voto personal reiniciado`);
        }
    }, [phase, votingPhase]);

    const serverRole = useMemo(() => {
        const meIsEnemy = Array.isArray(details?.enemies) && details.enemies.includes(effectivePlayer);
        return meIsEnemy ? "psychopath" : "citizen";
    }, [details, effectivePlayer]);

    const [role, setRole] = useState(serverRole);
    useEffect(() => setRole(serverRole), [serverRole]);

    const playersCount = Array.isArray(players) ? players.length : 0;
    const requiredTotal = requiredGroupSize(playersCount, decade);

    const canPropose = isLeader && 
                      phase === 'choose-group' && 
                      !submitting &&
                      proposedGroup.length === requiredTotal;

    const youAreInGroup = (roundDetail?.group || groupMembers || []).includes(effectivePlayer);
    
    const canVote = phase === 'voting' && 
                   Array.isArray(roundDetail?.group) && 
                   roundDetail.group.length > 0 && 
                   yourVote === null && 
                   !submitting;

    const canAct = youAreInGroup && phase === 'waiting-on-group' && yourAction === null && !submitting;

    const getVotingPhaseText = () => {
        switch (votingPhase) {
            case 1: return 'Primera votación';
            case 2: return 'Segunda votación';
            case 3: return 'Tercera votación (Última oportunidad)';
            default: return 'Votación';
        }
    };

    const handleSubmitGroup = async () => {
        if (!canPropose || !currentRound?.id) return;

        try {
            setSubmitting(true);
            
            const group = Array.from(new Set(proposedGroup)).slice(0, requiredTotal);
            if (group.length !== requiredTotal) {
                alert(`El grupo debe tener exactamente ${requiredTotal} miembros`);
                return;
            }

            const res = await gameRoundsAPI.proposeGroup(
                gameId,
                currentRound.id,
                group,
                effectivePlayer,
                effectivePassword
            );

            if (res?.data) {
                setTimeout(updateFullGameState, 1500);
            }

        } catch (err) {
            console.error("Error enviando grupo:", err);
            alert(`Error al enviar grupo: ${err.message}`);
        } finally {
            setSubmitting(false);
        }
    };

    const handleVote = async (approve) => {
        if (!canVote || !currentRound?.id) return;

        try {
            setSubmitting(true);
            
            console.log(`Enviando voto: ${approve ? 'A FAVOR' : 'EN CONTRA'} (Fase ${votingPhase})`);
            
            const res = await gameRoundsAPI.voteForGroup(
                gameId,
                currentRound.id,
                approve,
                effectivePlayer,
                effectivePassword
            );

            if (res?.data) {
                setYourVote(approve);
                console.log(`Voto registrado: ${approve ? 'A FAVOR' : 'EN CONTRA'}`);
                
                // Actualizar estado local inmediatamente
                setVotesTotal(prev => prev + 1);
                setPendingVotes(prev => prev - 1);
                if (approve) {
                    setVotesYes(prev => prev + 1);
                } else {
                    setVotesNo(prev => prev + 1);
                }
                
                // Hace que se espere un poco antes de la actualización completa
                setTimeout(updateFullGameState, 1500);
            }

        } catch (err) {
            console.error("Error al votar:", err);
            alert(`Error al votar: ${err.message}`);
        } finally {
            setSubmitting(false);
        }
    };

    const handleAction = async (collaborate) => {
        if (!canAct || !currentRound?.id) return;

        try {
            setSubmitting(true);
            
            const res = await gameRoundsAPI.submitAction(
                gameId,
                currentRound.id,
                collaborate,
                effectivePlayer,
                effectivePassword
            );

            if (res?.data) {
                setYourAction(collaborate);
                setTimeout(updateFullGameState, 2000);
            }

        } catch (err) {
            console.error("Error registrando acción:", err);
            alert(`Error registrando acción: ${err.message}`);
        } finally {
            setSubmitting(false);
        }
    };

    const handlePlayerSelection = (player) => {
        if (!isLeader || phase !== 'choose-group' || submitting) return;

        setSelectionDirty(true);
        
        if (proposedGroup.includes(player)) {
            setProposedGroup(prev => prev.filter(p => p !== player));
        } else {
            if (proposedGroup.length < requiredTotal) {
                setProposedGroup(prev => [...prev, player]);
            }
        }
    };

    const handleRejoinGame = () => {
        sessionStorage.removeItem(`playerName:${gameId}`);
        sessionStorage.removeItem(`gamePassword:${gameId}`);
        localStorage.removeItem(`playerName:${gameId}`);
        localStorage.removeItem(`gamePassword:${gameId}`);
        
        navigate(lobbyPath, { 
            state: { 
                rejoinGameId: gameId,
                error: "Necesitas unirte al juego nuevamente." 
            } 
        });
    };

    const forceRefresh = () => {
        if (!isUpdatingRef.current) {
            updateFullGameState();
        }
    };

    function ProposedGroupCard({ group, leader }) {
        const names = Array.isArray(group) ? [...new Set(group)] : [];
        if (names.length === 0) {
            return <span className="muted">—</span>;
        }
        return (
            <div className="flex-wrap" style={{ display: "flex", gap: ".4rem", flexWrap: "wrap" }}>
                {names.map((name) => (
                    <span
                        key={name}
                        className={`chip ${name === leader ? "leader" : ""}`}
                        title={name === leader ? "Líder" : undefined}
                    >
                        {name === leader ? "! " : ""}
                        {name}
                    </span>
                ))}
            </div>
        );
    }

    if (loading) {
        return (
            <div className="ingame-container">
                <div className="titlebar">
                    <h1 className="ing-title">contaminaDOS</h1>
                    <div className="title-sep" />
                </div>
                <div className="loading-state" style={{ textAlign: "center", padding: "2rem" }}>
                    <div className="spinner" />
                    <p>Cargando partida…</p>
                    {apiError && <p className="error-text">{apiError}</p>}
                </div>
            </div>
        );
    }

    const roomBadge = (
        <div className="id-badge">
            <span className="room-name">{roomName}</span>
            <span className="sep">•</span>
            <span className="mono">{gameId}</span>
            {details?.password ? (
                <>
                    <span className="sep">•</span>
                    <span className="muted">Con contraseña</span>
                </>
            ) : (
                <>
                    <span className="sep">•</span>
                    <span className="muted">Pública</span>
                </>
            )}
        </div>
    );

    const gameOver = isGameFinished();
    const statusLabel = gameOver ? "Partida concluida" : 
                       phase === "choose-group" ? "Formando grupo" :
                       phase === "voting" ? "Votación en curso" :
                       phase === "waiting-on-group" ? "Acciones del grupo" : 
                       "Esperando líder";

    const getGameResultMessage = () => {
        if (scores.citizens >= WIN_TARGET) {
            return "¡Los ciudadanos ejemplares ganaron!";
        } else if (scores.enemies >= WIN_TARGET) {
            return "¡La sociedad cayó ante los psicópatas!";
        } else if (decade > MAX_DECADES) {
            return "¡Partida terminada! Máximo de décadas alcanzado.";
        } else {
            return "¡Partida terminada!";
        }
    };

    return (
        <div className="ingame-container">
            {roomBadge}

            <div className="titlebar">
                <h1 className="ing-title">contaminaDOS</h1>
                <div className="title-sep" />
            </div>

            <div className="status-strip">
                <div className="status-card score">
                    <span className="label">Ciudadanos</span>
                    <span className="value">{scores.citizens}</span>
                </div>
                <div className="status-card middle">
                    <div className="kv">
                        <span className="k">Década</span>
                        <span className="v">{decade}</span>
                    </div>
                    <div className="kv">
                        <span className="k">Estado</span>
                        <span className={`v state ${statusLabel.toLowerCase().replaceAll(" ", "-")}`}>
                            {statusLabel}
                        </span>
                    </div>
                </div>
                <div className="status-card score">
                    <span className="label">Psicópatas</span>
                    <span className="value">{scores.enemies}</span>
                </div>
            </div>

            <div className="card activity-center card-focus">
                {phase === "choose-group" && isLeader && (
                    <section className="card">
                        <h2 className="card-title">Seleccionar grupo</h2>
                        <p className="muted">
                            Década {decade}: Elige exactamente {requiredTotal} integrante{requiredTotal === 1 ? "" : "s"} para la misión.
                            {proposedGroup.length > 0 && ` (${proposedGroup.length}/${requiredTotal} seleccionados)`}
                        </p>

                        <div className="grid-players">
                            {(players || []).map((p) => {
                                const checked = proposedGroup.includes(p);
                                const atLimit = !checked && proposedGroup.length >= requiredTotal;
                                return (
                                    <label 
                                        key={p} 
                                        className={`chip ${checked ? "chip-on" : ""} ${atLimit ? "chip-disabled" : ""}`}
                                    >
                                        <input
                                            type="checkbox"
                                            checked={checked}
                                            disabled={atLimit && !checked}
                                            onChange={() => handlePlayerSelection(p)}
                                        />
                                        {p}
                                        {p === effectivePlayer && " (Tú)"}
                                    </label>
                                );
                            })}
                        </div>

                        <div className="actions-row">
                            <button
                                type="button"
                                disabled={!canPropose}
                                onClick={handleSubmitGroup}
                            >
                                {submitting ? "Enviando..." : `Enviar grupo (${proposedGroup.length}/${requiredTotal})`}
                            </button>
                            <button
                                type="button"
                                onClick={() => setProposedGroup([])}
                                disabled={proposedGroup.length === 0}
                            >
                                Limpiar selección
                            </button>
                        </div>
                    </section>
                )}

                {phase === "waiting-on-leader" && !isLeader && (
                    <section className="card">
                        <h2 className="card-title">Esperando formación de grupo</h2>
                        <p className="muted">Década {decade}: El líder {leaderName} está seleccionando el grupo para esta misión…</p>
                    </section>
                )}

                {phase === "voting" && (
                    <>
                        <h2 className="card-title">{getVotingPhaseText()} - Década {decade}</h2>

                        {votingPhase === 3 && (
                            <div className="warning-banner">
                                <strong>ÚLTIMA OPORTUNIDAD:</strong> Si esta votación no es aprobada, los psicópatas ganarán la década automáticamente.
                            </div>
                        )}

                        {/* Para mostrar resultado de votaciones anteriores */}
                        {votingPhase > 1 && (
                            <div className="previous-votes-info">
                                <strong>Votaciones anteriores:</strong>
                                <div style={{ marginTop: '5px' }}>
                                    {votingPhase === 2 && <span>1ª votación: No aprobada</span>}
                                    {votingPhase === 3 && <span>1ª y 2ª votaciones: No aprobadas</span>}
                                </div>
                            </div>
                        )}

                        <div className="mini-card">
                            <strong>Grupo propuesto por {leaderName}</strong>
                            <div className="helper">
                                <ProposedGroupCard
                                    group={roundDetail?.group ?? []}
                                    leader={leaderName}
                                />
                            </div>
                        </div>

                        <div className="vote-info">
                            <div className="vote-stats">
                                <span>A favor: <strong>{votesYes}</strong></span>
                                <span>En contra: <strong>{votesNo}</strong></span>
                                <span>Pendientes: <strong>{pendingVotes}</strong></span>
                                <span>Total: <strong>{votesTotal} / {players.length}</strong></span>
                            </div>
                            
                            {pendingVotes > 0 && (
                                <p className="muted center">
                                    Esperando que {pendingVotes} jugador(es) voten...
                                </p>
                            )}
                        </div>

                        <div className="vote-dock">
                            <IconBtn
                                icon="vote-yes"
                                className={`btn big vote approve ${yourVote === true ? "active" : ""}`}
                                label="A favor"
                                disabled={!canVote || submitting}
                                onClick={() => handleVote(true)}
                            />
                            <IconBtn
                                icon="vote-no"
                                className={`btn big vote reject ${yourVote === false ? "active" : ""}`}
                                label="En contra"
                                disabled={!canVote || submitting}
                                onClick={() => handleVote(false)}
                            />
                        </div>

                        <div className="vote-helpers">
                            {yourVote !== null && (
                                <p className="you-voted-message">
                                    <strong>Su voto ha sido registrado:</strong> {yourVote ? "A FAVOR" : "EN CONTRA"}
                                </p>
                            )}
                            
                            <button 
                                onClick={forceRefresh}
                                className="btn btn-small btn-secondary"
                                style={{ marginTop: '10px' }}
                                disabled={isUpdatingRef.current}
                            >
                                {isUpdatingRef.current ? "Actualizando..." : "Actualizar estado"}
                            </button>
                        </div>
                    </>
                )}

                {phase === "waiting-on-group" && (
                    <>
                        <h2 className="card-title">Acciones del grupo - Década {decade}</h2>
                        
                        <div className="mini-card">
                            <strong>Miembros del grupo:</strong>
                            <ProposedGroupCard
                                group={groupMembers}
                                leader={leaderName}
                            />
                        </div>

                        {youAreInGroup && (
                            <div className="actions-row" style={{ justifyContent: "center" }}>
                                <IconBtn
                                    icon="act-collab"
                                    className={`btn big action collaborate ${yourAction === true ? "active" : ""}`}
                                    label="Colaborar"
                                    disabled={!canAct || submitting}
                                    onClick={() => handleAction(true)}
                                />
                                {role === "psychopath" && (
                                    <IconBtn
                                        icon="act-sabotage"
                                        className={`btn big action sabotage ${yourAction === false ? "active" : ""}`}
                                        label="Sabotear"
                                        disabled={!canAct || submitting}
                                        onClick={() => handleAction(false)}
                                    />
                                )}
                            </div>
                        )}

                        {!youAreInGroup && (
                            <p className="muted center">Esperando que el grupo complete sus acciones…</p>
                        )}

                        {yourAction !== null && (
                            <p className="muted center">Tu acción ha sido registrada: <strong>{yourAction ? "COLABORAR" : "SABOTEAR"}</strong></p>
                        )}
                    </>
                )}

                {gameOver && (
                    <section className="card">
                        <h2 className="card-title">Partida Finalizada</h2>
                        <div className="result-display">
                            <div className="final-score">
                                <div className="team-score">
                                    <span className="team-name">Ciudadanos</span>
                                    <span className="team-points">{scores.citizens}</span>
                                </div>
                                <div className="team-score">
                                    <span className="team-name">Psicópatas</span>
                                    <span className="team-points">{scores.enemies}</span>
                                </div>
                            </div>
                            <div className="winner-announcement">
                                {getGameResultMessage()}
                                <div className="lobby-actions">
                                    <button 
                                        className="btn btn-secondary" 
                                        onClick={() => navigate("/")}
                                    >
                                        Volver al Lobby
                                    </button>
                                </div>
                            </div>
                            <div className="game-stats">
                                <p className="muted center">
                                    Partida completada en {decade} década{decade !== 1 ? 's' : ''}
                                </p>
                            </div>
                        </div>
                    </section>
                )}
            </div>

            <div className="dock">
                <details className="dropdown">
                    <summary>
                        <Icon name="players" className="icon" />
                        Jugadores ({players.length})
                    </summary>
                    <div className="dropdown-body">
                        <ul className="player-list">
                            {players.map((p) => {
                                const isEnemy = Array.isArray(details?.enemies) && details.enemies.includes(p);
                                const isCurrentLeader = p === leaderName;
                                const isCurrentPlayer = p === effectivePlayer;
                                const currentPlayerIsEnemy = Array.isArray(details?.enemies) && details.enemies.includes(effectivePlayer);
                                
                                let displayRole;
                                let liClass;
                                
                                if (isCurrentPlayer) {
                                    // El jugador actual siempre ve su rol real
                                    displayRole = currentPlayerIsEnemy ? "Psicópata" : "Ciudadano";
                                    liClass = currentPlayerIsEnemy ? "psychopath" : "citizen";
                                } else if (isCurrentLeader) {
                                    // El líder siempre se muestra como líder
                                    displayRole = "Líder";
                                    liClass = "leader";
                                } else if (currentPlayerIsEnemy && isEnemy) {
                                    // Los psicópatas pueden ver a otros psicópatas
                                    displayRole = "Psicópata";
                                    liClass = "psychopath";
                                } else {
                                    // Por defecto mostrar como ciudadano
                                    displayRole = "Ciudadano";
                                    liClass = "citizen";
                                }
                                
                                return (
                                    <li key={p} className={liClass}>
                                        <span className="name">
                                            {p}{isCurrentPlayer ? " (Tú)" : ""}
                                        </span>
                                        <span className="role-tag">{displayRole}</span>
                                    </li>
                                );
                            })}
                        </ul>
                        
                        {Array.isArray(details?.enemies) && details.enemies.includes(effectivePlayer) && (
                            <div className="enemies-info" style={{ 
                                marginTop: '1rem', 
                                padding: '0.5rem', 
                                backgroundColor: 'rgba(244, 67, 54, 0.1)',
                                borderRadius: '4px',
                                fontSize: '0.9rem',
                                border: '1px solid #f44336',
                                color: '#d32f2f'
                            }}>
                                <strong>Información para psicópatas:</strong>
                                <div style={{ marginTop: '0.25rem' }}>
                                    <span>Psicópatas en la partida: </span>
                                    <strong>
                                        {details.enemies.filter(enemy => enemy !== effectivePlayer).join(', ') || 'Ninguno además de ti'}
                                    </strong>
                                </div>
                            </div>
                        )}
                    </div>
                </details>
            </div>

            {apiError && (
                <div className="error-banner">
                    <strong>Error de conexión:</strong> {apiError}
                    <div style={{ textAlign: 'center', marginTop: '1rem' }}>
                        <button 
                            onClick={handleRejoinGame}
                            className="btn btn-primary"
                        >
                            Reunirse al Juego
                        </button>
                    </div>
                </div>
            )}
        </div>
    );
}