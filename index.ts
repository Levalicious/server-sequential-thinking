#!/usr/bin/env node

import { Server } from "@modelcontextprotocol/sdk/server/index.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import {
  CallToolRequestSchema,
  ListToolsRequestSchema,
  Tool,
} from "@modelcontextprotocol/sdk/types.js";
// Fixed chalk import for ESM
import chalk from 'chalk';

interface ThoughtData {
  thought: string;
  thoughtNumber: number;
  totalThoughts: number;
  isRevision?: boolean;
  revisesThought?: number;
  branchFromThought?: number;
  branchId?: string;
  needsMoreThoughts?: boolean;
  nextThoughtNeeded: boolean;
}

class SequentialThinkingServer {
  private thoughtHistory: ThoughtData[] = [];
  private branches: Record<string, ThoughtData[]> = {};
  private disableThoughtLogging: boolean;

  constructor() {
    this.disableThoughtLogging = (process.env.DISABLE_THOUGHT_LOGGING || "").toLowerCase() === "true";
  }

  private validateThoughtData(input: unknown): ThoughtData {
    const data = input as Record<string, unknown>;

    if (!data.thought || typeof data.thought !== 'string') {
      throw new Error('Invalid thought: must be a string');
    }
    if (!data.thoughtNumber || typeof data.thoughtNumber !== 'number') {
      throw new Error('Invalid thoughtNumber: must be a number');
    }
    if (!data.totalThoughts || typeof data.totalThoughts !== 'number') {
      throw new Error('Invalid totalThoughts: must be a number');
    }
    if (typeof data.nextThoughtNeeded !== 'boolean') {
      throw new Error('Invalid nextThoughtNeeded: must be a boolean');
    }

    return {
      thought: data.thought,
      thoughtNumber: data.thoughtNumber,
      totalThoughts: data.totalThoughts,
      nextThoughtNeeded: data.nextThoughtNeeded,
      isRevision: data.isRevision as boolean | undefined,
      revisesThought: data.revisesThought as number | undefined,
      branchFromThought: data.branchFromThought as number | undefined,
      branchId: data.branchId as string | undefined,
      needsMoreThoughts: data.needsMoreThoughts as boolean | undefined,
    };
  }

  private formatThought(thoughtData: ThoughtData): string {
    const { thoughtNumber, totalThoughts, thought, isRevision, revisesThought, branchFromThought, branchId } = thoughtData;

    let prefix = '';
    let context = '';

    if (isRevision) {
      prefix = chalk.yellow('🔄 Revision');
      context = ` (revising thought ${revisesThought})`;
    } else if (branchFromThought) {
      prefix = chalk.green('🌿 Branch');
      context = ` (from thought ${branchFromThought}, ID: ${branchId})`;
    } else {
      prefix = chalk.blue('💭 Thought');
      context = '';
    }

    const header = `${prefix} ${thoughtNumber}/${totalThoughts}${context}`;
    const border = '─'.repeat(Math.max(header.length, thought.length) + 4);

    return `
┌${border}┐
│ ${header} │
├${border}┤
│ ${thought.padEnd(border.length - 2)} │
└${border}┘`;
  }

  public processThought(input: unknown): { content: Array<{ type: string; text: string }>; isError?: boolean } {
    try {
      const validatedInput = this.validateThoughtData(input);

      if (validatedInput.thoughtNumber > validatedInput.totalThoughts) {
        validatedInput.totalThoughts = validatedInput.thoughtNumber;
      }

      this.thoughtHistory.push(validatedInput);

      if (validatedInput.branchFromThought && validatedInput.branchId) {
        if (!this.branches[validatedInput.branchId]) {
          this.branches[validatedInput.branchId] = [];
        }
        this.branches[validatedInput.branchId].push(validatedInput);
      }

      if (!this.disableThoughtLogging) {
        const formattedThought = this.formatThought(validatedInput);
        console.error(formattedThought);
      }

      return {
        content: [{
          type: "text",
          text: JSON.stringify({
            thoughtNumber: validatedInput.thoughtNumber,
            totalThoughts: validatedInput.totalThoughts,
            nextThoughtNeeded: validatedInput.nextThoughtNeeded,
            branches: Object.keys(this.branches),
            thoughtHistoryLength: this.thoughtHistory.length
          }, null, 2)
        }]
      };
    } catch (error) {
      return {
        content: [{
          type: "text",
          text: JSON.stringify({
            error: error instanceof Error ? error.message : String(error),
            status: 'failed'
          }, null, 2)
        }],
        isError: true
      };
    }
  }
}

