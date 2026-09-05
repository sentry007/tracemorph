export const FALLBACK_RUNS = [
  {
    id: "run_market_research_demo",
    name: "Autonomous Market Research Agent",
    status: "completed" as const,
    parent_run_id: null,
    fork_step_id: null,
    metadata: { target: "SaaS Competitor Pricing", model: "claude-3-7-sonnet" },
    created_at: "2026-09-05 14:38:29",
    step_count: 4,
    total_tokens: 831,
    steps: [
      {
        id: "step_1_plan",
        step_number: 1,
        step_type: "thought" as const,
        prompt_context: "System: You are an autonomous market intelligence agent.\nUser: Audit top 3 competitors in digital business cards and evaluate their pricing tiers.",
        prompt_tokens: 38,
        completion_text: "Plan formulated:\n1. Search for top competitors in NFC and digital business cards.\n2. Fetch pricing pages.\n3. Extract per-seat tiers and limitations.\n4. Synthesize final comparative table.",
        completion_tokens: 52,
        latency_ms: 420,
        tool_calls: [],
        checkpoint: { phase: "planning", found_competitors: [] }
      },
      {
        id: "step_2_search",
        step_number: 2,
        step_type: "tool_call" as const,
        prompt_context: "System: You are an autonomous market intelligence agent.\nUser: Audit top 3 competitors in digital business cards and evaluate their pricing tiers.\nAssistant: Plan formulated.\nAction: Executing web search for competitors.",
        prompt_tokens: 98,
        completion_text: "Searching for market leaders in NFC smart business cards...",
        completion_tokens: 24,
        latency_ms: 650,
        tool_calls: [
          {
            id: "tool_search_1",
            tool_name: "web_search",
            input_args: { query: "top enterprise digital business card platforms 2026" },
            output_result: {
              results: [
                { name: "Popl Enterprise", url: "https://popl.co/enterprise", focus: "Enterprise Teams" },
                { name: "Blinq", url: "https://blinq.me", focus: "SMB & Individual" },
                { name: "HiHello Business", url: "https://hihello.com/business", focus: "Corporate" }
              ]
            },
            status: "success" as const,
            execution_time_ms: 310
          }
        ],
        checkpoint: { phase: "search_started" }
      },
      {
        id: "step_3_fetch",
        step_number: 3,
        step_type: "tool_call" as const,
        prompt_context: "System: You are an autonomous market intelligence agent.\nFound competitors: Popl, Blinq, HiHello.\nAction: Fetching pricing page for Popl Enterprise.",
        prompt_tokens: 245,
        completion_text: "Fetching pricing table from Popl API...",
        completion_tokens: 18,
        latency_ms: 820,
        tool_calls: [
          {
            id: "tool_fetch_1",
            tool_name: "http_fetch",
            input_args: { url: "https://popl.co/api/pricing/tiers", timeout_ms: 2000 },
            output_result: {
              error: "429 Too Many Requests: Rate limit exceeded. Cloudflare challenge encountered.",
              status_code: 429
            },
            status: "error" as const,
            execution_time_ms: 2010
          }
        ],
        checkpoint: { phase: "scraping_pricing", target: "Popl" }
      },
      {
        id: "step_4_reflect",
        step_number: 4,
        step_type: "reflection" as const,
        prompt_context: "System: You are an autonomous market intelligence agent.\nTool http_fetch failed with 429 Too Many Requests.\nReflecting on fallback options.",
        prompt_tokens: 310,
        completion_text: "Direct HTTP fetch was blocked by anti-bot challenge. Need to switch to search-cache fallback or fork this step with mock pricing data.",
        completion_tokens: 46,
        latency_ms: 510,
        tool_calls: [],
        checkpoint: { phase: "reflection", error_handled: true }
      }
    ]
  },
  {
    id: "run_b2b_qualifier_demo",
    name: "B2B Enterprise Lead Qualifier",
    status: "completed" as const,
    parent_run_id: null,
    fork_step_id: null,
    metadata: { framework: "TraceMorph-Agent-Loop", model: "claude-3-7-sonnet" },
    created_at: "2026-09-05 14:40:00",
    step_count: 4,
    total_tokens: 940,
    steps: [
      {
        id: "step_b2b_1",
        step_number: 1,
        step_type: "thought" as const,
        prompt_context: "System: You are an autonomous B2B inbound qualification agent.\nUser: Evaluate lead FinTech Global (250 employees) for AtlasLinq Enterprise tier.",
        prompt_tokens: 54,
        completion_text: "Decomposition: 1. Query CRM for @fintechglobal.com. 2. Inspect security stack for Okta/SAML. 3. Formulate recommendation.",
        completion_tokens: 42,
        latency_ms: 400,
        tool_calls: [],
        checkpoint: { phase: "intake", score: 0 }
      },
      {
        id: "step_b2b_2",
        step_number: 2,
        step_type: "tool_call" as const,
        prompt_context: "System: Autonomous B2B Lead Qualifier\nAction: Query CRM for past interactions.",
        prompt_tokens: 112,
        completion_text: "CRM record verified. Decision-maker identified: Sarah Jenkins (VP People & Operations).",
        completion_tokens: 31,
        latency_ms: 350,
        tool_calls: [
          {
            id: "tool_crm_1",
            tool_name: "crm_search",
            input_args: { domain: "fintechglobal.com", limit: 5 },
            output_result: { found: 1, contacts: [{ name: "Sarah Jenkins", title: "VP People & Operations" }] },
            status: "success" as const,
            execution_time_ms: 280
          }
        ],
        checkpoint: { phase: "crm_lookup" }
      },
      {
        id: "step_b2b_3",
        step_number: 3,
        step_type: "tool_call" as const,
        prompt_context: "System: Autonomous B2B Lead Qualifier\nChecking company SSO stack.",
        prompt_tokens: 198,
        completion_text: "Target organization enforces Okta SSO and SCIM auto-provisioning. Enterprise tier match is 100%.",
        completion_tokens: 38,
        latency_ms: 450,
        tool_calls: [
          {
            id: "tool_idp_1",
            tool_name: "idp_detector",
            input_args: { domain: "fintechglobal.com" },
            output_result: { idp: "Okta", sso_enforced: true, scim_supported: true },
            status: "success" as const,
            execution_time_ms: 410
          }
        ],
        checkpoint: { phase: "security_stack_check" }
      },
      {
        id: "step_b2b_4",
        step_number: 4,
        step_type: "output" as const,
        prompt_context: "System: Autonomous B2B Lead Qualifier\nSynthesize final account qualification summary.",
        prompt_tokens: 260,
        completion_text: "ACCOUNT QUALIFICATION SUMMARY:\n• Company: FinTech Global (250 seats)\n• Buyer Persona: Sarah Jenkins, VP People & Operations\n• Requirements: Okta SAML 2.0 & SCIM sync\n• Recommended Action: Offer 14-day Enterprise pilot\n• Estimated ARR: $18,000",
        completion_tokens: 64,
        latency_ms: 300,
        tool_calls: [],
        checkpoint: { phase: "completed", qualified: true }
      }
    ]
  }
];
