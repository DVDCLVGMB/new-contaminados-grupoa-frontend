import React from 'react';
import { BrowserRouter as Router, Routes, Route } from "react-router-dom";
import Lobby from './components/Lobby.jsx';
import GameScreen from './components/GameScreen.jsx';
import InGame from './components/In-Game.jsx';

import './styles/Lobby.css';
export default function App() {
    return (
        <Router>
            <Routes>
                <Route path="/" element={<Lobby />} />
                <Route path="/room/:gameId" element={<GameScreen />} />  {/* lobby */}
                <Route path="/game/:gameId" element={<InGame />} />      {/* in-game */}
            </Routes>
        </Router>

    );
}