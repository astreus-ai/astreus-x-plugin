import { XClient } from './client';
import { XConfig, XProfile, XTweet, SearchMode } from './types';
import dotenv from 'dotenv';
import { ToolParameterSchema, Plugin, PluginConfig, PluginInstance } from 'astreus';

// Load environment variables
dotenv.config();

/**
 * X Plugin for Astreus
 * This plugin provides X API functionality for Astreus agents
 */
export class XPlugin implements PluginInstance {
  public name = 'x';
  public description = 'X integration for Astreus agents';
  private client: XClient | null = null;
  private xConfig: XConfig;
  private tools: Map<string, Plugin> = new Map();
  public config: PluginConfig;

  constructor(config?: XConfig) {
    this.xConfig = config || {
      apiKey: process.env.X_API_KEY,
      apiSecret: process.env.X_API_SECRET_KEY,
      accessToken: process.env.X_ACCESS_TOKEN,
      accessSecret: process.env.X_ACCESS_TOKEN_SECRET,
      clientId: process.env.X_CLIENT_ID,
      clientSecret: process.env.X_CLIENT_SECRET,
    };

    // Initialize plugin config
    this.config = {
      name: 'x',
      description: 'X integration for Astreus agents',
      version: '1.0.0',
      tools: []
    };

    // Initialize tools
    this.initializeTools();
  }

  /**
   * Initialize the X client
   */
  async init(): Promise<void> {
    if (!this.xConfig.apiKey || !this.xConfig.apiSecret) {
      throw new Error('X API key and secret are required');
    }
    
    this.client = new XClient(
      this.xConfig.apiKey,
      this.xConfig.apiSecret,
      this.xConfig.accessToken,
      this.xConfig.accessSecret,
      this.xConfig.clientId,
      this.xConfig.clientSecret
    );

    // Update tools with initialized client
    this.initializeTools();
  }

  /**
   * Initialize tools for Astreus compatibility
   */
  private initializeTools(): void {
    // Convert chat manifests to Astreus Plugin objects
    const manifests = this.getChatManifests();
    
    for (const manifest of manifests) {
      const plugin: Plugin = {
        name: manifest.name,
        description: manifest.description,
        parameters: this.convertParameters(manifest.parameters),
        execute: async (params: Record<string, any>) => {
          // Make sure client is initialized
          if (!this.client) await this.init();
          if (!this.client) throw new Error('X client not initialized');

          // Execute the appropriate method based on the tool name
          const methodName = manifest.name.replace('x_', '');
          
          switch (methodName) {
            case 'get_profile':
              return await this.getProfile(params);
            case 'get_tweets':
              return await this.getTweets(params);
            case 'get_tweet':
              return await this.getTweet(params);
            case 'search_tweets':
              return await this.searchTweets(params);
            case 'send_tweet':
              return await this.sendTweet(params);
            case 'send_tweet_with_poll':
              return await this.sendTweetWithPoll(params);
            case 'retweet':
              return await this.retweet(params);
            case 'like_tweet':
              return await this.likeTweet(params);
            case 'get_trends':
              return await this.getTrends();
            default:
              throw new Error(`Unknown method: ${methodName}`);
          }
        }
      };

      // Add tool to the map
      this.tools.set(manifest.name, plugin);
    }

    // Update plugin config tools
    this.config.tools = Array.from(this.tools.values());
  }

  /**
   * Convert OpenAPI-style parameters to Astreus ToolParameterSchema
   */
  private convertParameters(params: any): ToolParameterSchema[] {
    const result: ToolParameterSchema[] = [];
    
    if (params && params.properties) {
      for (const [name, prop] of Object.entries<any>(params.properties)) {
        const type = prop.type as string;
        // Ensure type is one of the allowed values
        const validType = ["string", "number", "boolean", "object", "array"].includes(type) 
          ? type as "string" | "number" | "boolean" | "object" | "array"
          : "string"; // Default to string if not a valid type
          
        result.push({
          name,
          type: validType,
          description: prop.description || '',
          required: params.required?.includes(name) || false
        });
      }
    }
    
    return result;
  }

  /**
   * Get the manifests for chatbot function calls
   */
  getChatManifests() {
    return [
      {
        name: 'x_get_profile',
        description: 'Get an X user profile by username',
        parameters: {
          type: 'object',
          properties: {
            username: {
              type: 'string',
              description: 'The X username to get the profile for',
            },
          },
          required: ['username'],
        },
      },
      {
        name: 'x_get_tweets',
        description: 'Get recent tweets from an X user',
        parameters: {
          type: 'object',
          properties: {
            username: {
              type: 'string',
              description: 'The X username to get tweets from',
            },
            limit: {
              type: 'number',
              description: 'The maximum number of tweets to return (default: 10)',
            },
          },
          required: ['username'],
        },
      },
      {
        name: 'x_get_tweet',
        description: 'Get a specific tweet by ID',
        parameters: {
          type: 'object',
          properties: {
            id: {
              type: 'string',
              description: 'The ID of the tweet to retrieve',
            },
          },
          required: ['id'],
        },
      },
      {
        name: 'x_search_tweets',
        description: 'Search for tweets by keyword',
        parameters: {
          type: 'object',
          properties: {
            query: {
              type: 'string',
              description: 'The search query',
            },
            limit: {
              type: 'number',
              description: 'The maximum number of tweets to return (default: 10)',
            },
            mode: {
              type: 'string',
              enum: ['latest', 'top', 'people', 'photos', 'videos'],
              description: 'The search mode',
            },
          },
          required: ['query'],
        },
      },
      {
        name: 'x_send_tweet',
        description: 'Send a new tweet',
        parameters: {
          type: 'object',
          properties: {
            text: {
              type: 'string',
              description: 'The tweet text',
            },
            in_reply_to: {
              type: 'string',
              description: 'The ID of the tweet to reply to (optional)',
            },
          },
          required: ['text'],
        },
      },
      {
        name: 'x_send_tweet_with_poll',
        description: 'Send a new tweet with a poll',
        parameters: {
          type: 'object',
          properties: {
            text: {
              type: 'string',
              description: 'The tweet text',
            },
            options: {
              type: 'array',
              items: {
                type: 'string',
              },
              description: 'The poll options (2-4 options)',
            },
            duration_minutes: {
              type: 'number',
              description: 'The duration of the poll in minutes (5-10080)',
            },
          },
          required: ['text', 'options', 'duration_minutes'],
        },
      },
      {
        name: 'x_retweet',
        description: 'Retweet a tweet',
        parameters: {
          type: 'object',
          properties: {
            id: {
              type: 'string',
              description: 'The ID of the tweet to retweet',
            },
          },
          required: ['id'],
        },
      },
      {
        name: 'x_like_tweet',
        description: 'Like a tweet',
        parameters: {
          type: 'object',
          properties: {
            id: {
              type: 'string',
              description: 'The ID of the tweet to like',
            },
          },
          required: ['id'],
        },
      },
      {
        name: 'x_get_trends',
        description: 'Get current X trends',
        parameters: {
          type: 'object',
          properties: {},
          required: [],
        },
      },
    ];
  }

