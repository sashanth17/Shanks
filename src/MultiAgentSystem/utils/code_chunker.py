import os
from typing import List, Dict, Tuple, Optional
from dataclasses import asdict
from models.chunk_model import CodeChunk
import tiktoken

# Tree-sitter setup
import tree_sitter
import tree_sitter_python
import tree_sitter_javascript
from tree_sitter import Language, Parser, Node

class TiktokenSplitter:
    """Handles splitting of massively oversized strings using strict token limits."""
    def __init__(self, model_name="text-embedding-3-small", max_tokens=2000):
        self.encoder = tiktoken.encoding_for_model(model_name)
        self.max_tokens = max_tokens

    def count_tokens(self, text: str) -> int:
        return len(self.encoder.encode(text))

    def hybrid_split(self, text: str) -> List[str]:
        """Violently splits text if it exceeds token limits, avoiding blowing up vector DB."""
        tokens = self.encoder.encode(text)
        if len(tokens) <= self.max_tokens:
            return [text]
            
        chunks = []
        for i in range(0, len(tokens), self.max_tokens):
            chunk_tokens = tokens[i:i + self.max_tokens]
            chunks.append(self.encoder.decode(chunk_tokens))
        return chunks


class UniversalChunker:
    """
    Production-grade multi-language AST chunker driven by Tree-sitter S-Expressions.
    Supports Python and Javascript.
    """
    def __init__(self, max_tokens: int = 2000):
        self.splitter = TiktokenSplitter(max_tokens=max_tokens)
        
        # Initialize languages
        self.LANGUAGES = {
            ".py": {
                "name": "python",
                "lang": Language(tree_sitter_python.language()),
                # S-Expression queries to identify chunk boundaries
                "queries": {
                    "chunks": "(function_definition) @function (class_definition) @class",
                    "imports": "(import_statement) @import (import_from_statement) @import"
                }
            },
            ".js": {
                "name": "javascript",
                "lang": Language(tree_sitter_javascript.language()),
                "queries": {
                    "chunks": "(function_declaration) @function (arrow_function) @function (class_declaration) @class (method_definition) @method",
                    "imports": "(import_statement) @import"
                }
            }
        }
    
    def get_node_text(self, node: Node, source_bytes: bytes) -> str:
        """Extracts text for a node."""
        return source_bytes[node.start_byte:node.end_byte].decode("utf8")
        
    def chunk_file(self, filepath: str) -> List[CodeChunk]:
        """Parses an entire file and creates semantic chunks, falling back to token splitting if huge."""
        _, ext = os.path.splitext(filepath)
        if ext not in self.LANGUAGES:
            raise ValueError(f"Language not supported for extension: {ext}. Only JS and PY are supported in this demo.")
            
        lang_config = self.LANGUAGES[ext]
        language = lang_config["lang"]
        
        parser = Parser(language)
        
        with open(filepath, "rb") as f:
            source_bytes = f.read()
            
        tree = parser.parse(source_bytes)
        
        # 1. Extract global imports for context injection
        import_query = tree_sitter.Query(language, lang_config["queries"]["imports"])
        import_cursor = tree_sitter.QueryCursor(import_query)
        import_captures = import_cursor.captures(tree.root_node)
        
        global_imports = []
        for capture_name, nodes in import_captures.items():
            for node in nodes:
                global_imports.append(self.get_node_text(node, source_bytes))
            
        global_imports_text = "\n".join(global_imports)
        
        # 2. Extract semantic chunks
        chunk_query = tree_sitter.Query(language, lang_config["queries"]["chunks"])
        chunk_cursor = tree_sitter.QueryCursor(chunk_query)
        chunk_captures = chunk_cursor.captures(tree.root_node)
        
        final_chunks: List[CodeChunk] = []
        
        for capture_type, nodes in chunk_captures.items():
            for node in nodes:
                raw_text = self.get_node_text(node, source_bytes)
                
                name_node = node.child_by_field_name('name')
                scope_name = self.get_node_text(name_node, source_bytes) if name_node else "anonymous"
                
                contextual_text = (
                    f"# File: {filepath}\n"
                    f"# Language: {lang_config['name']}\n"
                    f"# Scope: {scope_name} ({capture_type})\n\n"
                    f"# --- GLOBAL IMPORTS ---\n"
                    f"{global_imports_text}\n\n"
                    f"# --- IMPLEMENTATION ---\n"
                    f"{raw_text}"
                )
                
                tokens_count = self.splitter.count_tokens(contextual_text)
                
                if tokens_count > self.splitter.max_tokens:
                    split_pieces = self.splitter.hybrid_split(contextual_text)
                    for idx, piece in enumerate(split_pieces):
                        final_chunks.append(CodeChunk(
                            file_path=filepath,
                            language=lang_config["name"],
                            scope=f"{scope_name}_part_{idx+1}",
                            chunk_type=f"{capture_type}_split",
                            start_line=node.start_point[0] + 1,
                            end_line=node.end_point[0] + 1,
                            raw_content=raw_text,
                            num_tokens=self.splitter.count_tokens(piece),
                            embedded_text=piece
                        ))
                else:
                    final_chunks.append(CodeChunk(
                        file_path=filepath,
                        language=lang_config["name"],
                        scope=scope_name,
                        chunk_type=capture_type,
                        start_line=node.start_point[0] + 1,
                        end_line=node.end_point[0] + 1,
                        raw_content=raw_text,
                        num_tokens=tokens_count,
                        embedded_text=contextual_text
                    ))
                
        # Optional: Eliminate nested duplicate methods if we capture both outer Class and inner Function.
        # Tree-sitter captures often return outer nodes before inner. A quick filtering by range:
        
        # Return all for now.
        return final_chunks

if __name__ == "__main__":
    import json
    
    target_file = "../server.py"
    
    if os.path.exists(target_file):
        chunker = UniversalChunker(max_tokens=1500)
        chunks = chunker.chunk_file(target_file)
        
        for i, c in enumerate(chunks, 1):
            print(f"=== CHUNK {i} | Type: {c.chunk_type} | Scope: {c.scope} | Tokens: {c.num_tokens} ===")
            print(f"[{c.start_line}:{c.end_line}]\n")
            print(c.embedded_text)
            print("=" * 80)
            
        print(f"\\nSuccessfully parsed using Native Tree-Sitter + Tiktoken into {len(chunks)} hybrid chunks.")
