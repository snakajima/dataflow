import { GraphAI } from "graphai";
import * as agents from "@graphai/agents";
import dotenv from "dotenv";
dotenv.config();

import {
    CallToolResultSchema,
    // ListResourcesResultSchema,
    ListToolsResultSchema,
    // ReadResourceResultSchema,
  } from "@modelcontextprotocol/sdk/types.js";
  
  import { Client } from "@modelcontextprotocol/sdk/client/index.js";
  import { StdioClientTransport } from "@modelcontextprotocol/sdk/client/stdio.js";
  
  const main = async () => {
    
    const transport = new StdioClientTransport({
      command: "/Users/satoshi/git/ai/mpc/weather-server/build/index.js",
    });
    
    const client = new Client({
      name: "weather-client",
      version: "1.0.0",
    }, {
      capabilities: {}
    });
  
    await client.connect(transport);
    
    // List available resources
    /*
    const resources = await client.request(
      { method: "resources/list" },
      ListResourcesResultSchema
    );
  
    console.log(resources);
    */

    // Read a specific resource
    /*
    const resourceContent = await client.request(
      {
        method: "resources/read",
        params: {
          uri: "weather://San Francisco/current"
        }
      },
      ReadResourceResultSchema
    );
    console.log(resourceContent);
    */

    const graph_data = {
      version: 0.5,
      nodes: {
        request: {
          value: "Tell me the weather in Kona Tomorrow. Today is " + new Date()
        },
        tools: {
          agent: async () => { 
            const result = await client.request(
              { method: "tools/list" },
              ListToolsResultSchema,
            );
            const tool = result.tools[0];
            return [{
              type: "function",
              function: {
                name: tool.name,
                description: tool.description,
                parameters: tool.inputSchema
              }
            }];
          },
        },
        llm_prompt: {
          console: {
            before: true,
          },
          agent: "openAIAgent",
          inputs: { tools: ":tools", prompt: ":request" },
        },
        tool_call: {
          agent: async (inputs: any) => {
            const resourceContent = await client.request(
              {
                method: "tools/call",
                params: inputs.tool
              },
              CallToolResultSchema,
            );
            return resourceContent;
          },
          inputs: { tool: ":llm_prompt.tool" },
        },
        debug: {
          agent: "copyAgent",
          params: { namedKey: "key" },
          console: {
            after: true,
          },
          inputs: { key: ":tool_call.content.$0.text" },
        },
        messagesWithToolRes: {
          // Appends that message to the messages.
          agent: "pushAgent",
          inputs: {
            array: ":llm_prompt.messages",
            item: {
              role: "tool",
              tool_call_id: ":llm_prompt.tool.id",
              name: ":llm_prompt.tool.name",
              content: ":tool_call.content",
            },
          },
        },
        llm_post_call: {
          agent: "openAIAgent",
          inputs: {
            messages: ":messagesWithToolRes.array"
          }
        },
        final_output: {
          agent: "copyAgent",
          params: {
            namedKey: "text"
          },
          isResult: true,
          inputs: {
            text: ":llm_post_call.text"
          }
        }
      }
    };

    const graph = new GraphAI(graph_data, { ...agents });
    const results = await graph.run();
    console.log(results);
    client.close();
  };
  
  main();