import asyncio
import sys
import os
import glob

# Ensure the root src/MultiAgentSystem is in path if executed directly
sys.path.insert(0, os.path.abspath(os.path.join(os.path.dirname(__file__), '..')))

from memory.chroma_store import ChromaVectorStore
from utils.code_chunker import UniversalChunker
from services.codebase_service import CodebaseService
from llms.openrouter_client import OpenRouterClient
from dotenv import load_dotenv
load_dotenv()

async def main():
    print("==========================================")
    print(" MultiAgentSystem - Standalone Console HQ ")
    print("==========================================")
    print("Initializing core services...\n")
    
    api_key = os.environ.get("OPENROUTER_API_KEY", "")
    if not api_key:
        print("[WARNING] OPENROUTER_API_KEY not found in environment. Chat will not work unless provided.")
    
    try:
        vector_store = ChromaVectorStore()
        chunker = UniversalChunker()
        codebase_service = CodebaseService(vector_store, chunker)
        llm_client = OpenRouterClient(api_key=api_key) if api_key else None
        print("[OK] Services booted up successfully.\n")
    except Exception as e:
        print(f"[ERROR] Failed to boot services: {e}")
        return

    print("Available commands:")
    print("  search <query>   - Semantic search across the indexed 'default' workspace")
    print("  index <path>     - Parse and index a file or dir into ChromaDB")
    print("  list             - List files matching supported chunk extensions in current dir")
    print("  chat <message>   - Chat with the AI using OpenRouter")
    print("  exit / quit      - Terminate the console")

    chat_history = []

    while True:
        try:
            cmd = input("\nMAS Console > ").strip()
            if not cmd:
                continue
                
            if cmd in ["exit", "quit"]:
                print("Shutting down...")
                break
                
            if cmd.startswith("search "):
                query = cmd[len("search "):].strip()
                results = await codebase_service.search_codebase("default", query)
                if not results:
                    print("No results found.")
                for i, r in enumerate(results, 1):
                    preview = (r.embedded_text[:100] + "...") if len(r.embedded_text) > 100 else r.embedded_text
                    preview = preview.replace("\n", " ")
                    print(f"\n[{i}] {r.file_path} (Line {r.start_line}) | Scope: {r.scope}")
                    print(f"    Excerpt: {preview}")
                    
            elif cmd.startswith("index "):
                path = cmd[len("index "):].strip()
                files_to_index = []
                
                if os.path.isfile(path):
                    files_to_index.append(path)
                elif os.path.isdir(path):
                    for ext in codebase_service.supported_extensions:
                        files_to_index.extend(glob.glob(os.path.join(path, f"**/*{ext}"), recursive=True))
                else:
                    print(f"Path not found: {path}")
                    continue
                    
                print(f"Indexing {len(files_to_index)} file(s)...")
                try:
                    result = await codebase_service.index_files("default", files_to_index)
                    print(f"Scanned {result.files_scanned} files.")
                    print(f"Added {result.chunks_added} fresh chunks.")
                    print(f"Updated {result.chunks_updated} altered chunks.")
                    print(f"Skipped {result.files_skipped} unchanged files.")
                except Exception as e:
                    print(f"Indexing error: {e}")
                    
            elif cmd == "list":
                print("Supported extensions:", codebase_service.supported_extensions)
                files=await codebase_service.get_file_structure('medicare_booking','/Users/sashanth/Documents/telemedicalCare/medicare_backend/medicare_booking/seed_data.py')
                print(files)
                for ext in codebase_service.supported_extensions:
                    for f in glob.glob(f"*{ext}"):
                        print(" -", getattr(os.path, 'abspath', lambda x: x)(f))
                        
            elif cmd.startswith("chat "):
                if not llm_client:
                    print("Cannot chat: OPENROUTER_API_KEY environment variable is not set.")
                    continue
                
                prompt = cmd[len("chat "):].strip()
                print(f"AI: ", end="", flush=True)
                full_reply = ""
                try:
                    for chunk in llm_client.generate_streaming_response(prompt, chat_history):
                        if '{"error":' in chunk:
                            print(f"\n[API ERROR] {chunk}")
                            break
                        print(chunk, end="", flush=True)
                        full_reply += chunk
                    print()
                    
                    chat_history.append({"role": "user", "content": prompt})
                    chat_history.append({"role": "assistant", "content": full_reply})
                    
                except Exception as e:
                    print(f"\nChat error: {e}")

            else:
                print("Unknown command. Try 'search <query>', 'index <path>', 'list', 'chat <msg>', or 'exit'.")
                
        except EOFError:
            print("\nShutting down due to EOF...")
            break
        except KeyboardInterrupt:
            print("\nInterrupted! Shutting down properly...")
            break
        except Exception as e:
            print(f"Error handling command: {e}")

if __name__ == "__main__":
    asyncio.run(main())
