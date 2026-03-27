from abc import ABC, abstractmethod
from typing import List, Optional
from models.chunk_model import CodeChunk

class IVectorStore(ABC):
    """
    Abstract interface for vector stores to enable easy extension
    to different backends like FAISS, Pinecone, or ChromaDB.
    """
    
    @abstractmethod
    def add_chunks(self, workspace_id: str, chunks: List[CodeChunk]) -> None:
        """
        Embeds and stores a list of CodeChunks into the vector database.
        """
        pass
        
    @abstractmethod
    def query_semantic(self, workspace_id: str, query: str, n_results: int = 5, filters: Optional[dict] = None) -> List[CodeChunk]:
        """
        Queries the vector database using a semantic string
        with optional metadata filters.
        """
        pass
        
    @abstractmethod
    def delete_chunks_by_filepath(self, workspace_id: str, file_path: str) -> None:
        """
        Deletes all chunks associated with a specific file path.
        """
        pass
        
    @abstractmethod
    def get_file_chunks(self, workspace_id: str, file_path: str) -> List[CodeChunk]:
        """
        Retrieves all chunks matching a specific file path, ordered by line number.
        """
        pass
