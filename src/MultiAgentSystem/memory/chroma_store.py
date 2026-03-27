import os
import re
from typing import List, Optional, Any
from memory.interfaces import IVectorStore
from models.chunk_model import CodeChunk
import chromadb
from chromadb.utils import embedding_functions

class ChromaVectorStore(IVectorStore):
    """
    ChromaDB implementation of the IVectorStore.
    Runs locally and persists data to a provided directory.
    Supports multi-workspace isolation through unique collections.
    """
    
    def __init__(self, persist_directory: Optional[str] = None):
        if persist_directory is None:
            # Safely anchor the DB to exactly inside this memory/ folder
            persist_directory = os.path.join(os.path.dirname(os.path.abspath(__file__)), ".chroma_db")
            
        # Make sure the persist directory exists
        os.makedirs(persist_directory, exist_ok=True)
        
        # Initialize chroma client with telemetry disabled to prevent hanging
        self.client = chromadb.PersistentClient(
            path=persist_directory,
            settings=chromadb.config.Settings(anonymized_telemetry=False)
        )
        
        # Use default sentence-transformers model `all-MiniLM-L6-v2`
        self.embedding_function = embedding_functions.DefaultEmbeddingFunction()
        
    def _get_collection(self, workspace_id: str):
        # Sanitize to meet ChromaDB naming rules: 3-63 chars, alphanumeric, hyphens
        clean_id = re.sub(r'[^a-zA-Z0-9-]', '-', workspace_id).strip('-')
        if len(clean_id) < 3:
            clean_id = f"ws-{clean_id}".ljust(3, '0')
        clean_id = clean_id[:63].lower()
        
        return self.client.get_or_create_collection(
            name=clean_id,
            embedding_function=self.embedding_function
        )
        
    def add_chunks(self, workspace_id: str, chunks: List[CodeChunk]) -> None:
        if not chunks:
            return
            
        collection = self._get_collection(workspace_id)
        ids = []
        documents = []
        metadatas = []
        
        for i, chunk in enumerate(chunks):
            # Formulate a unique ID for each chunk. 
            chunk_id = f"{chunk.file_path}_{chunk.start_line}_{chunk.chunk_type}_{i}"
            ids.append(chunk_id)
            
            documents.append(chunk.embedded_text)
            
            metadatas.append({
                "file_path": chunk.file_path,
                "language": chunk.language,
                "scope": chunk.scope,
                "chunk_type": chunk.chunk_type,
                "start_line": chunk.start_line,
                "end_line": chunk.end_line,
                "raw_content": chunk.raw_content,
                "num_tokens": chunk.num_tokens
            })
            
        collection.add(
            ids=ids,
            documents=documents,
            metadatas=metadatas
        )
        
    def query_semantic(self, workspace_id: str, query: str, n_results: int = 5, filters: Optional[dict] = None) -> List[CodeChunk]:
        collection = self._get_collection(workspace_id)
        kwargs: dict[str, Any] = {
            "query_texts": [query],
            "n_results": n_results
        }
        if filters:
            kwargs["where"] = filters
            
        results = collection.query(**kwargs)
        
        code_chunks = []
        if not results['documents'] or not results['documents'][0]:
            return code_chunks
            
        for i in range(len(results['documents'][0])):
            doc = results['documents'][0][i]
            meta = results['metadatas'][0][i]
            
            chunk = CodeChunk(
                file_path=meta['file_path'],
                language=meta['language'],
                scope=meta['scope'],
                chunk_type=meta['chunk_type'],
                start_line=meta['start_line'],
                end_line=meta['end_line'],
                raw_content=meta['raw_content'],
                num_tokens=meta['num_tokens'],
                embedded_text=doc
            )
            code_chunks.append(chunk)
            
        return code_chunks
        
    def delete_chunks_by_filepath(self, workspace_id: str, file_path: str) -> None:
        collection = self._get_collection(workspace_id)
        collection.delete(where={"file_path": file_path})
        
    def get_file_chunks(self, workspace_id: str, file_path: str) -> List[CodeChunk]:
        collection = self._get_collection(workspace_id)
        results = collection.get(where={"file_path": file_path})
        
        code_chunks = []
        if not results['documents']:
            return code_chunks
            
        for i in range(len(results['documents'])):
            doc = results['documents'][i]
            meta = results['metadatas'][i]
            
            chunk = CodeChunk(
                file_path=meta['file_path'],
                language=meta['language'],
                scope=meta['scope'],
                chunk_type=meta['chunk_type'],
                start_line=meta['start_line'],
                end_line=meta['end_line'],
                raw_content=meta['raw_content'],
                num_tokens=meta['num_tokens'],
                embedded_text=doc
            )
            code_chunks.append(chunk)
            
        return sorted(code_chunks, key=lambda c: c.start_line)
