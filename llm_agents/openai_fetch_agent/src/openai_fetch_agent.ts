import OpenAI from "openai";
import { AgentFunction, AgentFunctionInfo, sleep } from "graphai";
import { GraphAILLMInputBase, getMergeValue, getMessages } from "@graphai/llm_utils";

type OpenAIInputs = {
  model?: string;
  images?: string[];
  tools?: OpenAI.ChatCompletionTool[];
  tool_choice?: OpenAI.ChatCompletionToolChoiceOption;
  max_tokens?: number;
  verbose?: boolean;
  temperature?: number;
  // baseURL?: string;
  apiKey?: string;
  // stream?: boolean;
  messages?: Array<OpenAI.ChatCompletionMessageParam>;
  forWeb?: boolean;
  response_format?: any;
} & GraphAILLMInputBase;

const convertOpenAIChatCompletion = (response: OpenAI.ChatCompletion, messages: OpenAI.ChatCompletionMessageParam[]) => {
  const message = response?.choices[0] && response?.choices[0].message ? response?.choices[0].message : null;
  const text = message && message.content ? message.content : null;

  const functionResponse = message?.tool_calls && message?.tool_calls[0] ? message?.tool_calls[0] : null;
  // const functionId = message?.tool_calls && message?.tool_calls[0] ? message?.tool_calls[0]?.id : null;

  const tool = functionResponse
    ? {
        id: functionResponse.id,
        name: functionResponse?.function?.name,
        arguments: (() => {
          try {
            return JSON.parse(functionResponse?.function?.arguments);
          } catch (__e) {
            return undefined;
          }
        })(),
      }
    : undefined;

  if (message) {
    messages.push(message);
  }
  return {
    ...response,
    text,
    tool,
    message,
    messages,
  };
};

