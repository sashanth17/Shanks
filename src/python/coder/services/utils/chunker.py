from utils.universal_chunker import UniversalChunker
import os

if __name__ == "__main__":
    import json
    
    target_file = "../../server.py"
    
    if os.path.exists(target_file):
        chunker = UniversalChunker(max_tokens=1500)
        chunks = chunker.chunk_file(target_file)
        
        for i, c in enumerate(chunks, 1):
            print(f"=== CHUNK {i} | Type: {c.chunk_type} | Scope: {c.scope} | Tokens: {c.num_tokens} ===")
            print(f"[{c.start_line}:{c.end_line}]\n")
            print(c.embedded_text)
            print("=" * 80)
            
        print(f"\\nSuccessfully parsed using Native Tree-Sitter + Tiktoken into {len(chunks)} hybrid chunks.")
