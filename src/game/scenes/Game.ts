import { Scene, GameObjects } from 'phaser';

const COLS = 6;
const ROWS = 12;
const CELL_SIZE = 60;
const COL_LABELS = 'ABCDEF';

const UNIT_HIT_RADIUS = 25;
const UNIT_TARGET_PX  = 50;

const ENEMY_TARGET_PX  = 54;   // 90% of CELL_SIZE — gives enemies stronger visual presence
const VILLAGE_MAX_HP   = 10;
const SPECIAL_MAX      = 6;   // full after 6 enemy kills
const SPECIAL_USES_TO_WIN = 2;

const ORTHO_DIRS: [number, number][] = [[0,-1],[0,1],[-1,0],[1,0]];
const DIAG_DIRS:  [number, number][] = [[-1,-1],[1,-1],[-1,1],[1,1]];

interface Cell {
    col: number;
    row: number;
    label: string;
    x: number;
    y: number;
    cx: number;
    cy: number;
    graphics: GameObjects.Graphics;
}

interface Unit {
    id: string;
    label: string;
    cell: Cell;
    graphics: GameObjects.Graphics;
    sprite: GameObjects.Image;
    hitArea: GameObjects.Arc;
}

export class Game extends Scene
{
    private cells: Cell[][] = [];
    private selectedCell: Cell | null = null;
    private units:   Unit[] = [];   // friendly units
    private enemies: Unit[] = [];   // enemy units
    private selectedUnit: Unit | null = null;
    private highlightedCells = new Set<Cell>();
    private currentMode:    'move' | 'attack' = 'move';
    private modePanel:      GameObjects.Container | null = null;
    private nextEnemyId   = 2;    // E1 placed in create(); spawned enemies start at E2
    private villageHp       = VILLAGE_MAX_HP;
    private specialGauge    = 0;
    private specialUseCount = 0;
    private isGameOver      = false;
    private originX       = 0;
    private originY       = 0;
    private hpBar:          GameObjects.Graphics | null = null;
    private spBar:          GameObjects.Graphics | null = null;

    // Starting positions for reset
    private unitStartPositions:  { col: number; row: number }[] = [];
    private enemyStartPositions: { col: number; row: number }[] = [];

    constructor ()
    {
        super('Game');
    }

    preload ()
    {
        // All images loaded BEFORE setPath use their full 'assets/...' path explicitly.
        this.load.image('enemy',    'assets/enemy.png');
        this.load.image('sp_cutin', 'assets/spcutin.png');

        this.load.setPath('assets');
        this.load.image('unit_a2', 'unit-a2.png');
        this.load.image('unit_b',  'unit-a3.png');

        this.load.on('filecomplete', (key: string) => {
            console.log(`[preload] loaded: ${key}`);
        });
    }

