from abc import ABC, abstractmethod
from typing import Any, Dict

class BaseAgent(ABC):
    """
    Abstract Base Class for all agents in the MultiAgentSystem.
    Ensures every new agent conforms to a predictable contract.
    """
    
    @property
    @abstractmethod
    def name(self) -> str:
        """Return the unique name of this agent."""
        pass
        
    @property
    @abstractmethod
    def description(self) -> str:
        """Return a brief description of what this agent does."""
        pass

    @abstractmethod
    def run(self, context: Dict[str, Any]) -> Any:
        """
        Execute the primary logic of the agent given a shared context payload.
        """
        pass
