import { XClient } from './client';
import { XConfig, XProfile, XTweet, SearchMode, MediaFile } from './types';
import dotenv from 'dotenv';
import { ToolParameterSchema, Plugin, PluginConfig, PluginInstance, logger } from '@astreus-ai/astreus';

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
    // Check if API credentials are provided
    if (!this.xConfig.apiKey || !this.xConfig.apiSecret) {
      logger.error('Missing required API key and/or secret');
      logger.error('Please check your .env file and ensure X_API_KEY and X_API_SECRET_KEY are set');
      throw new Error('X API key and secret are required');
    }
    
    // For sending tweets, we need access token and secret
    if (!this.xConfig.accessToken || !this.xConfig.accessSecret) {
      logger.warn('Missing user access token and/or secret');
      logger.warn('You may not be able to post tweets or perform other write operations');
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
    
    // Log a summary of tools instead of individual tool logs
    this.logToolsSummary();
    
    logger.success('X plugin initialized successfully');
  }

  /**
   * Log a summary of the tools initialized
   */
  private logToolsSummary(): void {
    const toolNames = Array.from(this.tools.keys());
    logger.info(`X plugin registered ${toolNames.length} tools: ${toolNames.join(', ')}`);
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
          let result;
          
          try {
            switch (methodName) {
              case 'get_profile':
                result = await this.getProfile(params);
                break;
              case 'get_tweets':
                result = await this.getTweets(params);
                break;
              case 'get_tweet':
                result = await this.getTweet(params);
                break;
              case 'search_tweets':
                result = await this.searchTweets(params);
                break;
              case 'send_tweet':
                result = await this.sendTweet(params);
                break;
              case 'send_tweet_with_poll':
                result = await this.sendTweetWithPoll(params);
                break;
              case 'retweet':
                result = await this.retweet(params);
                break;
              case 'like_tweet':
                result = await this.likeTweet(params);
                break;
              case 'get_trends':
                result = await this.getTrends();
                break;
              default:
                throw new Error(`Unknown method: ${methodName}`);
            }
            
            // Ensure we return a newly created object, not a reference to the input
            if (result === params) {
              if (typeof params === 'object' && params !== null) {
                result = { ...params };
              }
            }
            
            return result;
          } catch (error) {
            logger.error(`Error executing tool ${manifest.name}:`, error);
            if (error instanceof Error) {
              throw error;
            } else {
              throw new Error(`Error executing ${methodName}: ${error}`);
            }
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
   * Get a specific tool by plugin name and tool name
   * This is an extra helper not defined in the PluginInstance interface
   */
  getToolByFullName(fullName: string): Plugin | undefined {
    // Look for the tool directly
    return this.tools.get(fullName);
  }
  
  /**
   * Check if this is a valid PluginInstance
   * This is a diagnostic method to help debug issues
   */
  public debugPluginInterface(): boolean {
    // Check if the plugin implements the PluginInstance interface
    return typeof this.getTools === 'function' &&
      typeof this.getTool === 'function' &&
      typeof this.registerTool === 'function' &&
      typeof this.removeTool === 'function' &&
      typeof this.name === 'string';
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
  async sendTweet(params: Record<string, any>): Promise<any> {
    if (!this.client) throw new Error('X client not initialized');
    
    const { text, in_reply_to, media } = params;
    
    if (!text) throw new Error('Tweet text is required');
    
    try {
      let mediaFiles: MediaFile[] | undefined;
      
      if (media && Array.isArray(media)) {
        mediaFiles = media;
      }
      
      const tweetId = await this.client.sendTweet(text, in_reply_to, mediaFiles);
      
      if (tweetId) {
        return {
          success: true,
          id: tweetId,
          text,
        };
      } else {
        logger.warn('Tweet may have been posted but no ID was returned');
        return {
          success: true,
          id: null,
          text,
          note: 'Tweet may have been posted but no ID was returned'
        };
      }
    } catch (error) {
      logger.error('Error posting tweet:', error);
      
      return {
        success: false,
        error: error instanceof Error ? error.message : String(error),
      };
    }
  }

  /**
   * Send a new tweet with a poll
   */
  async sendTweetWithPoll(params: Record<string, any>): Promise<any> {
    if (!this.client) throw new Error('X client not initialized');
    
    const { text, poll_options, duration_minutes } = params;
    
    if (!text) throw new Error('Tweet text is required');
    if (!poll_options || !Array.isArray(poll_options) || poll_options.length < 2) {
      throw new Error('At least two poll options are required');
    }
    
    try {
      const tweetId = await this.client.sendTweetWithPoll(text, {
        options: poll_options,
        durationMinutes: duration_minutes || 1440 // Default to 24 hours
      });
      
      if (tweetId) {
        return {
          success: true,
          id: tweetId,
          text,
          poll_options,
        };
      } else {
        logger.warn('Tweet with poll may have been posted but no ID was returned');
        return {
          success: true,
          id: null,
          text,
          poll_options,
          note: 'Tweet with poll may have been posted but no ID was returned'
        };
      }
    } catch (error) {
      logger.error('Error posting tweet with poll:', error);
      
      return {
        success: false,
        error: error instanceof Error ? error.message : String(error),
      };
    }
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