    create ()
    {
        // Clear all scene state — safe on first run AND on scene.restart()
        this.cells               = [];
        this.units               = [];
        this.enemies             = [];
        this.selectedUnit        = null;
        this.selectedCell        = null;
        this.highlightedCells    = new Set();
        this.currentMode         = 'move';
        this.modePanel           = null;
        this.nextEnemyId         = 2;
        this.villageHp           = VILLAGE_MAX_HP;
        this.specialGauge        = 0;
        this.specialUseCount     = 0;
        this.isGameOver          = false;
        this.originX             = 0;
        this.originY             = 0;
        this.hpBar               = null;
        this.spBar               = null;
        this.unitStartPositions  = [];
        this.enemyStartPositions = [];

        console.log('[create] unit_a2 exists:', this.textures.exists('unit_a2'));
        console.log('[create] unit_b  exists:', this.textures.exists('unit_b'));
        console.log('[create] enemy   exists:', this.textures.exists('enemy'));

        // Trim friendly unit images (removes solid background padding)
        this.trimAndRegister('unit_a2', 'unit_a2_trimmed');
        this.trimAndRegister('unit_b',  'unit_b_trimmed');


        this.input.setTopOnly(true);

        const gridWidth  = COLS * CELL_SIZE;
        const gridHeight = ROWS * CELL_SIZE;
        // Shift grid upward by 40px so the status area below has more room.
        this.originX = Math.floor((this.scale.width - gridWidth) / 2);
        this.originY = Math.floor((this.scale.height - gridHeight) / 2) - 40;
        const originX = this.originX;
        const originY = this.originY;

        for (let row = 0; row < ROWS; row++) {
            this.cells[row] = [];

            for (let col = 0; col < COLS; col++) {
                const x  = originX + col * CELL_SIZE;
                const y  = originY + row * CELL_SIZE;
                const cx = x + CELL_SIZE / 2;
                const cy = y + CELL_SIZE / 2;
                const label = `${COL_LABELS[col]}${row + 1}`;

                const graphics = this.add.graphics();
                const cell: Cell = { col, row, label, x, y, cx, cy, graphics };

                this.drawCell(cell, false);

                this.add.text(cx, cy, label, {
                    fontFamily: 'monospace',
                    fontSize: '14px',
                    color: '#c8a97a',
                }).setOrigin(0.5).setDepth(1);

                const hitArea = this.add.rectangle(cx, cy, CELL_SIZE, CELL_SIZE)
                    .setInteractive({ useHandCursor: true })
                    .setDepth(2);

                hitArea.on('pointerdown', () => this.onCellClick(cell));
                hitArea.on('pointerover', () => {
                    if (this.selectedCell !== cell) {
                        const hl = this.highlightedCells.has(cell);
                        this.drawCell(cell, false, true,
                            hl && this.currentMode === 'move',
                            hl && this.currentMode === 'attack');
                    }
                });
                hitArea.on('pointerout', () => {
                    if (this.selectedCell !== cell) {
                        const hl = this.highlightedCells.has(cell);
                        this.drawCell(cell, false, false,
                            hl && this.currentMode === 'move',
                            hl && this.currentMode === 'attack');
                    }
                });

                this.cells[row][col] = cell;
            }
        }

        const border = this.add.graphics();
        border.lineStyle(2, 0x7a5530, 1);
        border.strokeRect(originX, originY, gridWidth, gridHeight);

        // Friendly units — createUnit returns Unit; caller stores it
        const ua = this.createUnit('A', 'Unit A', this.cells[9][0], 'unit_a2_trimmed');
        this.units.push(ua);
        this.unitStartPositions.push({ col: 0, row: 9 });

        const ub = this.createUnit('B', 'Unit B', this.cells[9][5], 'unit_b_trimmed');
        this.units.push(ub);
        this.unitStartPositions.push({ col: 5, row: 9 });

        // Enemy is a portrait PNG (1024×1536). Scaling by max(w,h) would use height
        // as the denominator and produce a sprite only ~36 px wide — visually too thin.
        // Pass realWidth as refDim so the scale fills ENEMY_TARGET_PX of horizontal space.
        const enemyFrame = this.textures.getFrame('enemy');
        const e1 = this.createUnit('E1', 'Enemy', this.cells[2][2], 'enemy', enemyFrame.realWidth, ENEMY_TARGET_PX);
        console.log('[enemy] exists:', this.textures.exists('enemy'),
            '| size:', this.textures.getFrame('enemy').realWidth, '×', this.textures.getFrame('enemy').realHeight,
            '| scale:', e1.sprite.scaleX.toFixed(4),
            '| pos:', e1.sprite.x, e1.sprite.y,
            '| visible:', e1.sprite.visible, 'alpha:', e1.sprite.alpha, 'depth:', e1.sprite.depth);
        this.enemies.push(e1);
        this.enemyStartPositions.push({ col: 2, row: 2 });

        this.setupStatusArea();
    }

    // ─── Sprite trimming ──────────────────────────────────────────────────────

    /** Trim a full standalone image loaded with load.image. */
    private trimAndRegister (sourceKey: string, outputKey: string): void
    {
        if (this.textures.exists(outputKey)) return;

        const img = this.textures.get(sourceKey).getSourceImage() as HTMLImageElement;
        const W = img.naturalWidth, H = img.naturalHeight;

        const fc = document.createElement('canvas');
        fc.width = W; fc.height = H;
        const ctx = fc.getContext('2d')!;
        ctx.drawImage(img, 0, 0);

        this.trimCanvas(fc, img, 0, 0, W, H, outputKey, sourceKey);
    }