const SEQUENTIAL_THINKING_TOOL: Tool = {
  name: "sequentialthinking",
  description: `A detailed tool for dynamic and reflective problem-solving through thoughts.
This tool helps analyze problems through a flexible thinking process that can adapt and evolve.
Each thought can build on, question, or revise previous insights as understanding deepens.

When to use this tool:
- Breaking down complex problems into steps
- Planning and design with room for revision
- Analysis that might need course correction
- Problems where the full scope might not be clear initially
- Problems that require a multi-step solution
- Tasks that need to maintain context over multiple steps
- Situations where irrelevant information needs to be filtered out

Key features:
- You can adjust total_thoughts up or down as you progress
- You can question or revise previous thoughts
- You can add more thoughts even after reaching what seemed like the end
- You can express uncertainty and explore alternative approaches
- Not every thought needs to build linearly - you can branch or backtrack
- Generates a solution hypothesis
- Verifies the hypothesis based on the Chain of Thought steps
- Repeats the process until satisfied
- Provides a correct answer

Parameters explained:
- thought: Your current thinking step, which can include:
* Regular analytical steps
* Revisions of previous thoughts
* Questions about previous decisions
* Realizations about needing more analysis
* Changes in approach
* Hypothesis generation
* Hypothesis verification
- next_thought_needed: True if you need more thinking, even if at what seemed like the end
- thought_number: Current number in sequence (can go beyond initial total if needed)
- total_thoughts: Current estimate of thoughts needed (can be adjusted up/down)
- is_revision: A boolean indicating if this thought revises previous thinking
- revises_thought: If is_revision is true, which thought number is being reconsidered
- branch_from_thought: If branching, which thought number is the branching point
- branch_id: Identifier for the current branch (if any)
- needs_more_thoughts: If reaching end but realizing more thoughts needed

You should:
1. Start with an initial estimate of needed thoughts, but be ready to adjust
2. Feel free to question or revise previous thoughts
3. Don't hesitate to add more thoughts if needed, even at the "end"
4. Express uncertainty when present
5. Mark thoughts that revise previous thinking or branch into new paths
6. Ignore information that is irrelevant to the current step
7. Generate a solution hypothesis when appropriate
8. Verify the hypothesis based on the Chain of Thought steps
9. Repeat the process until satisfied with the solution
10. Provide a single, ideally correct answer as the final output
11. Only set next_thought_needed to false when truly done and a satisfactory answer is reached`,
  inputSchema: {
    type: "object",
    properties: {
      thought: {
        type: "string",
        description: "Your current thinking step"
      },
      nextThoughtNeeded: {
        type: "boolean",
        description: "Whether another thought step is needed"
      },
      thoughtNumber: {
        type: "integer",
        description: "Current thought number",
        minimum: 1
      },
      totalThoughts: {
        type: "integer",
        description: "Estimated total thoughts needed",
        minimum: 1
      },
      isRevision: {
        type: "boolean",
        description: "Whether this revises previous thinking"
      },
      revisesThought: {
        type: "integer",
        description: "Which thought is being reconsidered",
        minimum: 1
      },
      branchFromThought: {
        type: "integer",
        description: "Branching point thought number",
        minimum: 1
      },
      branchId: {
        type: "string",
        description: "Branch identifier"
      },
      needsMoreThoughts: {
        type: "boolean",
        description: "If more thoughts are needed"
      }
    },
    required: ["thought", "nextThoughtNeeded", "thoughtNumber", "totalThoughts"]
  }
};

