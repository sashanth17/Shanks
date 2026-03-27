import json
import urllib.request
import ssl
from typing import List, Dict, Any, Generator
from interfaces import IAIClient

class OpenRouterClient(IAIClient):
    def __init__(self, api_key: str, model: str = "google/gemini-2.0-flash-001"):
        self.api_key = api_key
        self.model = model
        self.endpoint = "https://openrouter.ai/api/v1/chat/completions"

    def generate_streaming_response(self, prompt: str, history: List[Dict[str, Any]]) -> Generator[str, None, None]:
        messages = [
            {
                "role": "system",
                "content": "You are Shanks, a helpful AI coding assistant inside VS Code. Provide concise and helpful answers for developers."
            }
        ]
        
        for msg in history:
            messages.append({"role": msg.get("role", "user"), "content": msg.get("content", "")})
            
        messages.append({"role": "user", "content": prompt})

        data = json.dumps({
            "model": self.model,
            "stream": True,
            "messages": messages
        }).encode('utf-8')

        headers = {
            "Authorization": f"Bearer {self.api_key}",
            "Content-Type": "application/json"
        }

        req = urllib.request.Request(self.endpoint, data=data, headers=headers, method="POST")

        # Bypass macOS SSL certificate verification error
        context = ssl._create_unverified_context()

        try:
            with urllib.request.urlopen(req, context=context) as response:
                for line in response:
                    line = line.decode('utf-8').strip()
                    if line.startswith("data: "):
                        content = line[6:]
                        if content == "[DONE]":
                            break
                        try:
                            parsed = json.loads(content)
                            choices = parsed.get("choices", [])
                            if choices:
                                delta = choices[0].get("delta", {})
                                chunk = delta.get("content", "")
                                if chunk:
                                    yield chunk
                        except json.JSONDecodeError:
                            continue
        except Exception as e:
            # Yield error as a special chunk or re-raise
            yield json.dumps({"error": str(e)})