    /** Shared pixel-scan logic used by trimAndRegister. */
    private trimCanvas (
        frameCanvas: HTMLCanvasElement,
        sourceImg: HTMLImageElement,
        srcX: number, srcY: number, srcW: number, srcH: number,
        outputKey: string, sourceKey: string
    ): void
    {
        const { data } = frameCanvas.getContext('2d')!.getImageData(0, 0, srcW, srcH);
        const bgR = data[0], bgG = data[1], bgB = data[2];

        let x0 = srcW, x1 = -1, y0 = srcH, y1 = -1;

        for (let y = 0; y < srcH; y++) {
            for (let x = 0; x < srcW; x++) {
                const i    = (y * srcW + x) * 4;
                const dist = Math.abs(data[i]     - bgR)
                           + Math.abs(data[i + 1] - bgG)
                           + Math.abs(data[i + 2] - bgB);
                if (data[i + 3] < 10 || dist < 30) continue;
                if (x < x0) x0 = x;
                if (x > x1) x1 = x;
                if (y < y0) y0 = y;
                if (y > y1) y1 = y;
            }
        }

        if (x1 < 0) {
            x0 = 0; y0 = 0; x1 = srcW - 1; y1 = srcH - 1;
            console.warn(`[trim] no content found for "${sourceKey}", using full region`);
        }

        const cW = x1 - x0 + 1, cH = y1 - y0 + 1;
        const tc = document.createElement('canvas');
        tc.width = cW; tc.height = cH;
        tc.getContext('2d')!.drawImage(sourceImg, srcX + x0, srcY + y0, cW, cH, 0, 0, cW, cH);
        this.textures.addCanvas(outputKey, tc);

        console.log(`[trim] "${sourceKey}"[${srcX},${srcY} ${srcW}×${srcH}] → "${outputKey}" ${cW}×${cH}`);
    }

    // ─── Movement ─────────────────────────────────────────────────────────────

    private getValidMoves (unit: Unit): Cell[]
    {
        const { col, row } = unit.cell;
        const occupied = new Set([
            ...this.units.map(u => u.cell),
            ...this.enemies.map(e => e.cell),
        ]);
        const candidates: [number, number][] = [];

        for (const [dc, dr] of ORTHO_DIRS) {
            candidates.push([col + dc,     row + dr    ]);
            candidates.push([col + dc * 2, row + dr * 2]);
        }
        for (const [dc, dr] of DIAG_DIRS) {
            candidates.push([col + dc, row + dr]);
        }

        return candidates
            .filter(([c, r]) => c >= 0 && c < COLS && r >= 0 && r < ROWS)
            .filter(([c, r]) => !occupied.has(this.cells[r][c]))
            .map(([c, r]) => this.cells[r][c]);
    }

    private showMoveHighlights (unit: Unit): void
    {
        this.clearMoveHighlights();
        for (const cell of this.getValidMoves(unit)) {
            this.highlightedCells.add(cell);
            this.drawCell(cell, false, false, true);
        }
    }

    private clearMoveHighlights (): void
    {
        for (const cell of this.highlightedCells) {
            this.drawCell(cell, this.selectedCell === cell);
        }
        this.highlightedCells.clear();
    }

    private moveUnit (unit: Unit, target: Cell): void
    {
        const from = unit.cell.label;
        unit.cell = target;
        unit.sprite.setPosition(target.cx, target.cy);
        unit.hitArea.setPosition(target.cx, target.cy);
        this.drawUnit(unit, false);
        this.selectedUnit = null;
        this.currentMode = 'move';
        this.clearMoveHighlights();
        this.clearModeButtons();
        console.log(`${unit.label}: ${from} → ${target.label}`);

        this.spawnEnemy();
        this.stepEnemies();
    }

    // ─── Enemy ────────────────────────────────────────────────────────────────

    private stepEnemies (): void
    {
        const toRemove:      Unit[] = [];
        const reachedBottom: Unit[] = [];

        for (const enemy of this.enemies) {
            const nextRow = enemy.cell.row + 1;

            if (nextRow >= ROWS) {
                // Enemy passed the last row — damages the village
                reachedBottom.push(enemy);
                continue;
            }

            const target = this.cells[nextRow][enemy.cell.col];

            // Collision rule: enemy reaches a friendly → remove enemy, damage village
            const hitsUnit = this.units.some(u => u.cell === target);
            if (hitsUnit) {
                console.log(`${enemy.label} hit friendly at ${target.label} — enemy removed, village damaged`);
                toRemove.push(enemy);
                this.damageVillage();
                continue;
            }

            enemy.cell = target;
            enemy.sprite.setPosition(target.cx, target.cy);
            enemy.hitArea.setPosition(target.cx, target.cy);
            console.log(`${enemy.label} stepped → ${target.label}`);
        }

        const allRemoved = [...toRemove, ...reachedBottom];
        for (const e of allRemoved) {
            e.sprite.destroy();
            e.hitArea.destroy();
            e.graphics.destroy();
        }
        this.enemies = this.enemies.filter(e => !allRemoved.includes(e));

        for (const e of reachedBottom) {
            console.log(`${e.label} reached the village`);
            this.damageVillage();
        }
    }

    // ─── Spawning ─────────────────────────────────────────────────────────────

