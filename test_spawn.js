const { spawn } = require('child_process');
const path = require('path');
const fs = require('fs');

const extensionRoot = '/Users/sashanth/Documents/VoiceIde';
const pythonScript = path.join(extensionRoot, 'src', 'python', 'server.py');
const srcPythonDir = path.join(extensionRoot, 'src', 'python');
const isWin = process.platform === 'win32';
const venvBase = path.join(srcPythonDir, 'venv');
const venvBin = path.join(venvBase, isWin ? 'Scripts' : 'bin');
const venvPythonPath = path.join(venvBin, isWin ? 'python.exe' : 'python3');

let pythonPath = 'python3';
if (fs.existsSync(venvPythonPath)) {
    pythonPath = venvPythonPath;
    console.log(`Auto-detected virtual environment at ${pythonPath}`);
} else {
    console.log(`Venv missing at ${venvPythonPath}, falling back to python3`);
}

const spawnEnv = { 
    ...process.env, 
    PYTHONPATH: srcPythonDir,
    VIRTUAL_ENV: venvBase,
    PATH: `${venvBin}${path.delimiter}${process.env.PATH || ''}`
};

console.log(`Spawning: ${pythonPath} ${pythonScript}`);

const p = spawn(pythonPath, [pythonScript, '0'], {
    env: spawnEnv,
    cwd: srcPythonDir
});

p.stdout.on('data', d => console.log('STDOUT:', d.toString()));
p.stderr.on('data', d => console.log('STDERR:', d.toString()));
p.on('error', e => console.error('ERROR:', e));
p.on('exit', c => console.log('EXIT:', c));

// Kill it after 2 seconds to not hang
setTimeout(() => {
    console.log('Timeout reached, killing process.');
    p.kill();
}, 2000);