  /**
   * Get all available tools
   */
  getTools(): Plugin[] {
    return Array.from(this.tools.values());
  }

  /**
   * Get a specific tool by name
   */
  getTool(name: string): Plugin | undefined {
    return this.tools.get(name);
  }

  /**
   * Register a new tool
   */
  registerTool(tool: Plugin): void {
    this.tools.set(tool.name, tool);
    
    // Update plugin config
    this.config.tools = Array.from(this.tools.values());
  }

  /**
   * Remove a tool by name
   */
  removeTool(name: string): boolean {
    const removed = this.tools.delete(name);
    
    // Update plugin config
    if (removed) {
      this.config.tools = Array.from(this.tools.values());
    }
    
    return removed;
  }

  /**
   * Get an X user profile by username
   */
  async getProfile(params: Record<string, any>): Promise<XProfile | null> {
    if (!this.client) await this.init();
    if (!this.client) throw new Error('X client not initialized');

    const username = params.username;
    if (!username) throw new Error('Username is required');

    return await this.client.getProfile(username);
  }

  /**
   * Get recent tweets from an X user
   */
  async getTweets(params: Record<string, any>): Promise<XTweet[]> {
    if (!this.client) await this.init();
    if (!this.client) throw new Error('X client not initialized');

    const username = params.username;
    if (!username) throw new Error('Username is required');

    return await this.client.getTweets(username, params.limit || 10);
  }

  /**
   * Get a specific tweet by ID
   */
  async getTweet(params: Record<string, any>): Promise<XTweet | null> {
    if (!this.client) await this.init();
    if (!this.client) throw new Error('X client not initialized');

    const id = params.id;
    if (!id) throw new Error('Tweet ID is required');

    return await this.client.getTweet(id);
  }

  /**
   * Search for tweets by keyword
   */
  async searchTweets(params: Record<string, any>): Promise<XTweet[]> {
    if (!this.client) await this.init();
    if (!this.client) throw new Error('X client not initialized');

    const query = params.query;
    if (!query) throw new Error('Search query is required');

    return await this.client.searchTweets(
      query,
      params.limit || 10,
      params.mode || SearchMode.Latest
    );
  }

  /**
   * Send a new tweet
   */
  async sendTweet(params: Record<string, any>): Promise<string | null> {
    if (!this.client) await this.init();
    if (!this.client) throw new Error('X client not initialized');

    const text = params.text;
    if (!text) throw new Error('Tweet text is required');

    return await this.client.sendTweet(text, params.in_reply_to, params.media);
  }

  /**
   * Send a new tweet with a poll
   */
  async sendTweetWithPoll(params: Record<string, any>): Promise<string | null> {
    if (!this.client) await this.init();
    if (!this.client) throw new Error('X client not initialized');

    const text = params.text;
    if (!text) throw new Error('Tweet text is required');

    const options = params.options;
    if (!options || !Array.isArray(options) || options.length < 2 || options.length > 4) {
      throw new Error('Poll options must be an array of 2-4 strings');
    }

    const durationMinutes = params.duration_minutes;
    if (!durationMinutes || durationMinutes < 5 || durationMinutes > 10080) {
      throw new Error('Poll duration must be between 5 and 10080 minutes');
    }

    return await this.client.sendTweetWithPoll(text, {
      options,
      durationMinutes
    });
  }

  /**
   * Retweet a tweet
   */
  async retweet(params: Record<string, any>): Promise<boolean> {
    if (!this.client) await this.init();
    if (!this.client) throw new Error('X client not initialized');

    const id = params.id;
    if (!id) throw new Error('Tweet ID is required');

    return await this.client.retweet(id);
  }

  /**
   * Like a tweet
   */
  async likeTweet(params: Record<string, any>): Promise<boolean> {
    if (!this.client) await this.init();
    if (!this.client) throw new Error('X client not initialized');

    const id = params.id;
    if (!id) throw new Error('Tweet ID is required');

    return await this.client.likeTweet(id);
  }

  /**
   * Get current X trends
   */
  async getTrends(): Promise<string[]> {
    if (!this.client) await this.init();
    if (!this.client) throw new Error('X client not initialized');

    throw new Error('getTrends is not implemented in the X API client');
  }
}

// Default export
export default XPlugin; 