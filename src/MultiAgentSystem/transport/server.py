import asyncio
import json
import sys
import traceback
import os
from llms.openrouter_client import OpenRouterClient

# Multi-workspace CodebaseService
from memory.chroma_store import ChromaVectorStore
from utils.code_chunker import UniversalChunker
from services.codebase_service import CodebaseService
from orchestrator.bridge.ide_bridge import ide_bridge

vector_store = ChromaVectorStore()
chunker = UniversalChunker()
codebase_service = CodebaseService(vector_store, chunker)

async def handle_client(reader: asyncio.StreamReader, writer: asyncio.StreamWriter):
    client = None
    
    try:
        while True:
            # Read line-delimited JSON or HTTP requests
            data = await reader.readline()
            if not data:
                break
            
            line_str = data.decode('utf-8').strip()
            
            # ---------------------------------------------------------
            # HTTP Intercept for Debug UI (/debug)
            # ---------------------------------------------------------
            if line_str.startswith("GET /debug"):
                html = """<html><body style="font-family: sans-serif; background: #0d1117; color: #e2e8f0; padding: 2rem;">
                    <h2>IDE Bridge Debug UI</h2>
                    <form onsubmit="execCall(event)">
                        Tool: <select id="act" style="padding: 0.5rem; margin-bottom: 1rem;" onchange="updateSample()">
                            <option value="run_terminal">Run Terminal</option>
                            <option value="edit_file">Edit File</option>
                            <option value="search_codebase">Search Codebase</option>
                            <option value="list_files">List Files</option>
                        </select><br>
                        Payload: <textarea id="payload" rows="6" cols="70" style="padding: 0.5rem; width: 100%; font-family: monospace;">ls -la</textarea><br><br>
                        <button type="submit" style="padding: 0.5rem 2rem; cursor: pointer;">Execute inside VS Code</button>
                    </form>
                    <pre id="res" style="background: #161b22; padding: 1rem; border-radius: 8px; margin-top: 1rem; white-space: pre-wrap;"></pre>
                    <script>
                    function updateSample() {
                        const act = document.getElementById('act').value;
                        const tv = document.getElementById('payload');
                        if (act === 'run_terminal') {
                            tv.value = 'ls -la';
                        } else if (act === 'edit_file') {
                            tv.value = JSON.stringify({
                                "file_path": "/Users/sashanth/Documents/VoiceIde/test.py",
                                "content": "print('File updated natively by Voice IDE Agent!')"
                            }, null, 2);
                        } else if (act === 'search_codebase') {
                            tv.value = JSON.stringify({
                                "workspace_id": "VoiceIde",
                                "query": "vector embedding insertion logic"
                            }, null, 2);
                        } else if (act === 'list_files') {
                            tv.value = "{}";
                        }
                    }
                    async function execCall(e) {
                        e.preventDefault();
                        const act = document.getElementById('act').value;
                        const payload = document.getElementById('payload').value;
                        document.getElementById('res').innerText = "Executing...";
                        const res = await fetch('/execute', {
                            method: 'POST', 
                            body: JSON.stringify({action: act, payload: payload})
                        });
                        const j = await res.json();
                        document.getElementById('res').innerText = JSON.stringify(j, null, 2);
                    }
                    </script>
                </body></html>"""
                response = f"HTTP/1.1 200 OK\r\nContent-Type: text/html\r\nContent-Length: {len(html)}\r\n\r\n{html}"
                writer.write(response.encode('utf-8'))
                await writer.drain()
                writer.close()
                return

            elif line_str.startswith("POST /execute"):
                # Read headers
                content_length = 0
                while True:
                    hdr = await reader.readline()
                    if hdr == b'\r\n' or not hdr: break
                    if hdr.lower().startswith(b"content-length:"):
                        content_length = int(hdr.split(b":")[1].strip())
                body = await reader.readexactly(content_length)
                req = json.loads(body.decode('utf-8'))
                act = req.get("action")
                payload = req.get("payload")
                
                try:
                    if act == "run_terminal":
                        res = await ide_bridge.run_terminal(payload)
                    elif act == "edit_file":
                        pdict = json.loads(payload)
                        res = await ide_bridge.edit_file(pdict["file_path"], pdict["content"])
                    elif act == "list_files":
                        res = await ide_bridge.list_files()
                    elif act == "search_codebase":
                        pdict = json.loads(payload)
                        import dataclasses
                        results = await codebase_service.search_codebase(pdict["workspace_id"], pdict["query"], limit=5)
                        res = [dataclasses.asdict(r) for r in results]
                    else:
                        res = "Unknown action"
                    
                    res_json = json.dumps({"success": res})
                    response = f"HTTP/1.1 200 OK\r\nContent-Type: application/json\r\nContent-Length: {len(res_json)}\r\n\r\n{res_json}"
                except Exception as e:
                    err = str(e)
                    response = f"HTTP/1.1 500 ERROR\r\nContent-Type: text/plain\r\nContent-Length: {len(err)}\r\n\r\n{err}"
                
                writer.write(response.encode('utf-8'))
                await writer.drain()
                writer.close()
                return

            # ---------------------------------------------------------
            # Standard Socket JSON-RPC
            # ---------------------------------------------------------
            try:
                payload = json.loads(line_str)
            except json.JSONDecodeError:
                continue

            action = payload.get("action", "chat")
            
            if action == "register_ide_frontend":
                ide_bridge.attach_frontend(writer)
                continue
                
            elif action in ["edit_file_response", "run_terminal_response"]:
                request_id = payload.get("request_id")
                ide_bridge.trigger_response(request_id, payload)
                continue
            
            if action == "index_workspace":
                workspace_id = payload.get("workspace_id", "default")
                file_paths = payload.get("file_paths", [])
                
                try:
                    result = await codebase_service.index_files(workspace_id, file_paths)
                    res_dict = {
                        "action": "index_workspace_result",
                        "files_scanned": result.files_scanned,
                        "chunks_added": result.chunks_added,
                        "chunks_updated": result.chunks_updated,
                        "files_skipped": result.files_skipped,
                        "done": True
                    }
                    writer.write(json.dumps(res_dict).encode('utf-8') + b'\n')
                except Exception as e:
                    writer.write(json.dumps({"error": str(e), "done": True}).encode('utf-8') + b'\n')
                await writer.drain()
                continue

            elif action == "search_codebase":
                workspace_id = payload.get("workspace_id", "default")
                query = payload.get("query", "")
                limit = payload.get("limit", 5)
                
                try:
                    results = await codebase_service.search_codebase(workspace_id, query, limit)
                    res_dict = {
                        "action": "search_codebase_result",
                        "results": [
                            {
                                "file_path": c.file_path,
                                "start_line": c.start_line,
                                "end_line": c.end_line,
                                "scope": c.scope,
                                "chunk_type": c.chunk_type,
                                "preview": c.embedded_text[:300]
                            } for c in results
                        ],
                        "done": True
                    }
                    writer.write(json.dumps(res_dict).encode('utf-8') + b'\n')
                except Exception as e:
                    writer.write(json.dumps({"error": str(e), "done": True}).encode('utf-8') + b'\n')
                await writer.drain()
                continue
                
            elif action == "chat":
                api_key = payload.get("apiKey")
                model = payload.get("model", "google/gemini-2.0-flash-001")
                prompt = payload.get("prompt", "")
                history = payload.get("history", [])

                if api_key:
                    client = OpenRouterClient(api_key=api_key, model=model)
                elif not client:
                    writer.write(json.dumps({"error": "Missing apiKey in first request"}).encode('utf-8') + b'\n')
                    await writer.drain()
                    continue
                
                # Start yielding chunks
                try:
                    for chunk in client.generate_streaming_response(prompt, history):
                        # Check if the chunk is an error emitted by the client
                        if chunk.startswith('{"error":'):
                            error_msg = json.loads(chunk).get("error")
                            writer.write(json.dumps({"error": error_msg}).encode('utf-8') + b'\n')
                            break
                        else:
                            writer.write(json.dumps({"chunk": chunk}).encode('utf-8') + b'\n')
                            await writer.drain()
                    
                    # Signal completion
                    writer.write(json.dumps({"done": True}).encode('utf-8') + b'\n')
                    await writer.drain()
                    
                except Exception as e:
                    err_msg = traceback.format_exc()
                    writer.write(json.dumps({"error": f"Internal Error: {str(e)}\n{err_msg}"}).encode('utf-8') + b'\n')
                    await writer.drain()
                
    except asyncio.IncompleteReadError:
        pass
    except Exception as e:
        print(f"Connection error: {e}", file=sys.stderr)
    finally:
        writer.close()
        await writer.wait_closed()

async def main(port: int):
    server = await asyncio.start_server(handle_client, '127.0.0.1', port)
    
    actual_port = server.sockets[0].getsockname()[1]
    print(f"SERVER_READY:{actual_port}", flush=True)

    async with server:
        await server.serve_forever()

if __name__ == '__main__':
    if len(sys.argv) < 2:
        print("Usage: python server.py <port>")
        sys.exit(1)
        
    port = int(sys.argv[1])
    # For Windows compatibility if needed, though OS is Mac:
    if sys.platform == 'win32':
        asyncio.set_event_loop_policy(asyncio.WindowsSelectorEventLoopPolicy())
        
    try:
        asyncio.run(main(port))
    except KeyboardInterrupt:
        pass
