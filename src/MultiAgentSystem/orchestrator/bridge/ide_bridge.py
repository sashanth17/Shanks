import asyncio
import json
import uuid
import sys
from typing import Dict, Any, Optional

class IDEBridgeService:
    """
    A globally accessible singleton service that future Python Agents can import
    to manipulate the VS Code editor environments (Typing blocks, Running terminal commands).
    It works by beaming payloads back over a dedicated `writer` bound to the VS Code UI daemon.
    """
    def __init__(self):
        self._writer: Optional[asyncio.StreamWriter] = None
        self._pending_requests: Dict[str, asyncio.Future] = {}

    def attach_frontend(self, writer: asyncio.StreamWriter):
        """Bind the active VS Code Daemon connection to this service."""
        self._writer = writer
        print("[IDE Bridge] VS Code Frontend Daemon Attached successfully.", file=sys.stderr)

    def trigger_response(self, request_id: str, data: Any):
        """Called by server.py when VS Code responds to a pending RPC call."""
        if request_id in self._pending_requests:
            self._pending_requests[request_id].set_result(data)

    async def _send_rpc(self, action: str, payload: Dict[str, Any]) -> Any:
        if not self._writer:
            raise RuntimeError("IDE Frontend is not attached. Cannot execute tool.")
        
        request_id = str(uuid.uuid4())
        packet = {
            "action": action,
            "request_id": request_id,
            **payload
        }
        
        future = asyncio.get_running_loop().create_future()
        self._pending_requests[request_id] = future
        
        try:
            self._writer.write(json.dumps(packet).encode('utf-8') + b'\n')
            await self._writer.drain()
            # Wait for VS Code to execute and return the payload with this request_id
            return await asyncio.wait_for(future, timeout=30.0)
        finally:
            self._pending_requests.pop(request_id, None)

    async def edit_file(self, file_path: str, new_content: str) -> bool:
        """
        Sends an instruction to VS Code to natively edit the file in the workspace using WorkspaceEdit.
        """
        res = await self._send_rpc("edit_file", {
            "file_path": file_path,
            "content": new_content
        })
        return res.get("success", False)

    async def run_terminal(self, command: str) -> Dict[str, Any]:
        """
        Sends an instruction to VS Code to execute the shell command and return its output.
        """
        res = await self._send_rpc("run_terminal", {
            "command": command
        })
        return res

    async def list_files(self) -> Dict[str, Any]:
        """
        Sends an instruction to VS Code to natively list all non-ignored files in the workspace.
        """
        res = await self._send_rpc("list_files", {})
        return res

# Global instantiated singleton
ide_bridge = IDEBridgeService()
