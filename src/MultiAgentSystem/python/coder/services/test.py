import asyncio
import os
import sys

# Ensure we can import from the root python directory
sys.path.append(os.path.abspath(os.path.join(os.path.dirname(__file__), "../..")))

from coder.services.codebase import CodebaseService
from coder.repository.chroma_store import ChromaVectorStore
from coder.services.utils.code_chunker import UniversalChunker

async def interactive_menu(service: CodebaseService):
    
    # Global workspace context for the menu
    workspace_id = "default-project"
    
    while True:
        print("\n" + "="*50)
        print(f"       CodebaseService Menu | Workspace: [{workspace_id}]")
        print("="*50)
        print("0. Change Workspace Identity")
        print("1. Add/Index a new file (Fast-Sync)")
        print("2. Check sync and perform rechunk (Deep-Sync)")
        print("3. Query the codebase (Semantic Search)")
        print("4. Get file structure (Exact Match)")
        print("5. Exit")
        
        choice = input("\nEnter your choice (0-5): ").strip()
        
        if choice == '0':
            new_id = input("Enter new workspace/project ID: ").strip()
            if new_id:
                workspace_id = new_id
                print(f"Switched to workspace: {workspace_id}")
            continue
            
        elif choice == '1':
            filepath = input("Enter the absolute or relative path to the file: ").strip().strip('\'"')
            if not os.path.exists(filepath):
                print(f"File not found: {filepath}")
                continue
            print(f"Indexing {filepath} into [{workspace_id}]...")
            result = await service.index_files(workspace_id, [os.path.abspath(filepath)])
            print(f"Result: {result}")
            
        elif choice == '2':
            filepath = input("Enter the absolute or relative path to the file: ").strip().strip('\'"')
            if not os.path.exists(filepath):
                print(f"File not found: {filepath}")
                continue
            print(f"Checking sync for {filepath} in [{workspace_id}]...")
            was_updated = await service.sync_file(workspace_id, os.path.abspath(filepath))
            if was_updated:
                print("File was modified! Old chunks deleted and fresh chunks encoded & embedded.")
            else:
                print("File is unchanged since last sync. Skipped.")
                
        elif choice == '3':
            query = input("Enter your search query: ").strip()
            limit_str = input("Number of results to return (default 5): ").strip()
            limit = int(limit_str) if limit_str.isdigit() else 5
            
            print(f"\nSearching for '{query}' inside '{workspace_id}'...")
            results = await service.search_codebase(workspace_id, query, limit=limit)
            
            if not results:
                print("No results found.")
            else:
                for i, chunk in enumerate(results, 1):
                    print(f"\n--- Result {i} ---")
                    print(f"File: {os.path.basename(chunk.file_path)} (Line {chunk.start_line}-{chunk.end_line})")
                    print(f"Type: {chunk.chunk_type} | Scope: {chunk.scope}")
                    preview = chunk.embedded_text.replace('\n', ' ')[:100]
                    print(f"Preview: {preview}...")
                    
        elif choice == '4':
            filepath = input("Enter the path to the file: ").strip().strip('\'"')
            print(f"\nFetching structure for {filepath} from [{workspace_id}]...")
            structure = await service.get_file_structure(workspace_id, os.path.abspath(filepath))
            
            if not structure:
                print("No chunks found for this file.")
            else:
                print(f"Found {len(structure)} chunks.")
                for chunk in structure:
                    print(f" -> [{chunk.start_line}:{chunk.end_line}] {chunk.chunk_type} ({chunk.scope})")
                    
        elif choice == '5':
            print("Exiting...")
            break
        else:
            print("Invalid choice. Please try again.")

async def main():
    print("Initializing Database and Chunker...")
    vector_store = ChromaVectorStore(
        persist_directory=".test_chroma_db", 
    )
    chunker = UniversalChunker()
    
    print("Initializing CodebaseService...")
    service = CodebaseService(vector_store=vector_store, universal_chunker=chunker, ledger_path=".test_ledger.json")

    await interactive_menu(service)

if __name__ == "__main__":
    try:
        asyncio.run(main())
    except KeyboardInterrupt:
        print("\nExited gracefully.")
