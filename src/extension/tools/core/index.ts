import { PythonServerManager } from '../../pythonServer';
import { Logger } from '../../general_utils/logger';
import { ToolRouter } from './routes';

export class AgentBridgeDaemon {
    public static async start() {
        try {
            const socket = await PythonServerManager.getInstance().createSocket();
            Logger.info(`[AgentBridge] Attached to Python Server.`);

            // Send registration hook immediately
            socket.write(JSON.stringify({ action: "register_ide_frontend" }) + "\n");

            let dataBuffer = "";
            const router = new ToolRouter();

            socket.on('data', async (data) => {
                dataBuffer += data.toString();
                let boundary = dataBuffer.indexOf("\n");
                
                while (boundary !== -1) {
                    const line = dataBuffer.slice(0, boundary).trim();
                    dataBuffer = dataBuffer.slice(boundary + 1);
                    boundary = dataBuffer.indexOf("\n");

                    if (!line) continue;

                    try {
                        const parsed = JSON.parse(line);
                        
                        // Handle tool requests concurrently without relying on if/else
                        (async () => {
                            try {
                                const response = await router.route(parsed);
                                if (response) {
                                    socket.write(JSON.stringify(response) + "\n");
                                }
                            } catch (e: any) {
                                Logger.error(`[AgentBridge] Tool execution error`, e);
                            }
                        })();

                    } catch (e) {
                        Logger.error("[AgentBridge] Failed to parse payload:", e);
                    }
                }
            });

            socket.on('error', (err) => {
                Logger.error("[AgentBridge] Socket error:", err);
            });
            
            socket.on('close', () => {
                Logger.info("[AgentBridge] Socket closed. Attempting reconnect in 5s...");
                setTimeout(() => this.start(), 5000);
            });

        } catch (e) {
            Logger.error(`[AgentBridge] Connection failed`, e);
            setTimeout(() => this.start(), 5000);
        }
    }
}
