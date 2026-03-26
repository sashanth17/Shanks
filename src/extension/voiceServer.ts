import * as http from 'http';
import * as path from 'path';
import * as fs from 'fs';
import * as vscode from 'vscode';
import express, { Request, Response } from 'express';
import { Logger } from './general_utils/logger';
import { WsHandler } from '../voice/server/wsHandler';
import type { WebSocket as WsClient, WebSocketServer as WssType } from 'ws';

// eslint-disable-next-line @typescript-eslint/no-require-imports
const { WebSocketServer } = require('ws') as { WebSocketServer: new (opts: object) => WssType };

/**
 * VoiceServer
 *
 * Serves the standalone React voice UI at http://127.0.0.1:PORT
 * and brokers WebSocket communication between the voice browser page
 * and the VS Code extension host.
 *
 * Why localhost?
 * VS Code WebviewViews have a restrictive Permissions Policy that blocks
 * navigator.mediaDevices.getUserMedia (microphone). Localhost pages served
 * by a Node.js server don't have this restriction — Electron treats them
 * as fully-permissioned secure contexts.
 */
export class VoiceServer {
  private _app = express();
  private _server: http.Server | null = null;
  private _wss: WssType | null = null;
  private _port = 0;
  private readonly _distPath: string;

  constructor(
    extensionUri: vscode.Uri,
    private readonly _onTranscript: (text: string, isFinal: boolean) => void,
    private readonly _onStateChange: (state: string) => void
  ) {
    this._distPath = path.join(extensionUri.fsPath, 'dist');
    this._setupRoutes();
  }

  private _setupRoutes(): void {
    // CORS for VS Code webview origins
    this._app.use((_req, res, next) => {
      res.setHeader('Access-Control-Allow-Origin', '*');
      next();
    });

    // Serve the voice SPA
    this._app.get('/', (_req: Request, res: Response) => {
      res.setHeader('Content-Type', 'text/html');
      res.send(this._buildVoiceHtml());
    });

    // Serve the bundled JS
    this._app.get('/voice-app.js', (_req: Request, res: Response) => {
      const filePath = path.join(this._distPath, 'voice-app.js');
      if (fs.existsSync(filePath)) {
        res.setHeader('Content-Type', 'application/javascript');
        fs.createReadStream(filePath).pipe(res);
      } else {
        Logger.error('[VoiceServer] dist/voice-app.js not found.');
        res.status(404).send('voice-app.js not found — run npm run build');
      }
    });
  }

  public async start(): Promise<number> {
    return new Promise((resolve, reject) => {
      this._server = http.createServer(this._app);

      // WebSocket server on the same http server
      this._wss = new WebSocketServer({ server: this._server, path: '/ws' });
      const wsHandler = new WsHandler(this._onTranscript, this._onStateChange);

      this._wss.on('connection', (ws: WsClient) => {
        Logger.info('[VoiceServer] Voice UI connected via WebSocket.');
        ws.on('message', (data: Buffer) => {
          wsHandler.handle(ws, data.toString()).catch((err: Error) => {
            Logger.error('[VoiceServer] WsHandler error.', err);
          });
        });
        ws.on('close', () => Logger.info('[VoiceServer] Voice UI WebSocket closed.'));
        ws.on('error', (err: Error) => Logger.error('[VoiceServer] WebSocket error.', err));
      });

      // Port 0 → OS assigns a free port
      this._server.listen(0, '127.0.0.1', () => {
        const addr = this._server!.address();
        this._port = typeof addr === 'object' && addr ? addr.port : 0;
        Logger.info(`[VoiceServer] Voice UI at http://127.0.0.1:${this._port}`);
        resolve(this._port);
      });

      this._server.on('error', reject);
    });
  }

  public get port(): number { return this._port; }
  public get url(): string { return `http://127.0.0.1:${this._port}`; }

  public dispose(): void {
    this._wss?.close();
    this._server?.close();
    Logger.info('[VoiceServer] Stopped.');
  }

  public broadcast(message: object): void {
    if (!this._wss) return;
    const data = JSON.stringify(message);
    this._wss.clients.forEach((client) => {
      if (client.readyState === 1) { // 1 = OPEN
        client.send(data);
      }
    });
  }

  // ─── Voice HTML ────────────────────────────────────────────────────────────