    private spawnEnemy (): void
    {
        const occupied = new Set([
            ...this.units.map(u => u.cell),
            ...this.enemies.map(e => e.cell),
        ]);

        const available = this.cells[0].filter(cell => !occupied.has(cell));
        if (available.length === 0) {
            console.log('[spawn] top row full — skipping');
            return;
        }

        const cell = available[Math.floor(Math.random() * available.length)];
        const id   = `E${this.nextEnemyId++}`;
        const frame = this.textures.getFrame('enemy');
        const e = this.createUnit(id, 'Enemy', cell, 'enemy', frame.realWidth, ENEMY_TARGET_PX);
        this.enemies.push(e);
        console.log(`[spawn] ${id} at ${cell.label} (${this.enemies.length} total)`);
    }

    // ─── Attack ───────────────────────────────────────────────────────────────

    private getAttackTargets (unit: Unit): Cell[]
    {
        const { col, row } = unit.cell;
        // Unit A: 1 cell straight up. Unit B: 1 cell diagonally upward (both sides).
        const candidates: [number, number][] =
            unit.id === 'A'
                ? [[col, row - 1]]
                : [[col - 1, row - 1], [col + 1, row - 1]];

        return candidates
            .filter(([c, r]) => c >= 0 && c < COLS && r >= 0 && r < ROWS)
            .map(([c, r]) => this.cells[r][c]);
    }

    private showAttackHighlights (unit: Unit): void
    {
        this.clearMoveHighlights();
        for (const cell of this.getAttackTargets(unit)) {
            this.highlightedCells.add(cell);
            this.drawCell(cell, false, false, false, true);
        }
    }

    private executeAttack (unit: Unit, cell: Cell): void
    {
        console.log(`[attack] >>> ENTERED executeAttack`);
        console.log(`[attack] attacker: ${unit.label} (id=${unit.id}) | mode=${this.currentMode}`);
        console.log(`[attack] target cell: ${cell.label} row=${cell.row} col=${cell.col}`);
        console.log(`[attack] attack targets:`, this.getAttackTargets(unit).map(c => c.label));
        console.log(`[attack] enemies before (${this.enemies.length}):`,
            this.enemies.map(e => `${e.label} row=${e.cell.row} col=${e.cell.col}`));

        // Coordinate-based comparison — avoids object-identity issues where
        // enemy.cell and the clicked cell are logically the same square but
        // different object references (e.g. after stepEnemies reassignment).
        const enemy = this.enemies.find(
            e => e.cell.row === cell.row && e.cell.col === cell.col
        );

        console.log(`[attack] hit:`, enemy ? enemy.label : 'none');

        if (enemy) {
            console.log(`[attack] HIT — removing ${enemy.label}`);
            enemy.sprite.destroy();
            enemy.hitArea.destroy();
            enemy.graphics.destroy();
            this.enemies = this.enemies.filter(e => e !== enemy);
            console.log(`[attack] enemies after removal (${this.enemies.length}):`,
                this.enemies.map(e => e.label));
            this.gainSp(1);
        } else {
            console.log(`[attack] MISS — no enemy at row=${cell.row} col=${cell.col}`);
        }

        // Always end the turn: clear selection, mode, highlights, spawn, then step enemies
        this.selectedUnit = null;
        this.currentMode = 'move';
        this.drawUnit(unit, false);
        this.clearMoveHighlights();
        this.clearModeButtons();
        this.spawnEnemy();
        this.stepEnemies();
    }

    // ─── Special ──────────────────────────────────────────────────────────────

    private executeSpecial (): void
    {
        console.log('[SPECIAL] executeSpecial entered');

        // ── Cut-in animation ───────────────────────────────────────────────────
        const img = this.add.image(
            this.scale.width + 200,
            this.scale.height / 2,
            'sp_cutin'
        );
        img.setOrigin(0.5, 0.5);
        img.setDepth(1000);
        const cutinScale = this.scale.width / img.width;
        img.setScale(cutinScale);

        this.tweens.add({
            targets:  img,
            x:        this.scale.width / 2,
            duration: 400,
            ease:     'Power2',
            onComplete: () => {
                this.tweens.add({
                    targets:  img,
                    x:        -img.width,
                    duration: 400,
                    delay:    300,
                    ease:     'Power2',
                    onComplete: () => {
                        img.destroy();
                    }
                });
            }
        });

        // ── Game logic runs synchronously — animation cannot break this ────────

        const unit = this.selectedUnit;
        this.selectedUnit = null;
        this.currentMode = 'move';
        if (unit) this.drawUnit(unit, false);
        this.clearMoveHighlights();
        this.clearModeButtons();

        for (const e of this.enemies) {
            e.sprite.destroy();
            e.hitArea.destroy();
            e.graphics.destroy();
        }
        this.enemies = [];
        console.log('[SPECIAL] enemies cleared');

        this.specialGauge = 0;
        this.updateSpDisplay();

        this.specialUseCount++;
        console.log(`[SPECIAL] use count: ${this.specialUseCount}/${SPECIAL_USES_TO_WIN}`);

        if (this.specialUseCount >= SPECIAL_USES_TO_WIN) {
            this.isGameOver = true;
            this.showGameClear();
            return;
        }

        this.spawnEnemy();
        this.stepEnemies();
        console.log('[SPECIAL] turn complete');
    }

