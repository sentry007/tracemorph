import sys
import os

# Add sdk-python to sys.path
sys.path.insert(0, os.path.abspath(os.path.join(os.path.dirname(__file__), '..', 'packages', 'sdk-python')))

from tracemorph import TraceMorph

def run_test():
    print("[TEST] Testing TraceMorph Python SDK...")
    tracer = TraceMorph(
        run_name="Python DevOps Assistant",
        metadata={"model": "claude-3-7-sonnet", "framework": "tracemorph-py"}
    )

    run_id = tracer.init()
    print(f"[RUN] Initialized Run ID: {run_id}")

    # Step 1: Planning
    step1 = tracer.start_step(step_type="thought", prompt_context="Analyze Git repository health.", prompt_tokens=32)
    step1.finish(completion_text="Plan: 1. Check branch status. 2. Verify CI pipelines.", completion_tokens=18)

    # Step 2: Tool Call
    step2 = tracer.start_step(step_type="tool_call", prompt_context="Checking active branches...")
    step2.record_tool_call(
        tool_name="git_branch_list",
        input_args={"all": True},
        output_result={"branches": ["main", "feature/auth", "bugfix/tokens"]},
        status="success",
        execution_time_ms=140
    )
    step2.finish(completion_text="Branch audit complete: 3 branches found.", completion_tokens=12)

    # Complete Run
    tracer.complete()
    print(f"[SUCCESS] Python Run {run_id} completed successfully!")

if __name__ == "__main__":
    run_test()
