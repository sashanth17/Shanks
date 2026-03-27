import json
import re
from typing import Any, Dict, List, Optional

from agents.base_agent import BaseAgent
from llms.interfaces import IAIClient
from memory.interfaces import IVectorStore
from tools.base_tool import BaseTool

class CoderAgent(BaseAgent):
    """
    An agentic loop that uses an LLM via IAIClient and has access to
    Memory via IVectorStore and capabilities via BaseTools.
    """
    
    def __init__(
        self, 
        llm: IAIClient, 
        memory: Optional[IVectorStore] = None, 
        tools: Optional[List[BaseTool]] = None
    ):
        self._llm = llm
        self._memory = memory
        self._tools = tools or []
        
    @property
    def name(self) -> str:
        return "CoderAgent"
        
    @property
    def description(self) -> str:
        return "A coding agent capable of retrieving context and executing tools in a loop to solve programming tasks."

    def _build_system_prompt(self) -> str:
        """Constructs the system instructions including available tools."""
        instructions = "You are a helpful coding agent. You have access to the following tools:\n"
        
        if not self._tools:
            instructions += "No tools available.\n"
        else:
            for tool in self._tools:
                instructions += f"- {tool.name}: {tool.description}\n"
                
        instructions += """
If you need to use a tool, output a JSON block matching this exact format and nothing else immediately before or after:
```tool_call
{"tool": "tool_name", "kwargs": {"arg1": "value1"}}
```
Wait for the tool result before proceeding. If you do not need to use a tool, just answer the user.
"""
        return instructions

    def _execute_tool(self, tool_name: str, kwargs: Dict[str, Any]) -> str:
        """Finds and executes the requested tool."""
        for tool in self._tools:
            if tool.name == tool_name:
                try:
                    result = tool.execute(**kwargs)
                    return json.dumps({"status": "success", "result": result})
                except Exception as e:
                    return json.dumps({"status": "error", "error": str(e)})
        return json.dumps({"status": "error", "error": f"Tool '{tool_name}' not found."})

    def run(self, context: Dict[str, Any]) -> Any:
        """
        The main agentic loop.
        Expects 'prompt' in the context dict as the initial user request.
        """
        prompt = context.get("prompt", "")
        if not prompt:
            return "No prompt provided in context."

        system_message = {"role": "system", "content": self._build_system_prompt()}
        history = [system_message]
        
        max_iterations = context.get("max_iterations", 5)
        iteration = 0
        
        final_answer = ""

        # Use the initial user prompt for the first iteration
        current_input = prompt

        while iteration < max_iterations:
            print(f"\n[CoderAgent Iteration {iteration + 1} / {max_iterations}]")
            
            # Start streaming response from LLM
            response_chunks = self._llm.generate_streaming_response(current_input, history)
            
            full_response = ""
            print("Assistant: ", end="")
            for chunk in response_chunks:
                full_response += chunk
                print(chunk, end="", flush=True)
            print()
            
            # Update history with the user's input and assistant's full response
            history.append({"role": "user", "content": current_input})
            history.append({"role": "assistant", "content": full_response})
            
            # Attempt to parse a tool call out of full_response
            tool_call_match = re.search(r"```tool_call\n(.*?)\n```", full_response, re.DOTALL)
            
            if tool_call_match:
                try:
                    tool_data = json.loads(tool_call_match.group(1))
                    tool_name = tool_data.get("tool")
                    tool_kwargs = tool_data.get("kwargs", {})
                    
                    print(f"[Executing Tool: {tool_name} with args: {tool_kwargs}]")
                    tool_result = self._execute_tool(tool_name, tool_kwargs)
                    print(f"[Tool Result: {tool_result}]")
                    
                    # Provide the tool result back to the LLM in the next iteration
                    current_input = f"Tool result for {tool_name}:\n{tool_result}\nPlease continue or provide the final answer."
                except json.JSONDecodeError:
                    current_input = "System Error: The tool call JSON was incorrectly formatted. Please fix the formatting and try again."
            else:
                # No tool call detected, assume complete response
                final_answer = full_response
                break
                
            iteration += 1

        if iteration == max_iterations:
            print("\n[CoderAgent reached max iterations without concluding.]")
            
        return final_answer
