import { Game as MainGame } from './scenes/Game';
import { TitleScene } from './scenes/TitleScene';
import { AUTO, Game, Scale,Types } from 'phaser';

// Find out more information about the Game Config at:
// https://docs.phaser.io/api-documentation/typedef/types-core#gameconfig
const config: Types.Core.GameConfig = {
    type: AUTO,
    width: 420,
    height: 860,
    parent: 'game-container',
    backgroundColor: '#120d05',
    scale: {
        mode: Scale.FIT,
        autoCenter: Scale.CENTER_BOTH
    },
    scene: [
        TitleScene,
        MainGame
    ]
};

const StartGame = (parent: string) => {
    return new Game({ ...config, parent });
}

export default StartGame;
