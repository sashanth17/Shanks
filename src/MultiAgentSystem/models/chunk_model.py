from dataclasses import dataclass

@dataclass
class CodeChunk:
    file_path: str
    language: str
    scope: str
    chunk_type: str
    start_line: int
    end_line: int
    raw_content: str
    num_tokens: int
    embedded_text: str  # Context-enriched LLM prompt