export const openAIFetchAgent: AgentFunction<OpenAIInputs, Record<string, any> | string, string | Array<any>, OpenAIInputs> = async ({
  params,
  namedInputs,
}) => {
  const { verbose, system, images, temperature, tools, tool_choice, max_tokens, /* baseURL, stream, */ apiKey, prompt, messages, response_format } = {
    ...params,
    ...namedInputs,
  };

  const userPrompt = getMergeValue(namedInputs, params, "mergeablePrompts", prompt);
  const systemPrompt = getMergeValue(namedInputs, params, "mergeableSystem", system);

  const messagesCopy = getMessages<OpenAI.ChatCompletionMessageParam>(systemPrompt, messages);

  if (!apiKey) {
    throw new Error("OPENAI_API_KEY key is not set in params. params: {apiKey: 'sk-xxx'}");
  }

  if (userPrompt) {
    messagesCopy.push({
      role: "user",
      content: userPrompt,
    });
  }
  if (images) {
    const image_url =
      params.model === "gpt-4-vision-preview"
        ? images[0]
        : {
            url: images[0],
            detail: "high",
          };
    messagesCopy.push({
      role: "user",
      content: [
        {
          type: "image_url",
          image_url,
        } as OpenAI.ChatCompletionContentPart,
      ],
    });
  }

  if (verbose) {
    console.log(messagesCopy);
  }

  const chatParams = {
    model: params.model || "gpt-4o",
    messages: messagesCopy as unknown as OpenAI.ChatCompletionMessageParam[],
    tools,
    tool_choice,
    max_tokens,
    temperature: temperature ?? 0.7,
    response_format,
  };

  const response = await fetch("https://api.openai.com/v1/chat/completions", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${apiKey}`,
    },
    body: JSON.stringify(chatParams),
  });

  if (response.status === 200) {
    const result = await response.json();
    return convertOpenAIChatCompletion(result, messagesCopy);
  }
  throw new Error("OPENAI API Error");
};

const input_sample = "this is response result";
const result_sample = {
  object: "chat.completion",
  id: "chatcmpl-9N7HxXYbwjmdbdiQE94MHoVluQhyt",
  choices: [
    {
      message: {
        role: "assistant",
        content: input_sample,
      },
      finish_reason: "stop",
      index: 0,
      logprobs: null,
    },
  ],
  created: 1715296589,
  model: "gpt-3.5-turbo-0125",
};

export const openAIMockAgent: AgentFunction<
  {
    model?: string;
    query?: string;
    system?: string;
    verbose?: boolean;
    temperature?: number;
  },
  Record<string, any> | string,
  string | Array<any>
> = async ({ filterParams }) => {
  for await (const token of input_sample.split("")) {
    if (filterParams && filterParams.streamTokenCallback && token) {
      await sleep(100);
      filterParams.streamTokenCallback(token);
    }
  }

  return result_sample;
};
const openAIFetchAgentInfo: AgentFunctionInfo = {
  name: "openAIFetchAgent",
  agent: openAIFetchAgent,
  mock: openAIMockAgent,
  inputs: {
    type: "object",
    properties: {
      model: { type: "string" },
      system: { type: "string" },
      tools: { type: "object" },
      tool_choice: {
        anyOf: [{ type: "array" }, { type: "object" }],
      },
      max_tokens: { type: "number" },
      verbose: { type: "boolean" },
      temperature: { type: "number" },
      // baseURL: { type: "string" },
      apiKey: {
        anyOf: [{ type: "string" }, { type: "object" }],
      },
      // stream: { type: "boolean" },
      prompt: {
        type: "string",
        description: "query string",
      },
      messages: {
        anyOf: [{ type: "string" }, { type: "object" }, { type: "array" }],
        description: "chat messages",
      },
    },
  },
  output: {
    type: "object",
    properties: {
      id: {
        type: "string",
      },
      object: {
        type: "string",
      },
      created: {
        type: "integer",
      },
      model: {
        type: "string",
      },
      choices: {
        type: "array",
        items: [
          {
            type: "object",
            properties: {
              index: {
                type: "integer",
              },
              message: {
                type: "array",
                items: [
                  {
                    type: "object",
                    properties: {
                      content: {
                        type: "string",
                      },
                      role: {
                        type: "string",
                      },
                    },
                    required: ["content", "role"],
                  },
                ],
              },
            },
            required: ["index", "message", "logprobs", "finish_reason"],
          },
        ],
      },
      usage: {
        type: "object",
        properties: {
          prompt_tokens: {
            type: "integer",
          },
          completion_tokens: {
            type: "integer",
          },
          total_tokens: {
            type: "integer",
          },
        },
        required: ["prompt_tokens", "completion_tokens", "total_tokens"],
      },
      text: {
        type: "string",
      },
      tool: {
        arguments: {
          type: "object",
        },
        name: {
          type: "string",
        },
      },
      message: {
        type: "object",
        properties: {
          content: {
            type: "string",
          },
          role: {
            type: "string",
          },
        },
        required: ["content", "role"],
      },
    },
    required: ["id", "object", "created", "model", "choices", "usage"],
  },
  params: {
    type: "object",
    properties: {
      model: { type: "string" },
      system: { type: "string" },
      tools: { type: "object" },
      tool_choice: { anyOf: [{ type: "array" }, { type: "object" }] },
      max_tokens: { type: "number" },
      verbose: { type: "boolean" },
      temperature: { type: "number" },
      // baseURL: { type: "string" },
      apiKey: { anyOf: [{ type: "string" }, { type: "object" }] },
      // stream: { type: "boolean" },
      prompt: { type: "string", description: "query string" },
      messages: { anyOf: [{ type: "string" }, { type: "object" }, { type: "array" }], description: "chat messages" },
    },
  },
  outputFormat: {
    llmResponse: {
      key: "choices.$0.message.content",
      type: "string",
    },
  },
  samples: [
    {
      inputs: { prompt: input_sample },
      params: {},
      result: result_sample,
    },
  ],
  description: "OpenAI Fetch Agent",
  category: ["llm"],
  author: "Receptron team",
  repository: "https://github.com/receptron/graphai",
  license: "MIT",
  stream: false,
  npms: ["openai"],
};

export default openAIFetchAgentInfo;