    // ─── Mode buttons ─────────────────────────────────────────────────────────

    private showModeButtons (): void
    {
        this.clearModeButtons();
        if (!this.selectedUnit) return;

        const { cx, cy, col } = this.selectedUnit.cell;
        const spFull  = this.specialGauge >= SPECIAL_MAX;

        // Each row is 27 px; add a row for SPECIAL when the gauge is full.
        const ROW_H   = 27;
        const rows    = spFull ? 3 : 2;
        const W       = 80;
        const H       = ROW_H * rows;

        // Panel sits to the RIGHT of the cell; flips LEFT only for the last column.
        const toRight = col < COLS - 1;
        const panelX  = toRight
            ? cx + CELL_SIZE / 2 + 6
            : cx - CELL_SIZE / 2 - 6 - W;
        const panelY  = cy - H / 2;

        const container = this.add.container(panelX, panelY).setDepth(20);

        // ── Background ─────────────────────────────────────────────────────────
        const bg = this.add.graphics();
        bg.fillStyle(0x1a1008, 0.92);
        bg.fillRect(0, 0, W, H);
        bg.lineStyle(1, 0x7a5530, 1);
        bg.strokeRect(0, 0, W, H);
        // Separators between rows
        bg.lineStyle(1, 0x3a2810, 1);
        for (let i = 1; i < rows; i++) bg.lineBetween(6, ROW_H * i, W - 6, ROW_H * i);
        container.add(bg);

        // ── Click absorber ─────────────────────────────────────────────────────
        const absorber = this.add.zone(W / 2, H / 2, W, H).setInteractive();
        container.add(absorber);

        // ── MOVE and ATTACK (always present) ───────────────────────────────────
        const base = { fontFamily: 'monospace', fontSize: '12px', color: '#c8a97a' };

        const moveBtn = this.add.text(W / 2, ROW_H * 0.5, 'MOVE',   { ...base })
            .setOrigin(0.5, 0.5).setInteractive({ useHandCursor: true });
        const atkBtn  = this.add.text(W / 2, ROW_H * 1.5, 'ATTACK', { ...base })
            .setOrigin(0.5, 0.5).setInteractive({ useHandCursor: true });

        container.add([moveBtn, atkBtn]);

        moveBtn.on('pointerdown', () => {
            this.currentMode = 'move';
            if (this.selectedUnit) this.showMoveHighlights(this.selectedUnit);
            this.refreshModeButtonStyles(moveBtn, atkBtn);
        });
        moveBtn.on('pointerover', () => moveBtn.setStyle({ color: '#e8d0a0' }));
        moveBtn.on('pointerout',  () => this.refreshModeButtonStyles(moveBtn, atkBtn));

        atkBtn.on('pointerdown', () => {
            this.currentMode = 'attack';
            if (this.selectedUnit) this.showAttackHighlights(this.selectedUnit);
            this.refreshModeButtonStyles(moveBtn, atkBtn);
        });
        atkBtn.on('pointerover', () => atkBtn.setStyle({ color: '#f08060' }));
        atkBtn.on('pointerout',  () => this.refreshModeButtonStyles(moveBtn, atkBtn));

        // ── SPECIAL (only when SP gauge is full) ───────────────────────────────
        if (spFull) {
            const spBtn = this.add.text(W / 2, ROW_H * 2.5, 'SPECIAL',
                { ...base, color: '#e8c040' })
                .setOrigin(0.5, 0.5).setInteractive({ useHandCursor: true });
            container.add(spBtn);

            spBtn.on('pointerdown', () => {
                console.log('[SPECIAL] button clicked');
                this.executeSpecial();
            });
            spBtn.on('pointerover', () => spBtn.setStyle({ color: '#fff080' }));
            spBtn.on('pointerout',  () => spBtn.setStyle({ color: '#e8c040' }));
        }

        this.modePanel = container;
        this.refreshModeButtonStyles(moveBtn, atkBtn);
    }

