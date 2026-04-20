import { Scene } from 'phaser';

export class TitleScene extends Scene {
    constructor() {
        super('TitleScene');
    }

    preload(): void {
        this.load.image('title', 'assets/title.png');
        this.load.audio('bgm', 'assets/bgm1.mp3');
    }

    create(): void {
        console.log('title exists:', this.textures.exists('title'));

        this.cameras.main.setBackgroundColor('#120d05');
        this.cameras.main.fadeIn(500, 0, 0, 0);

        const cx     = this.scale.width  / 2;
        const { height } = this.scale;

        // Title logo — scale to 85% of canvas width, centered in upper third
        const logo = this.add.image(cx, height * 0.32, 'title');
        logo.setScale((this.scale.width * 0.85) / logo.width);

        // Subtle float: ±6 px vertical oscillation
        this.tweens.add({
            targets:  logo,
            y:        height * 0.32 + 6,
            duration: 1200,
            ease:     'Sine.easeInOut',
            yoyo:     true,
            repeat:   -1,
        });

        // GAME START button — large, centered, easy tap target
        const btn = this.add.text(cx, height * 0.68, 'GAME  START', {
            fontFamily: 'monospace',
            fontSize:   '30px',
            color:      '#FFD700',
            padding:    { x: 24, y: 14 },
        }).setOrigin(0.5);

        btn.setInteractive({ useHandCursor: true });
        btn.on('pointerover',  () => btn.setStyle({ color: '#FFFFFF' }));
        btn.on('pointerout',   () => btn.setStyle({ color: '#FFD700' }));
        btn.on('pointerdown',  () => {
            // Start BGM on first user interaction; reuse existing instance if already playing
            const existing = this.sound.get('bgm');
            const bgm = existing ?? this.sound.add('bgm', { loop: true, volume: 0.5 });
            if (!bgm.isPlaying) bgm.play();

            this.scene.start('Game');
        });
    }
}
