export class TraceMorph {
  constructor(config = {}) {
    this.endpoint = (config.endpoint || 'http://localhost:7890').replace(/\/$/, '');
    this.runName = config.runName || `agent_run_${Date.now()}`;
    this.metadata = config.metadata || {};
    this.runId = config.runId || null;
    this.currentStep = null;
    this.stepCounter = 0;
  }

  async init() {
    if (this.runId) return this.runId;
    const res = await fetch(`${this.endpoint}/api/runs`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        name: this.runName,
        metadata: this.metadata
      })
    });
    const data = await res.json();
    if (!data.success) throw new Error(data.error || 'Failed to initialize TraceMorph run');
    this.runId = data.run.id;
    return this.runId;
  }

  async startStep({
    stepType = 'thought',
    promptContext = '',
    promptTokens = 0,
    checkpointState = null
  }) {
    if (!this.runId) await this.init();
    this.stepCounter++;
    const startTime = Date.now();

    const stepObj = {
      runId: this.runId,
      stepNumber: this.stepCounter,
      stepType,
      promptContext,
      promptTokens,
      checkpointState,
      startTime,
      stepId: null,

      recordToolCall: async ({
        toolName,
        inputArgs = {},
        outputResult = null,
        status = 'success',
        executionTimeMs = 0
      }) => {
        if (!stepObj.stepId) {
          await stepObj._commitStep();
        }
        const res = await fetch(`${this.endpoint}/api/steps/${stepObj.stepId}/tools`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            toolName,
            inputArgs,
            outputResult,
            status,
            executionTimeMs
          })
        });
        const toolData = await res.json();
        return toolData.toolId;
      },

      finish: async ({
        completionText = '',
        completionTokens = 0,
        checkpointState = null
      }) => {
        const latencyMs = Date.now() - startTime;
        if (!stepObj.stepId) {
          const res = await fetch(`${this.endpoint}/api/runs/${this.runId}/steps`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              stepNumber: stepObj.stepNumber,
              stepType: stepObj.stepType,
              promptContext: stepObj.promptContext,
              promptTokens: stepObj.promptTokens,
              completionText,
              completionTokens,
              latencyMs,
              checkpointState: checkpointState || stepObj.checkpointState
            })
          });
          const stepData = await res.json();
          stepObj.stepId = stepData.stepId;
          return stepObj.stepId;
        } else {
          // Step was committed early by recordToolCall; update it with final reasoning and latency
          const res = await fetch(`${this.endpoint}/api/steps/${stepObj.stepId}`, {
            method: 'PATCH',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              completionText,
              completionTokens,
              latencyMs,
              checkpointState: checkpointState || stepObj.checkpointState
            })
          });
          const stepData = await res.json();
          return stepObj.stepId;
        }
      },

      _commitStep: async () => {
        const res = await fetch(`${this.endpoint}/api/runs/${this.runId}/steps`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            stepNumber: stepObj.stepNumber,
            stepType: stepObj.stepType,
            promptContext: stepObj.promptContext,
            promptTokens: stepObj.promptTokens,
            completionText: '',
            completionTokens: 0,
            latencyMs: Date.now() - startTime,
            checkpointState: stepObj.checkpointState
          })
        });
        const stepData = await res.json();
        stepObj.stepId = stepData.stepId;
      }
    };

    this.currentStep = stepObj;
    return stepObj;
  }

  async complete() {
    if (!this.runId) return;
    await fetch(`${this.endpoint}/api/runs/${this.runId}/status`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ status: 'completed' })
    });
  }

  async fail(error) {
    if (!this.runId) return;
    await fetch(`${this.endpoint}/api/runs/${this.runId}/status`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ status: 'failed' })
    });
  }
}