    private refreshModeButtonStyles (moveBtn: GameObjects.Text, atkBtn: GameObjects.Text): void
    {
        moveBtn.setStyle({ color: this.currentMode === 'move'   ? '#e8d0a0' : '#7a6040' });
        atkBtn .setStyle({ color: this.currentMode === 'attack' ? '#f08060' : '#7a6040' });
    }

    private clearModeButtons (): void
    {
        // Destroying the container also destroys all its children (bg, absorber, texts).
        if (this.modePanel) {
            this.modePanel.destroy();
            this.modePanel = null;
        }
    }

    // ─── Status area (HP bar, Special bar, Reset button) ─────────────────────

    private setupStatusArea (): void
    {
        const gridBottom = this.originY + ROWS * CELL_SIZE;
        const cx         = this.scale.width / 2;   // horizontal canvas centre

        // Bar geometry
        const BAR_W = 240;
        const BAR_H = 14;
        const barX  = cx - BAR_W / 2;
        const labelX = barX - 6;  // right-align labels just left of bar

        const HP_Y  = gridBottom + 18;
        const SP_Y  = gridBottom + 46;
        const RST_Y = gridBottom + 76;

        const labelStyle = { fontFamily: 'monospace', fontSize: '11px', color: '#7a6040' };

        // Static labels
        this.add.text(labelX, HP_Y + BAR_H / 2, 'HP',      labelStyle)
            .setOrigin(1, 0.5).setDepth(10);
        this.add.text(labelX, SP_Y + BAR_H / 2, 'SP', labelStyle)
            .setOrigin(1, 0.5).setDepth(10);

        // Dynamic bar graphics (cleared and redrawn on value changes)
        this.hpBar = this.add.graphics().setDepth(10);
        this.spBar = this.add.graphics().setDepth(10);

        this.drawBar(this.hpBar, barX, HP_Y, BAR_W, BAR_H,
            this.villageHp,    VILLAGE_MAX_HP, 0x508020, 0xc03020);
        this.drawBar(this.spBar, barX, SP_Y, BAR_W, BAR_H,
            this.specialGauge, SPECIAL_MAX,    0x204888, 0x204888);

        // Reset button below the bars
        const btn = this.add.text(cx, RST_Y, '[ RESET ]', {
            fontFamily:      'monospace',
            fontSize:        '12px',
            color:           '#c8a97a',
            backgroundColor: '#2a1c0e',
            padding: { x: 8, y: 3 },
        }).setOrigin(0.5, 0.5).setDepth(10).setInteractive({ useHandCursor: true });

        btn.on('pointerover', () => btn.setStyle({ color: '#e8d0a0' }));
        btn.on('pointerout',  () => btn.setStyle({ color: '#c8a97a' }));
        btn.on('pointerdown', () => this.scene.restart());
    }

    /**
     * Draws a labelled horizontal bar.
     * Picks `lowColor` when value is at or below 30% of max.
     */
    private drawBar (
        gfx: GameObjects.Graphics,
        x: number, y: number, w: number, h: number,
        value: number, max: number,
        fillColor: number, lowColor: number
    ): void
    {
        gfx.clear();

        // Background track
        gfx.fillStyle(0x1a1008, 1);
        gfx.fillRect(x, y, w, h);
        gfx.lineStyle(1, 0x5a3e22, 1);
        gfx.strokeRect(x, y, w, h);

        // Filled portion
        const ratio  = Math.max(0, Math.min(1, value / max));
        const fillW  = Math.round((w - 2) * ratio);
        const color  = value / max <= 0.3 ? lowColor : fillColor;
        if (fillW > 0) {
            gfx.fillStyle(color, 1);
            gfx.fillRect(x + 1, y + 1, fillW, h - 2);
        }
    }

    private updateHpDisplay (): void
    {
        if (!this.hpBar) return;
        const gridBottom = this.originY + ROWS * CELL_SIZE;
        const barX = this.scale.width / 2 - 120;
        this.drawBar(this.hpBar, barX, gridBottom + 18, 240, 14,
            this.villageHp, VILLAGE_MAX_HP, 0x508020, 0xc03020);
    }

    private updateSpDisplay (): void
    {
        if (!this.spBar) return;
        const gridBottom = this.originY + ROWS * CELL_SIZE;
        const barX = this.scale.width / 2 - 120;
        this.drawBar(this.spBar, barX, gridBottom + 46, 240, 14,
            this.specialGauge, SPECIAL_MAX, 0x204888, 0x204888);
    }

