#!/usr/bin/env node

const { Server } = require('@modelcontextprotocol/sdk/server/index.js');
const { StdioServerTransport } = require('@modelcontextprotocol/sdk/server/stdio.js');
const { CallToolRequestSchema } = require('@modelcontextprotocol/sdk/types.js');
const puppeteer = require('puppeteer');

class PuppeteerMCPServer {
  constructor() {
    this.browser = null;
    this.server = new Server(
      {
        name: 'puppeteer-mcp',
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
    this.server.setRequestHandler(CallToolRequestSchema, async (request) => {
      const { name, arguments: args } = request.params;
      
      switch (name) {
        case 'launch_browser':
          this.browser = await puppeteer.launch({ headless: true });
          return {
            content: [{ type: 'text', text: 'Browser launched successfully' }]
          };
          
        case 'navigate':
          const { url } = args;
          if (!this.browser) {
            this.browser = await puppeteer.launch({ headless: true });
          }
          const page = await this.browser.newPage();
          await page.goto(url);
          const title = await page.title();
          return {
            content: [{ type: 'text', text: `Navigated to ${url}. Title: ${title}` }]
          };
          
        case 'take_screenshot':
          const { path = 'screenshot.png' } = args;
          if (!this.browser) {
            this.browser = await puppeteer.launch({ headless: true });
          }
          const screenshotPage = await this.browser.newPage();
          await screenshotPage.goto(args.url || 'https://example.com');
          await screenshotPage.screenshot({ path });
          return {
            content: [{ type: 'text', text: `Screenshot saved to ${path}` }]
          };
          
        case 'close_browser':
          if (this.browser) {
            await this.browser.close();
            this.browser = null;
          }
          return {
            content: [{ type: 'text', text: 'Browser closed' }]
          };
          
        default:
          throw new Error(`Unknown tool: ${name}`);
      }
    });

    const transport = new StdioServerTransport();
    await this.server.connect(transport);
  }
}

const server = new PuppeteerMCPServer();
server.initialize().catch(console.error);
