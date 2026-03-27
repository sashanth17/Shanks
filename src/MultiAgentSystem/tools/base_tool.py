from abc import ABC, abstractmethod
from typing import Any, Dict

class BaseTool(ABC):
    """
    Abstract Base Class for all tools in the MultiAgentSystem.
    Provides a standardized way for agents to invoke external capabilities.
    """

    @property
    @abstractmethod
    def name(self) -> str:
        """Return the unique literal name of this tool."""
        pass

    @property
    @abstractmethod
    def description(self) -> str:
        """Returns the prompt-friendly description of what the tool does."""
        pass

    @abstractmethod
    def execute(self, **kwargs) -> Any:
        """
        Executes the tool's core logic with the provided arguments.
        """
        pass