    private gainSp (amount: number): void
    {
        this.specialGauge = Math.min(SPECIAL_MAX, this.specialGauge + amount);
        this.updateSpDisplay();
        console.log(`[SP] ${this.specialGauge}/${SPECIAL_MAX}`);
    }

    private damageVillage (): void
    {
        if (this.isGameOver) return;
        this.villageHp = Math.max(0, this.villageHp - 1);
        console.log(`[village] HP: ${this.villageHp}`);
        this.updateHpDisplay();
        if (this.villageHp <= 0) {
            this.isGameOver = true;
            this.showGameOver();
        }
    }

    private showGameClear (): void
    {
        const gridW = COLS * CELL_SIZE;
        const gridH = ROWS * CELL_SIZE;
        const midY  = this.originY + gridH / 2;
        const container = this.add.container(0, 0).setDepth(30);

        const bg = this.add.graphics();
        bg.fillStyle(0x000000, 0.78);
        bg.fillRect(this.originX, this.originY, gridW, gridH);
        container.add(bg);

        const title = this.add.text(512, midY - 24, 'STAGE CLEAR', {
            fontFamily: 'monospace', fontSize: '36px', color: '#e8c040',
        }).setOrigin(0.5, 0.5);
        container.add(title);

        const hint = this.add.text(512, midY + 28, 'click  [ RESET ]  to play again', {
            fontFamily: 'monospace', fontSize: '12px', color: '#c8a97a',
        }).setOrigin(0.5, 0.5);
        container.add(hint);
    }

    private showGameOver (): void
    {
        const gridW  = COLS * CELL_SIZE;
        const gridH  = ROWS * CELL_SIZE;
        const midY   = this.originY + gridH / 2;
        const container = this.add.container(0, 0).setDepth(30);

        const bg = this.add.graphics();
        bg.fillStyle(0x000000, 0.78);
        bg.fillRect(this.originX, this.originY, gridW, gridH);
        container.add(bg);

        const title = this.add.text(512, midY - 24, 'GAME OVER', {
            fontFamily: 'monospace', fontSize: '36px', color: '#e84030',
        }).setOrigin(0.5, 0.5);
        container.add(title);

        const hint = this.add.text(512, midY + 28, 'click  [ RESET ]  to try again', {
            fontFamily: 'monospace', fontSize: '12px', color: '#c8a97a',
        }).setOrigin(0.5, 0.5);
        container.add(hint);
    }

    // ─── Unit ─────────────────────────────────────────────────────────────────

    /** Creates and returns a Unit. Caller is responsible for pushing to units or enemies.
     *  refDim overrides the auto-detected max(srcW,srcH) — use for spritesheets where
     *  the texture is larger than a single character (e.g. enemy sheet). */
    private createUnit (
        id: string, label: string, cell: Cell, textureKey: string,
        refDim?: number, targetPx = UNIT_TARGET_PX
    ): Unit
    {
        const graphics = this.add.graphics().setDepth(3);

        const phaserFrame = this.textures.getFrame(textureKey);
        const srcW  = phaserFrame.realWidth;
        const srcH  = phaserFrame.realHeight;
        const scale = targetPx / (refDim ?? Math.max(srcW, srcH));

        const sprite = this.add.image(cell.cx, cell.cy, textureKey)
            .setOrigin(0.5, 0.5)
            .setScale(scale)
            .setDepth(4);

        const hitArea = this.add.circle(cell.cx, cell.cy, UNIT_HIT_RADIUS)
            .setInteractive({ useHandCursor: true })
            .setDepth(5);

        const unit: Unit = { id, label, cell, graphics, sprite, hitArea };
        this.drawUnit(unit, false);

        // Listener added after unit exists so the closure captures the correct reference
        hitArea.on('pointerdown', () => this.onUnitClick(unit));

        console.log(
            `[createUnit] ${label}` +
            ` | key="${textureKey}" ${srcW}×${srcH}` +
            ` | scale=${scale.toFixed(4)}` +
            ` | pos=(${cell.cx},${cell.cy})`
        );

        return unit;
    }

    private drawUnit (unit: Unit, selected: boolean): void
    {
        unit.graphics.clear();
        if (selected) {
            unit.graphics.lineStyle(2, 0xe8c040, 1);
            unit.graphics.strokeCircle(unit.cell.cx, unit.cell.cy, UNIT_HIT_RADIUS + 4);
            unit.graphics.lineStyle(1, 0xe8c040, 0.35);
            unit.graphics.strokeCircle(unit.cell.cx, unit.cell.cy, UNIT_HIT_RADIUS + 9);
        }
    }

