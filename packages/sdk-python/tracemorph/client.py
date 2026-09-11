import json
import time
import urllib.request
import urllib.error
from typing import Optional, Dict, Any

class TraceMorphStep:
    def __init__(self, tracer: 'TraceMorph', step_number: int, step_type: str, prompt_context: str, prompt_tokens: int = 0, checkpoint_state: Optional[Dict[str, Any]] = None):
        self.tracer = tracer
        self.step_number = step_number
        self.step_type = step_type
        self.prompt_context = prompt_context
        self.prompt_tokens = prompt_tokens
        self.checkpoint_state = checkpoint_state
        self.start_time = time.time()
        self.step_id: Optional[str] = None

    def _commit_step(self):
        latency_ms = int((time.time() - self.start_time) * 1000)
        payload = {
            "stepNumber": self.step_number,
            "stepType": self.step_type,
            "promptContext": self.prompt_context,
            "promptTokens": self.prompt_tokens,
            "completionText": "",
            "completionTokens": 0,
            "latencyMs": latency_ms,
            "checkpointState": self.checkpoint_state
        }
        res = self.tracer._post(f"/api/runs/{self.tracer.run_id}/steps", payload)
        self.step_id = res.get("stepId")
        return self.step_id

    def record_tool_call(self, tool_name: str, input_args: Dict[str, Any] = None, output_result: Any = None, status: str = "success", execution_time_ms: int = 0) -> str:
        if not self.step_id:
            self._commit_step()

        payload = {
            "toolName": tool_name,
            "inputArgs": input_args or {},
            "outputResult": output_result,
            "status": status,
            "executionTimeMs": execution_time_ms
        }
        res = self.tracer._post(f"/api/steps/{self.step_id}/tools", payload)
        return res.get("toolId", "")

    def finish(self, completion_text: str = "", completion_tokens: int = 0, checkpoint_state: Optional[Dict[str, Any]] = None) -> str:
        latency_ms = int((time.time() - self.start_time) * 1000)
        final_checkpoint = checkpoint_state or self.checkpoint_state

        if not self.step_id:
            payload = {
                "stepNumber": self.step_number,
                "stepType": self.step_type,
                "promptContext": self.prompt_context,
                "promptTokens": self.prompt_tokens,
                "completionText": completion_text,
                "completionTokens": completion_tokens,
                "latencyMs": latency_ms,
                "checkpointState": final_checkpoint
            }
            res = self.tracer._post(f"/api/runs/{self.tracer.run_id}/steps", payload)
            self.step_id = res.get("stepId")
            return self.step_id
        else:
            payload = {
                "completionText": completion_text,
                "completionTokens": completion_tokens,
                "latencyMs": latency_ms,
                "checkpointState": final_checkpoint
            }
            self.tracer._patch(f"/api/steps/{self.step_id}", payload)
            return self.step_id


class TraceMorph:
    def __init__(self, endpoint: str = "http://localhost:7890", run_name: Optional[str] = None, metadata: Optional[Dict[str, Any]] = None, run_id: Optional[str] = None):
        self.endpoint = endpoint.rstrip("/")
        self.run_name = run_name or f"python_agent_run_{int(time.time() * 1000)}"
        self.metadata = metadata or {}
        self.run_id = run_id
        self.step_counter = 0

    def _post(self, path: str, data: Dict[str, Any]) -> Dict[str, Any]:
        url = f"{self.endpoint}{path}"
        body = json.dumps(data).encode("utf-8")
        req = urllib.request.Request(url, data=body, headers={"Content-Type": "application/json"}, method="POST")
        try:
            with urllib.request.urlopen(req) as resp:
                return json.loads(resp.read().decode("utf-8"))
        except urllib.error.URLError as e:
            # Degrade gracefully without crashing if local engine daemon is offline
            return {"success": False, "error": str(e)}

    def _patch(self, path: str, data: Dict[str, Any]) -> Dict[str, Any]:
        url = f"{self.endpoint}{path}"
        body = json.dumps(data).encode("utf-8")
        req = urllib.request.Request(url, data=body, headers={"Content-Type": "application/json"}, method="PATCH")
        try:
            with urllib.request.urlopen(req) as resp:
                return json.loads(resp.read().decode("utf-8"))
        except urllib.error.URLError as e:
            return {"success": False, "error": str(e)}

    def init(self) -> str:
        if self.run_id:
            return self.run_id
        res = self._post("/api/runs", {"name": self.run_name, "metadata": self.metadata})
        if res.get("success") and "run" in res:
            self.run_id = res["run"]["id"]
        else:
            self.run_id = f"local_run_{int(time.time())}"
        return self.run_id

    def start_step(self, step_type: str = "thought", prompt_context: str = "", prompt_tokens: int = 0, checkpoint_state: Optional[Dict[str, Any]] = None) -> TraceMorphStep:
        if not self.run_id:
            self.init()
        self.step_counter += 1
        return TraceMorphStep(
            tracer=self,
            step_number=self.step_counter,
            step_type=step_type,
            prompt_context=prompt_context,
            prompt_tokens=prompt_tokens,
            checkpoint_state=checkpoint_state
        )

    def complete(self):
        if not self.run_id:
            return
        self._patch(f"/api/runs/{self.run_id}/status", {"status": "completed"})

    def fail(self, error: str = ""):
        if not self.run_id:
            return
        self._patch(f"/api/runs/{self.run_id}/status", {"status": "failed", "error": str(error)})

    def trace_step(self, step_type: str = "tool_call", tool_name: Optional[str] = None):
        """Decorator to wrap and trace any python function as an agent step."""
        def decorator(func):
            def wrapper(*args, **kwargs):
                nonlocal tool_name
                name = tool_name or func.__name__
                step = self.start_step(step_type=step_type, prompt_context=f"Invoking {name}")
                t0 = time.time()
                try:
                    res = func(*args, **kwargs)
                    execution_time_ms = int((time.time() - t0) * 1000)
                    step.record_tool_call(tool_name=name, input_args={"args": str(args), "kwargs": str(kwargs)}, output_result=res, status="success", execution_time_ms=execution_time_ms)
                    step.finish(completion_text=f"{name}() executed successfully.")
                    return res
                except Exception as e:
                    execution_time_ms = int((time.time() - t0) * 1000)
                    step.record_tool_call(tool_name=name, input_args={"args": str(args), "kwargs": str(kwargs)}, output_result={"error": str(e)}, status="error", execution_time_ms=execution_time_ms)
                    step.finish(completion_text=f"{name}() failed: {str(e)}")
                    raise e
            return wrapper
        return decorator
