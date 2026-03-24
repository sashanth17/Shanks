import { spawn, ChildProcess } from "child_process";
import * as net from "net";
import * as path from "path";
import * as fs from "fs";
import * as vscode from "vscode";
import { Logger } from "./logger";

export class PythonServerManager {
    private static _instance: PythonServerManager;
    private _pythonProcess: ChildProcess | null = null;
    private _port: number = 0;
    private _readyPromise: Promise<void> | null = null;
    private _resolveReady!: () => void;
    private _rejectReady!: (err: any) => void;

    private constructor() {}

    public static getInstance(): PythonServerManager {
        if (!PythonServerManager._instance) {
            PythonServerManager._instance = new PythonServerManager();
        }
        return PythonServerManager._instance;
    }

    public get port(): number {
        return this._port;
    }

    public async start(extensionUri: vscode.Uri): Promise<void> {
        if (this._readyPromise) return this._readyPromise;

        this._readyPromise = new Promise((resolve, reject) => {
            this._resolveReady = resolve;
            this._rejectReady = reject;

            const dbgLog = (msg: string) => {
                Logger.info(msg);
                try {
                    fs.appendFileSync('/Users/sashanth/Documents/VoiceIde/extension_debug.log', `[${new Date().toISOString()}] ${msg}\n`);
                } catch(e) {}
            };

            const pythonScript = vscode.Uri.joinPath(extensionUri, 'src', 'python', 'server.py').fsPath;
            const srcPythonDir = vscode.Uri.joinPath(extensionUri, 'src', 'python').fsPath;

            let pythonPath = vscode.workspace.getConfiguration('shanks').get<string>('pythonPath');
            const isWin = process.platform === 'win32';
            const venvBase = vscode.Uri.joinPath(extensionUri, 'src', 'python', 'venv').fsPath;
            const venvBin = path.join(venvBase, isWin ? 'Scripts' : 'bin');
            const venvPythonPath = path.join(venvBin, isWin ? 'python.exe' : 'python3');

            dbgLog(`Initial configured pythonPath: ${pythonPath}`);
            dbgLog(`Checking venv path: ${venvPythonPath}`);

            if (!pythonPath || pythonPath.trim() === 'python3' || pythonPath.trim() === '') {
                if (fs.existsSync(venvPythonPath)) {
                    pythonPath = venvPythonPath;
                    dbgLog(`Auto-detected virtual environment at ${pythonPath}`);
                } else {
                    pythonPath = 'python3';
                    dbgLog(`Venv not found, falling back to python3`);
                }
            }
            
            const spawnEnv = { 
                ...process.env, 
                PYTHONPATH: srcPythonDir,
                VIRTUAL_ENV: venvBase,
                PATH: `${venvBin}${path.delimiter}${process.env.PATH || ''}`
            };

            dbgLog(`Spawning: ${pythonPath} ${pythonScript} (cwd: ${srcPythonDir})`);
            
            try {
                this._pythonProcess = spawn(pythonPath, [pythonScript, '0'], {
                    env: spawnEnv,
                    cwd: srcPythonDir
                });
            } catch(e: any) {
                dbgLog(`Sync spawn exception: ${e.message}`);
                this._rejectReady(e);
                return;
            }

            this._pythonProcess.stdout?.on('data', (data) => {
                const output = data.toString();
                dbgLog(`STDOUT: ${output}`);
                const match = output.match(/SERVER_READY:(\d+)/);
                if (match) {
                    this._port = parseInt(match[1], 10);
                    dbgLog(`Server ready on TCP port ${this._port}`);
                    this._resolveReady();
                }
            });

            this._pythonProcess.stderr?.on('data', (data) => {
                dbgLog(`STDERR: ${data.toString()}`);
            });

            this._pythonProcess.on('error', (err) => {
                dbgLog(`Failed to start: ${err.message}`);
                this._rejectReady(err);
            });
            
            this._pythonProcess.on('exit', (code) => {
                dbgLog(`Exited with code ${code}`);
                // Check if it exited before we resolved
                if (this._port === 0) {
                    this._rejectReady(new Error(`Python server exited unexpectedly with code ${code}`));
                }
                this._readyPromise = null;
            });
        });

        return this._readyPromise;
    }

    public async createSocket(): Promise<net.Socket> {
        await this._readyPromise;
        if (!this._port) {
            throw new Error("Python Server is not running yet.");
        }
        return net.connect(this._port, '127.0.0.1');
    }

    /**
     * Sends a one-off request, buffering the complete response until `{done: true}`.
     * Perfect for fetching Vector DB results.
     */
    public async sendRequest(payload: any): Promise<any> {
        return new Promise(async (resolve, reject) => {
            const socket = await this.createSocket();
            let dataBuffer = "";
            let finalResult: any = null;

            socket.on('data', (data) => {
                dataBuffer += data.toString();
                let boundary = dataBuffer.indexOf("\\n");
                
                while (boundary !== -1) {
                    const line = dataBuffer.slice(0, boundary).trim();
                    dataBuffer = dataBuffer.slice(boundary + 1);
                    boundary = dataBuffer.indexOf("\\n");

                    if (!line) continue;

                    try {
                        const parsed = JSON.parse(line);
                        if (parsed.error) {
                            socket.destroy();
                            reject(new Error(parsed.error));
                            return;
                        } 
                        
                        if (parsed.done) {
                            socket.destroy();
                            resolve(finalResult || parsed);
                            return;
                        } else {
                            if (parsed.action) {
                                finalResult = parsed; 
                            }
                        }
                    } catch (e) {
                        Logger.error("Failed to parse socket chunk:", e);
                    }
                }
            });

            socket.on('error', (err) => {
                socket.destroy();
                reject(err);
            });

            socket.write(JSON.stringify(payload) + "\\n");
        });
    }

    public dispose() {
        if (this._pythonProcess) {
            this._pythonProcess.kill();
        }
    }
}