  private _buildVoiceHtml(): string {
    return `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<title>Shanks Voice</title>
<style>
  *{margin:0;padding:0;box-sizing:border-box}
  html,body{width:100%;height:100%;background:#0d1117;display:flex;flex-direction:column;
    align-items:center;justify-content:space-between;padding:2.5rem 1.5rem;
    font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif;
    color:#e2e8f0;overflow:hidden}

  #status{text-align:center;display:flex;flex-direction:column;gap:4px}
  #label{font-size:1.15rem;font-weight:300;letter-spacing:.03em}
  #provider{font-size:.6rem;text-transform:uppercase;letter-spacing:.15em;opacity:.25}

  #orb-wrap{position:relative;display:flex;align-items:center;justify-content:center}

  .glow{position:absolute;width:9rem;height:9rem;border-radius:50%;filter:blur(28px);
    transition:all .8s ease;opacity:0;transform:scale(0)}
  .glow.listening{background:#2563eb;opacity:.25;transform:scale(1.5)}
  .glow.speaking{background:#059669;opacity:.25;transform:scale(1.5)}
  .glow.ai_processing{background:#7c3aed;opacity:.18;transform:scale(1.15)}

  .orb{position:relative;z-index:1;width:7.5rem;height:7.5rem;border-radius:50%;
    border:3px solid rgba(255,255,255,.08);background:rgba(255,255,255,.04);
    display:flex;align-items:center;justify-content:center;
    cursor:pointer;transition:all .5s ease}
  .orb svg{width:2.6rem;height:2.6rem;color:rgba(255,255,255,.18);transition:color .3s}

  .orb.listening{background:#2563eb;border-color:#60a5fa;
    box-shadow:0 0 40px rgba(37,99,235,.4);animation:pulse 2s ease-in-out infinite}
  .orb.listening svg{color:#fff}
  .orb.speaking{background:#059669;border-color:#34d399;box-shadow:0 0 40px rgba(5,150,105,.4)}
  .orb.ai_processing{background:#7c3aed;border-color:#a78bfa;box-shadow:0 0 30px rgba(124,58,237,.3)}

  @keyframes pulse{0%,100%{transform:scale(1)}50%{transform:scale(1.07)}}

  #bars{display:none;gap:3px;align-items:center}
  #bars span{width:4px;border-radius:2px;background:#fff;
    animation:bar .5s ease-in-out infinite alternate}
  #bars span:nth-child(2){animation-delay:.08s;height:14px}
  #bars span:nth-child(3){animation-delay:.16s;height:10px}
  #bars span:nth-child(4){animation-delay:.24s;height:14px}
  #bars span:nth-child(5){animation-delay:.32s;height:8px}
  @keyframes bar{from{height:8px}to{height:20px}}

  #dots{display:none;gap:6px;align-items:center}
  #dots span{width:8px;height:8px;border-radius:50%;background:rgba(255,255,255,.7);
    animation:dot .6s ease-in-out infinite}
  #dots span:nth-child(2){animation-delay:.2s}
  #dots span:nth-child(3){animation-delay:.4s}
  @keyframes dot{0%,100%{transform:translateY(0)}50%{transform:translateY(-7px)}}

  #transcript{text-align:center;min-height:3rem;display:flex;align-items:center;
    justify-content:center;font-size:.85rem;font-style:italic;
    color:rgba(96,165,250,.8);max-width:240px;line-height:1.5;padding:0 1rem}

  #ai-response{text-align:center;min-height:2.5rem;display:flex;align-items:center;
    justify-content:center;font-size:.8rem;color:rgba(255,255,255,.3);
    max-width:260px;line-height:1.5;padding:0 1rem}

  #error-banner{display:none;background:rgba(239,68,68,.15);border:1px solid rgba(239,68,68,.3);
    border-radius:12px;padding:.75rem 1rem;font-size:.75rem;color:#fca5a5;text-align:center;
    max-width:280px}
</style>
</head>
<body>
  <div id="status">
    <div id="label">Connecting…</div>
    <div id="provider">Shanks + Deepgram</div>
  </div>

  <div id="orb-wrap">
    <div class="glow" id="glow"></div>
    <div class="orb" id="orb" onclick="handleOrbClick()">
      <div id="bars"><span></span><span></span><span></span><span></span><span></span></div>
      <div id="dots"><span></span><span></span><span></span></div>
      <svg id="mic-icon" fill="none" stroke="currentColor" viewBox="0 0 24 24">
        <path stroke-linecap="round" stroke-linejoin="round" stroke-width="1.5"
          d="M19 11a7 7 0 01-7 7m0 0a7 7 0 01-7-7m7 7v4m0 0H8m4 0h4m-4-8a3 3 0 01-3-3V5a3 3 0 116 0v6a3 3 0 01-3 3z"/>
      </svg>
    </div>
  </div>

  <div id="transcript">Click the Above orb to get started</div>
  <div id="ai-response"></div>
  <div id="error-banner"></div>

  <script>window.VOICE_WS_PORT = ${this._port};</script>
  <script src="/voice-app.js"></script>
</body>
</html>`;
  }
}