    private onUnitClick (unit: Unit): void
    {
        if (this.isGameOver) return;

        if (this.enemies.includes(unit)) {
            // Enemy hitArea (depth 5) is topmost — it intercepts clicks even when the
            // player intends to attack the cell. Route into executeAttack if conditions met.
            console.log(`[click] enemy hitArea fired: ${unit.label} at ${unit.cell.label}` +
                ` | mode=${this.currentMode}` +
                ` | selectedUnit=${this.selectedUnit?.label ?? 'none'}` +
                ` | cellHighlighted=${this.highlightedCells.has(unit.cell)}`);

            if (this.currentMode === 'attack' && this.selectedUnit) {
                // Check by coordinates in case the cell reference diverged
                const isTarget = [...this.highlightedCells].some(
                    c => c.row === unit.cell.row && c.col === unit.cell.col
                );
                if (isTarget) {
                    this.executeAttack(this.selectedUnit, unit.cell);
                }
            }
            return;
        }

        if (this.selectedUnit === unit) {
            this.selectedUnit = null;
            this.currentMode = 'move';
            this.drawUnit(unit, false);
            this.clearMoveHighlights();
            this.clearModeButtons();
            console.log(`Deselected ${unit.label}`);
            return;
        }

        if (this.selectedUnit) this.drawUnit(this.selectedUnit, false);

        if (this.selectedCell) {
            this.drawCell(this.selectedCell, false);
            this.selectedCell = null;
        }

        this.selectedUnit = unit;
        this.currentMode = 'move';
        this.drawUnit(unit, true);
        this.showMoveHighlights(unit);
        this.showModeButtons();
        console.log(`Selected: ${unit.label} at ${unit.cell.label}`);
    }

    // ─── Cell ─────────────────────────────────────────────────────────────────

    private onCellClick (cell: Cell): void
    {
        if (this.isGameOver) return;
        if (this.selectedUnit && this.highlightedCells.has(cell)) {
            if (this.currentMode === 'move') {
                this.moveUnit(this.selectedUnit, cell);
            } else {
                this.executeAttack(this.selectedUnit, cell);
            }
            return;
        }

        if (this.selectedUnit) {
            this.drawUnit(this.selectedUnit, false);
            this.selectedUnit = null;
            this.currentMode = 'move';
            this.clearMoveHighlights();
            this.clearModeButtons();
        }

        if (this.selectedCell && this.selectedCell !== cell) {
            this.drawCell(this.selectedCell, false);
        }

        if (this.selectedCell === cell) {
            this.selectedCell = null;
            this.drawCell(cell, false);
            console.log(`Deselected ${cell.label}`);
        } else {
            this.selectedCell = cell;
            this.drawCell(cell, true);
            console.log(`Selected: ${cell.label} (col ${cell.col}, row ${cell.row})`);
        }
    }

    private drawCell (
        cell: Cell, selected: boolean,
        hovered = false, moveTarget = false, attackTarget = false
    ): void
    {
        cell.graphics.clear();

        let fill: number;
        let borderColor: number;
        let borderWidth: number;

        if (selected) {
            fill = 0x5c3a1a; borderColor = 0xc8922a; borderWidth = 2;
        } else if (attackTarget && hovered) {
            fill = 0x5c1808; borderColor = 0xe04030; borderWidth = 2;
        } else if (attackTarget) {
            fill = 0x3c0c04; borderColor = 0xc03020; borderWidth = 2;
        } else if (moveTarget && hovered) {
            fill = 0x504018; borderColor = 0xa07828; borderWidth = 1;
        } else if (moveTarget) {
            fill = 0x3c2c08; borderColor = 0xa07828; borderWidth = 1;
        } else if (hovered) {
            fill = 0x4a3018; borderColor = 0x5a3e22; borderWidth = 1;
        } else {
            fill = (cell.col + cell.row) % 2 === 0 ? 0x2a1c0e : 0x352414;
            borderColor = 0x5a3e22; borderWidth = 1;
        }

        cell.graphics.fillStyle(fill, 1);
        cell.graphics.fillRect(cell.x, cell.y, CELL_SIZE, CELL_SIZE);
        cell.graphics.lineStyle(borderWidth, borderColor, 1);
        cell.graphics.strokeRect(cell.x, cell.y, CELL_SIZE, CELL_SIZE);
    }
}
