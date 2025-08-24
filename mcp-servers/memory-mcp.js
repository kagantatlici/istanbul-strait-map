#!/usr/bin/env node

const { Server } = require('@modelcontextprotocol/sdk/server/index.js');
const { StdioServerTransport } = require('@modelcontextprotocol/sdk/server/stdio.js');
const { CallToolRequestSchema } = require('@modelcontextprotocol/sdk/types.js');
const { Memory } = require('mem0-ts');

class MemoryMCPServer {
  constructor() {
    this.memory = new Memory();
    this.server = new Server(
      {
        name: 'memory-mcp',
        version: '1.0.0',
      },
      {
        capabilities: {
          tools: {},
        },
      }
    );
  }

  async initialize() {
    await this.memory.initialize();
    
    this.server.setRequestHandler(CallToolRequestSchema, async (request) => {
      const { name, arguments: args } = request.params;
      
      switch (name) {
        case 'add_memory':
          const { content, userId, metadata } = args;
          await this.memory.add(content, userId, metadata);
          return {
            content: [{ type: 'text', text: `Memory added for user: ${userId}` }]
          };
          
        case 'search_memory':
          const { query } = args;
          const memories = await this.memory.search(query);
          return {
            content: [{ type: 'text', text: JSON.stringify(memories, null, 2) }]
          };
          
        case 'list_memories':
          const allMemories = await this.memory.list();
          return {
            content: [{ type: 'text', text: JSON.stringify(allMemories, null, 2) }]
          };
          
        default:
          throw new Error(`Unknown tool: ${name}`);
      }
    });

    const transport = new StdioServerTransport();
    await this.server.connect(transport);
  }
}

const server = new MemoryMCPServer();
server.initialize().catch(console.error);