const server = new Server(
  {
    name: "sequential-thinking-server",
    icons: [
      { src: "data:image/svg+xml;base64,PHN2ZyBmaWxsPSJjdXJyZW50Q29sb3IiIGZpbGwtcnVsZT0iZXZlbm9kZCIgaGVpZ2h0PSIxZW0iIHN0eWxlPSJmbGV4Om5vbmU7bGluZS1oZWlnaHQ6MSIgdmlld0JveD0iMCAwIDI0IDI0IiB3aWR0aD0iMWVtIiB4bWxucz0iaHR0cDovL3d3dy53My5vcmcvMjAwMC9zdmciPjx0aXRsZT5Nb2RlbENvbnRleHRQcm90b2NvbDwvdGl0bGU+PHBhdGggZD0iTTEzLjUgNC41QzEzLjUgNS4wNTUyMSAxMy4xOTg0IDUuNTM5OTcgMTIuNzUgNS43OTkzM1YxMy41OTJMMTkuODE2NSAxOC4xNjQ0QzIwLjAyMTUgMTguMDU5MyAyMC4yNTM4IDE4IDIwLjUgMThDMjEuMzI4NCAxOCAyMiAxOC42NzE2IDIyIDE5LjVDMjIgMjAuMzI4NCAyMS4zMjg0IDIxIDIwLjUgMjFDMTkuNjcxNiAyMSAxOSAyMC4zMjg0IDE5IDE5LjVDMTkgMTkuNDc0NSAxOS4wMDA2IDE5LjQ0OTEgMTkuMDAxOSAxOS40MjRMMTIgMTQuODkzM0w0Ljk5ODExIDE5LjQyNEM0Ljk5OTM2IDE5LjQ0OTEgNSAxOS40NzQ1IDUgMTkuNUM1IDIwLjMyODQgNC4zMjg0MyAyMSAzLjUgMjFDMi42NzE1NyAyMSAyIDIwLjMyODQgMiAxOS41QzIgMTguNjcxNiAyLjY3MTU3IDE4IDMuNSAxOEMzLjc0NjE5IDE4IDMuOTc4NTMgMTguMDU5MyA0LjE4MzUgMTguMTY0NEwxMS4yNSAxMy41OTJWNS43OTkzM0MxMC44MDE2IDUuNTM5OTcgMTAuNSA1LjA1NTIxIDEwLjUgNC41QzEwLjUgMy42NzE1NyAxMS4xNzE2IDMgMTIgM0MxMi44Mjg0IDMgMTMuNSAzLjY3MTU3IDEzLjUgNC41WiIgLz4KPHBhdGggZD0iTTguMDcwMzIgMTEuODA3NEM4LjUyMTYgMTAuOTk4NiA5LjIxMTQ0IDEwLjM0ODcgMTAuMDQ1NyA5Ljk0NjUxTDkuMzk0MjcgOC41OTUzNUM4LjI4MTkxIDkuMTMxNjUgNy4zNjIxMyA5Ljk5ODExIDYuNzYwNDMgMTEuMDc2NUM2LjE1ODcyIDEyLjE1NDkgNS45MDQ0MiAxMy4zOTI3IDYuMDMyMjIgMTQuNjIwOUM2LjA2ODY1IDE0Ljk3MTEgNi4xMzU2MiAxNS4zMTU1IDYuMjMxNTQgMTUuNjUwN0w3LjU2OTA1IDE0Ljc4NTNDNy41NTAzMiAxNC42Nzk2IDcuNTM1MzMgMTQuNTczIDcuNTI0MTYgMTQuNDY1N0M3LjQyODMyIDEzLjU0NDUgNy42MTkwNCAxMi42MTYyIDguMDcwMzIgMTEuODA3NFoiIC8+CjxwYXRoIGQ9Ik05LjQ2NjM1IDE3LjcxOUM5LjkwNjUyIDE4LjAxODggMTAuMzk5IDE4LjIzOTkgMTAuOTIyIDE4LjM2OUMxMS44MjEyIDE4LjU5MDggMTIuNzY3IDE4LjUyOTggMTMuNjMwMiAxOC4xOTQzQzEzLjk0ODggMTguMDcwNSAxNC4yNTA1IDE3LjkxMTUgMTQuNTMwMSAxNy43MjE0TDE1Ljg2NzggMTguNTg2OUMxNS4zNjUzIDE5LjAxMDcgMTQuNzkzNSAxOS4zNTE1IDE0LjE3MzcgMTkuNTkyNEMxMy4wMjI2IDIwLjAzOTggMTEuNzYxNiAyMC4xMjExIDEwLjU2MjcgMTkuODI1M0M5LjY2Mjg3IDE5LjYwMzMgOC44MzA5MSAxOS4xNzY5IDguMTI5MDMgMTguNTg0M0w5LjQ2NjM1IDE3LjcxOVoiIC8+CjxwYXRoIGQ9Ik0xNy43Njg1IDE1LjY1MDdDMTcuOTM1IDE1LjA2ODcgMTguMDEzNSAxNC40NjE1IDE3Ljk5ODEgMTMuODQ5MkMxNy45Njk3IDEyLjcxOTkgMTcuNjIzMiAxMS42MjM4IDE3LjAwMTUgMTAuNjg1NkwxOC4xOTI3IDkuNDk0NEgxNC42OTI3VjEyLjk5NDRMMTUuOTExNyAxMS43NzU0QzE2LjI3NyAxMi40MTc3IDE2LjQ3OTkgMTMuMTQyNyAxNi40OTg2IDEzLjg4NjlDMTYuNTA2MiAxNC4xODk1IDE2LjQ4MzIgMTQuNDkwMyAxNi40MzEgMTQuNzg1M0wxNy43Njg1IDE1LjY1MDdaIiAvPjwvc3ZnPg==",
        mimeType: "image/svg+xml",
        sizes: ["any"]
      }
    ],
    version: "0.0.3",
  },
  {
    capabilities: {
      tools: {},
    },
  }
);

const thinkingServer = new SequentialThinkingServer();

server.setRequestHandler(ListToolsRequestSchema, async () => ({
  tools: [SEQUENTIAL_THINKING_TOOL],
}));

server.setRequestHandler(CallToolRequestSchema, async (request) => {
  if (request.params.name === "sequentialthinking") {
    return thinkingServer.processThought(request.params.arguments);
  }

  return {
    content: [{
      type: "text",
      text: `Unknown tool: ${request.params.name}`
    }],
    isError: true
  };
});

async function runServer() {
  const transport = new StdioServerTransport();
  await server.connect(transport);
  console.error("Sequential Thinking MCP Server running on stdio");
}

runServer().catch((error) => {
  console.error("Fatal error running server:", error);
  process.exit(1);
});
