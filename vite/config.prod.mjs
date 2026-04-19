import { defineConfig } from 'vite';
import fs from 'fs';
import path from 'path';

const phasermsg = () => {
    return {
        name: 'phasermsg',
        buildStart() {
            process.stdout.write(`Building for production...\n`);
        },
        buildEnd() {
            const line = "---------------------------------------------------------";
            const msg = `❤️❤️❤️ Tell us about your game! - games@phaser.io ❤️❤️❤️`;
            process.stdout.write(`${line}\n${msg}\n${line}\n`);

            process.stdout.write(`✨ Done ✨\n`);
        }
    }
}

const nojekyll = () => ({
    name: 'nojekyll',
    closeBundle() {
        fs.writeFileSync(path.resolve('docs', '.nojekyll'), '');
    }
});

export default defineConfig({
    base: '/td-game/',
    logLevel: 'warning',
    build: {
        outDir: 'docs',
        emptyOutDir: true,
        rollupOptions: {
            output: {
                manualChunks: {
                    phaser: ['phaser']
                }
            }
        },
        minify: 'terser',
        terserOptions: {
            compress: {
                passes: 2
            },
            mangle: true,
            format: {
                comments: false
            }
        }
    },
    server: {
        port: 8080
    },
    plugins: [
        phasermsg(),
        nojekyll()
    ]
});
