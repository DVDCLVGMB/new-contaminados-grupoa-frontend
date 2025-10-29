import React, { useState, useEffect } from 'react';
import { gameCreateAPI } from '../services/gameCreateAPI';
import '../styles/CreateGameModal.css';

const CreateGameModal = ({ onClose, onGameCreated, username }) => {
    const [gameName, setGameName] = useState("");
    const [owner, setOwner] = useState("");
    const [password, setPassword] = useState("");
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState("");

    useEffect(() => {
        if (username) {
            setOwner(username);
        }
    }, [username]);

    const handleCreate = async () => {
        if (!gameName.trim()) {
            setError('El nombre de la partida es requerido');
            return;
        }

        if (gameName.trim().length < 3 || gameName.trim().length > 20) {
            setError('El nombre de la partida debe tener entre 3 y 20 caracteres');
            return;
        }

        if (!owner.trim()) {
            setError('El nombre del propietario es requerido');
            return;
        }

        if (owner.trim().length < 3 || owner.trim().length > 20) {
            setError('El nombre del propietario debe tener entre 3 y 20 caracteres');
            return;
        }

        if (password.trim() && (password.trim().length < 3 || password.trim().length > 20)) {
            setError('La contraseña debe tener entre 3 y 20 caracteres');
            return;
        }

        try {
            setLoading(true);
            setError("");

            console.log(`Creando partida: ${gameName}`, password ? '(privada)' : '(pública)');

            const newGame = await gameCreateAPI.createGame({
                name: gameName.trim(),
                owner: owner.trim(),
                password: password.trim() || undefined
            });

            console.log('Partida creada exitosamente:', newGame);

            // Llamar a onGameCreated con la contraseña
            onGameCreated({
                id: newGame.id,
                name: newGame.name,
                owner: newGame.owner,
                status: 'lobby',
                players: [username],
                password: password.trim(), // ENVIAR PASSWORD
                requiresPassword: !!password.trim()
            });

        } catch (err) {
            console.error('Error creando partida: ', err);
            setError(err.message || 'Error al crear la partida');
        } finally {
            setLoading(false);
        }
    };

    const handleKeyPress = (e) => {
        if (e.key === 'Enter' && gameName.trim() && owner.trim() && !loading) {
            handleCreate();
        }
    };

    const isGameNameValid = !gameName || (gameName.length >= 3 && gameName.length <= 20);
    const isOwnerValid = !owner || (owner.length >= 3 && owner.length <= 20);
    const isPasswordValid = !password || (password.length >= 3 && password.length <= 20);

    return (
        <div className="modal-overlay">
            <div className="modal-content">
                <div className="modal-header">
                    <h2>Crear Nueva Partida</h2>
                    <button className="close-btn" onClick={onClose}>×</button>
                </div>

                <div className="modal-body">
                    {error && (
                        <div className="error-message">
                            {error}
                        </div>
                    )}

                    <div className="input-group">
                        <label>Nombre de la partida *</label>
                        <input
                            type="text"
                            value={gameName}
                            onChange={(e) => setGameName(e.target.value)}
                            onKeyPress={handleKeyPress}
                            placeholder="Ej: EcoWarriors (3-20 caracteres)"
                            className={`input-field ${gameName && !isGameNameValid ? 'input-error' : ''}`}
                            disabled={loading}
                            maxLength={20}
                            autoFocus
                        />
                        {gameName && (
                            <div className={`character-count ${isGameNameValid ? '' : 'count-error'}`}>
                                {gameName.length}/20 {gameName.length < 3 && '(mínimo 3)'}
                            </div>
                        )}
                    </div>

                    <div className="input-group">
                        <label>Propietario *</label>
                        <input
                            type="text"
                            value={owner}
                            onChange={(e) => setOwner(e.target.value)}
                            onKeyPress={handleKeyPress}
                            placeholder="Tu nombre de jugador"
                            className={`input-field ${owner && !isOwnerValid ? 'input-error' : ''}`}
                            disabled={loading}
                            maxLength={20}
                        />
                        {owner && (
                            <div className={`character-count ${isOwnerValid ? '' : 'count-error'}`}>
                                {owner.length}/20 {owner.length < 3 && '(mínimo 3)'}
                            </div>
                        )}
                    </div>

                    <div className="input-group">
                        <label>Contraseña (opcional)</label>
                        <input
                            type="password"
                            value={password}
                            onChange={(e) => setPassword(e.target.value)}
                            onKeyPress={handleKeyPress}
                            placeholder="Dejar vacío para partida pública (3-20 caracteres)"
                            className={`input-field ${password && !isPasswordValid ? 'input-error' : ''}`}
                            disabled={loading}
                            maxLength={20}
                        />
                        {password && (
                            <div className={`character-count ${isPasswordValid ? '' : 'count-error'}`}>
                                {password.length}/20 {password.length < 3 && '(mínimo 3)'}
                            </div>
                        )}
                        <small className="password-hint">
                            {password ? 'Partida privada' : 'Partida pública'}
                        </small>
                    </div>
                </div>

                <div className="modal-actions">
                    <button
                        className="btn btn-secondary"
                        onClick={onClose}
                        disabled={loading}
                    >
                        Cancelar
                    </button>
                    <button
                        className="btn btn-primary"
                        onClick={handleCreate}
                        disabled={!gameName.trim() || !owner.trim() || loading ||
                            !isGameNameValid || !isOwnerValid || !isPasswordValid}
                    >
                        {loading ? 'Creando...' : 'Crear Partida'}
                    </button>
                </div>
            </div>
        </div>
    );
};

export default CreateGameModal;