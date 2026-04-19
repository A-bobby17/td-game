import { Scene } from 'phaser';

// The game grid is 360 px wide (6 cols × 60 px) centered at x = 512.
// We treat that 360 px column as the "portrait content zone" so the title
// screen composition mirrors the vertical feel of the board below it.
const CONTENT_W = 360;
const CENTER_X  = 512;

export class TitleScene extends Scene {
    constructor() {
        super('TitleScene');
    }

    preload(): void {
        this.load.image('title', 'assets/title.png');
    }

    create(): void {
        console.log('title exists:', this.textures.exists('title'));

        this.cameras.main.setBackgroundColor('#120d05');
        this.cameras.main.fadeIn(500, 0, 0, 0);

        const { height } = this.scale;

        // --- Title logo ---
        // Sits in the upper third of the screen.
        // Scale so it fills 90% of the content-zone width; never exceeds actual pixel size.
        const logo = this.add.image(CENTER_X, height * 0.32, 'title');
        const logoScale = (CONTENT_W * 0.9) / logo.width;
        logo.setScale(logoScale);

        // Subtle float: oscillate ±6 px vertically, 2.4 s period, yoyo
        this.tweens.add({
            targets: logo,
            y: height * 0.32 + 6,
            duration: 1200,
            ease: 'Sine.easeInOut',
            yoyo: true,
            repeat: -1,
        });

        // --- GAME START button ---
        // Positioned well below the logo, inside the same content column.
        // Large font, gold → white on hover, easy tap target.
        const btn = this.add.text(CENTER_X, height * 0.68, 'GAME  START', {
            fontFamily: 'monospace',
            fontSize: '30px',
            color: '#FFD700',
            padding: { x: 24, y: 14 },
        }).setOrigin(0.5);

        btn.setInteractive({ useHandCursor: true });
        btn.on('pointerover',  () => btn.setStyle({ color: '#FFFFFF' }));
        btn.on('pointerout',   () => btn.setStyle({ color: '#FFD700' }));
        btn.on('pointerdown',  () => this.scene.start('Game'));
    }
}
