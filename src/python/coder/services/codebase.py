import os
import json
import hashlib
from typing import List, Optional, Dict, Any
from dataclasses import dataclass
from coder.models.chunk import CodeChunk
from coder.repository.interfaces import IVectorStore
from coder.services.utils.code_chunker import UniversalChunker

class CodebaseError(Exception):
    """Base exception for CodebaseService."""
    pass

class FileNotSupportedError(CodebaseError):
    """Raised when trying to process an unsupported file type."""
    pass

class IndexingError(CodebaseError):
    """Raised when an error occurs during workspace scanning or file syncing."""
    pass

@dataclass
class IndexingResult:
    files_scanned: int
    chunks_added: int
    chunks_updated: int
    files_skipped: int

class CodebaseService:
    """
    Central brain for codebase knowledge.
    Manages multi-tenant vector embeddings, file hashes, and searches natively.
    """
    def __init__(self, vector_store: IVectorStore, universal_chunker: UniversalChunker, ledger_path: str = '.codebase_ledger.json'):
        self.vector_store = vector_store
        self.chunker = universal_chunker
        self.ledger_path = ledger_path
        # Ledger maps {workspace_id: {file_path: file_hash}}
        self._ledger: Dict[str, Dict[str, str]] = self._load_ledger()
        self.supported_extensions = {".py", ".js", ".ts"}
        
    def _load_ledger(self) -> Dict[str, Dict[str, str]]:
        if os.path.exists(self.ledger_path):
            try:
                with open(self.ledger_path, 'r', encoding='utf-8') as f:
                    data = json.load(f)
                    # Convert legacy flat ledger to nested representation if needed
                    if data and isinstance(next(iter(data.values())), str):
                        return {"default_workspace": data}
                    return data
            except Exception:
                return {}
        return {}
        
    def _save_ledger(self) -> None:
        try:
            with open(self.ledger_path, 'w', encoding='utf-8') as f:
                json.dump(self._ledger, f, indent=2)
        except Exception as e:
            raise IndexingError(f"Failed to save ledger: {str(e)}")
            
    def _compute_hash(self, file_path: str) -> str:
        hasher = hashlib.sha256()
        with open(file_path, 'rb') as f:
            for chunk in iter(lambda: f.read(4096), b""):
                hasher.update(chunk)
        return hasher.hexdigest()

    async def index_files(self, workspace_id: str, file_paths: List[str]) -> IndexingResult:
        """
        Receives a specific list of file paths to process. 
        Compares hashes against the workspace ledger, chunks new/modified files, 
        deletes old DB entries, and stores new chunks. 
        """
        result = IndexingResult(files_scanned=0, chunks_added=0, chunks_updated=0, files_skipped=0)
        
        if workspace_id not in self._ledger:
            self._ledger[workspace_id] = {}
            
        workspace_ledger = self._ledger[workspace_id]
        
        for file_path in file_paths:
            ext = os.path.splitext(file_path)[1].lower()
            if ext not in self.supported_extensions:
                continue
                
            if not os.path.isfile(file_path):
                continue
                
            result.files_scanned += 1
            
            try:
                current_hash = self._compute_hash(file_path)
                previous_hash = workspace_ledger.get(file_path)
                
                if current_hash == previous_hash:
                    result.files_skipped += 1
                    continue
                    
                # File is modified or new
                chunks = self.chunker.chunk_file(file_path)
                
                if previous_hash is not None:
                    # Existing file modified: explicit deletion
                    self.vector_store.delete_chunks_by_filepath(workspace_id, file_path)
                    result.chunks_updated += len(chunks)
                else:
                    result.chunks_added += len(chunks)
                    
                self.vector_store.add_chunks(workspace_id, chunks)
                workspace_ledger[file_path] = current_hash
                
            except Exception as e:
                raise IndexingError(f"Failed to index file {file_path}: {str(e)}")
                
        # Update ledger after successful fast-scan
        self._save_ledger()
        return result

    async def sync_file(self, workspace_id: str, file_path: str) -> bool:
        """
        Surgically syncs a single file inside a workspace. Checks hash, 
        explicitly deletes old chunks if changed, and inserts fresh chunk embeddings.
        """
        if workspace_id not in self._ledger:
            self._ledger[workspace_id] = {}
        workspace_ledger = self._ledger[workspace_id]
        
        if not os.path.exists(file_path):
            if file_path in workspace_ledger:
                self.vector_store.delete_chunks_by_filepath(workspace_id, file_path)
                del workspace_ledger[file_path]
                self._save_ledger()
            return True
            
        ext = os.path.splitext(file_path)[1].lower()
        if ext not in self.supported_extensions:
            raise FileNotSupportedError(f"Extension {ext} is not supported.")
            
        try:
            current_hash = self._compute_hash(file_path)
            previous_hash = workspace_ledger.get(file_path)
            
            if current_hash == previous_hash:
                return False
                
            if previous_hash is not None:
                self.vector_store.delete_chunks_by_filepath(workspace_id, file_path)
                
            chunks = self.chunker.chunk_file(file_path)
            self.vector_store.add_chunks(workspace_id, chunks)
            
            workspace_ledger[file_path] = current_hash
            self._save_ledger()
            return True
            
        except Exception as e:
            raise IndexingError(f"Failed to sync file {file_path}: {str(e)}")

    async def search_codebase(self, workspace_id: str, query: str, limit: int = 5, filters: Optional[dict] = None) -> List[CodeChunk]:
        """
        A clean wrapper around the vector store's semantic search for a specific workspace.
        """
        return self.vector_store.query_semantic(workspace_id=workspace_id, query=query, n_results=limit, filters=filters)

    async def get_file_structure(self, workspace_id: str, file_path: str) -> List[CodeChunk]:
        """
        Queries vector store for all chunks belonging to a specific file_path 
        within the workspace, ordered sequentially by line_start.
        """
        return self.vector_store.get_file_chunks(workspace_id, file_path)
