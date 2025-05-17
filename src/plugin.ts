import { XClient } from './client';
import { XConfig, XProfile, XTweet, SearchMode, MediaFile } from './types';
import dotenv from 'dotenv';
import { ToolParameterSchema, Plugin, PluginConfig, PluginInstance, logger } from '@astreus-ai/astreus';

// Load environment variables
dotenv.config();

// Step 1: Add a new interface for OpenAI function schemas at the top of the file
interface OpenAIFunctionDefinition {
  name: string;
  description: string;
  parameters: {
    type: string;
    properties: Record<string, any>;
    required?: string[];
  };
}

// Provider tools - update the interface
export interface ProviderTool {
  name: string;
  description?: string;
  // Support direct OpenAI function schema to avoid conversions
  parameters?: {
    type: string;
    properties: Record<string, any>;
    required?: string[];
  } | any;
  // This flag indicates this is a native OpenAI schema
  native?: boolean;
}

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
  private functionDefinitions: Map<string, OpenAIFunctionDefinition> = new Map(); // New map for OpenAI schema
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
      logger.warn('Missing X user access token and/or secret');
      logger.warn('You may not be able to post tweets or perform other write operations');
    }
    
    if (!this.xConfig.clientId || !this.xConfig.clientSecret) {
      logger.warn('Missing X client ID and/or client secret');
      logger.warn('OAuth 2.0 authentication will not be available');
    }
    
    this.client = new XClient(
      this.xConfig.apiKey,
      this.xConfig.apiSecret,
      this.xConfig.accessToken,
      this.xConfig.accessSecret,
      this.xConfig.clientId,
      this.xConfig.clientSecret
    );

    // Verify credentials by making a test API call
    try {
      logger.info('Verifying X API credentials...');
      
      // Try to get a user profile as a test
      await this.client.getProfile('X');
      
      logger.info('Successfully connected to X API with read permissions');
      
      // Update tools with initialized client
      this.initializeTools();
      
      // Log a summary of tools instead of individual tool logs
      this.logToolsSummary();
      
      logger.success('X plugin initialized successfully');
    } catch (error) {
      logger.error('Failed to verify X API credentials', error);
      if (error instanceof Error) {
        // Check for common authentication errors
        if (error.message.includes('401') || error.message.includes('403')) {
          logger.error('Authentication error. Please check your X API credentials.');
        }
        
        throw new Error(`X API initialization failed: ${error.message}`);
      } else {
        throw new Error('X API initialization failed with unknown error');
      }
    }
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
    // Get function definitions
    const functionDefs = this.getFunctionDefinitions();
    
    for (const funcDef of functionDefs) {
      // Store the original OpenAI function definition format
      this.functionDefinitions.set(funcDef.name, funcDef);
      
      // Create Astreus Plugin format by converting from OpenAI schema
      const plugin: Plugin = {
        name: funcDef.name,
        description: funcDef.description,
        // Convert from OpenAI schema to Astreus ToolParameterSchema[]
        parameters: this.convertOpenAISchemaToToolParameters(funcDef.parameters),
        execute: async (params: Record<string, any>) => {
          // Make sure client is initialized
          if (!this.client) await this.init();
          if (!this.client) throw new Error('X client not initialized');

          // Execute method based on the tool name
          const methodName = funcDef.name.replace('x_', '');
          
          // Log tool execution for debugging
          logger.debug(`TOOL EXECUTION: Running tool ${funcDef.name}`);
          
          let result;
          
          try {
            switch (methodName) {
              case 'get_profile': result = await this.getProfile(params); break;
              case 'get_tweets': result = await this.getTweets(params); break;
              case 'get_tweet': result = await this.getTweet(params); break;
              case 'search_tweets': result = await this.searchTweets(params); break;
              case 'send_tweet': 
                logger.info(`Sending tweet: "${params.text}"`);
                result = await this.sendTweet(params); 
                break;
              case 'send_tweet_with_poll': result = await this.sendTweetWithPoll(params); break;
              case 'retweet': result = await this.retweet(params); break;
              case 'like_tweet': result = await this.likeTweet(params); break;
              case 'get_trends': result = await this.getTrends(); break;
              default: throw new Error(`Unknown method: ${methodName}`);
            }
            
            // Return result
            if (result === params && typeof params === 'object' && params !== null) {
              result = { ...params };
            }
            
            logger.debug(`Tool ${funcDef.name} completed execution`);
            return result;
          } catch (error) {
            logger.error(`Error executing tool ${funcDef.name}:`, error);
            if (error instanceof Error) throw error;
            else throw new Error(`Error executing ${methodName}: ${error}`);
          }
        }
      };

      // Add tool to the map
      this.tools.set(funcDef.name, plugin);
    }

    // Update plugin config tools
    this.config.tools = Array.from(this.tools.values());
  }

  /**
   * Get the manifests for chatbot function calls
   */
  getFunctionDefinitions(): OpenAIFunctionDefinition[] {
    return [
      {
        name: 'x_get_profile',
        description: 'Get an X user profile by username',
        parameters: {
          type: 'object',
          properties: {
            username: {
              type: 'string',
              description: 'The X username to get the profile for (without the @ symbol)',
              pattern: '^[A-Za-z0-9_]{1,15}$'
            },
          },
          required: ['username']
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
              description: 'The X username to get tweets from (without the @ symbol)',
              pattern: '^[A-Za-z0-9_]{1,15}$'
            },
            limit: {
              type: 'integer',
              description: 'The maximum number of tweets to return',
              minimum: 1,
              maximum: 100,
              default: 10
            },
          },
          required: ['username']
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
              pattern: '^[0-9]+$'
            },
          },
          required: ['id']
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
              minLength: 1,
              maxLength: 500
            },
            limit: {
              type: 'integer',
              description: 'The maximum number of tweets to return',
              minimum: 1,
              maximum: 100,
              default: 10
            },
            mode: {
              type: 'string',
              enum: ['latest', 'top', 'people', 'photos', 'videos'],
              description: 'The search mode to use (latest, top, people, photos, or videos)',
              default: 'latest'
            },
          },
          required: ['query']
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
              description: 'The tweet text content',
              minLength: 1,
              maxLength: 280
            },
            in_reply_to: {
              type: 'string',
              description: 'The ID of the tweet to reply to (optional)',
              pattern: '^[0-9]+$'
            }
          },
          required: ['text']
        }
      },
      {
        name: 'x_send_tweet_with_poll',
        description: 'Send a new tweet with a poll',
        parameters: {
          type: 'object',
          properties: {
            text: {
              type: 'string',
              description: 'The tweet text content',
              minLength: 1,
              maxLength: 280
            },
            poll_option_1: {
              type: 'string',
              description: 'First poll option (required)',
              maxLength: 25
            },
            poll_option_2: {
              type: 'string',
              description: 'Second poll option (required)',
              maxLength: 25
            },
            poll_option_3: {
              type: 'string',
              description: 'Third poll option (optional)',
              maxLength: 25
            },
            poll_option_4: {
              type: 'string',
              description: 'Fourth poll option (optional)',
              maxLength: 25
            },
            duration_minutes: {
              type: 'integer',
              description: 'The duration of the poll in minutes (5-10080)',
              minimum: 5,
              maximum: 10080,
              default: 1440
            }
          },
          required: ['text', 'poll_option_1', 'poll_option_2', 'duration_minutes']
        }
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
              pattern: '^[0-9]+$'
            },
          },
          required: ['id']
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
              pattern: '^[0-9]+$'
            },
          },
          required: ['id']
        },
      },
      {
        name: 'x_get_trends',
        description: 'Get current X trends',
        parameters: {
          type: 'object',
          properties: {
            woeid: {
              type: 'integer',
              description: 'The Yahoo! Where On Earth ID of the location to get trends for (default: 1 for worldwide)',
              default: 1
            }
          },
          required: []
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
    if (!this.client) {
      logger.error('X client not initialized in sendTweet method');
      throw new Error('X client not initialized');
    }
    
    const { text, in_reply_to } = params;
    
    if (!text) {
      logger.error('Tweet text is missing in sendTweet parameters');
      throw new Error('Tweet text is required');
    }
    
    logger.info(`About to send tweet with text: "${text}"${in_reply_to ? ` as reply to: ${in_reply_to}` : ''}`);
    
    try {
      logger.debug(`Calling X client sendTweet method with parameters:`, { 
        textLength: text.length, 
        hasReplyTo: !!in_reply_to 
      });
      
      const tweetId = await this.client.sendTweet(text, in_reply_to);
      
      if (tweetId) {
        logger.info(`Tweet successfully posted with ID: ${tweetId}`);
        return {
          success: true,
          id: tweetId,
          text,
        };
      } else {
        logger.warn(`No tweet ID returned from X API, this might indicate the tweet was not actually posted`);
        logger.debug(`Tweet attempt details: Text: "${text.substring(0, 20)}..."`);
        return {
          success: true, // We keep this as true for backward compatibility
          id: null,
          text,
          note: 'Tweet may have been posted but no ID was returned - please check X directly'
        };
      }
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      logger.error(`Error posting tweet: ${errorMessage}`);
      logger.debug(`Tweet that failed: "${text}"`);
      
      if (error instanceof Error && error.stack) {
        logger.debug(`Error stack trace: ${error.stack}`);
      }
      
      // Check for specific error types
      if (errorMessage.includes('401')) {
        logger.error('Authentication error - check X API credentials and token validity');
      } else if (errorMessage.includes('403')) {
        logger.error('Permission error - your X app may not have write permissions');
      } else if (errorMessage.includes('duplicate')) {
        logger.warn('Duplicate tweet error - X doesn\'t allow identical tweets');
      }
      
      return {
        success: false,
        error: errorMessage,
        text: text, // Include the text that failed for easier debugging
      };
    }
  }

  /**
   * Send a new tweet with a poll
   */
  async sendTweetWithPoll(params: Record<string, any>): Promise<any> {
    if (!this.client) throw new Error('X client not initialized');
    
    const { text, poll_option_1, poll_option_2, poll_option_3, poll_option_4, duration_minutes } = params;
    
    if (!text) throw new Error('Tweet text is required');
    if (!poll_option_1 || !poll_option_2) {
      throw new Error('At least two poll options are required');
    }
    
    logger.info(`About to send tweet with poll: "${text}"`);
    
    try {
      logger.debug('Calling X client sendTweetWithPoll method');
      const tweetId = await this.client.sendTweetWithPoll(text, {
        options: [poll_option_1, poll_option_2, poll_option_3, poll_option_4].filter(Boolean),
        durationMinutes: duration_minutes || 1440 // Default to 24 hours
      });
      
      if (tweetId) {
        logger.info(`Tweet with poll successfully posted with ID: ${tweetId}`);
        return {
          success: true,
          id: tweetId,
          text,
          poll_options: [poll_option_1, poll_option_2, poll_option_3, poll_option_4].filter(Boolean),
        };
      } else {
        logger.warn('No tweet ID returned from X API for poll tweet');
        return {
          success: true,
          id: null,
          text,
          poll_options: [poll_option_1, poll_option_2, poll_option_3, poll_option_4].filter(Boolean),
          note: 'Tweet with poll may have been posted but no ID was returned'
        };
      }
    } catch (error) {
      logger.error(`Error posting tweet with poll: ${error}`);
      
      return {
        success: false,
        error: error instanceof Error ? error.message : String(error),
      };
    }
  }

  /**
   * Retweet a tweet
   */
  async retweet(params: Record<string, any>): Promise<any> {
    if (!this.client) await this.init();
    if (!this.client) throw new Error('X client not initialized');

    const id = params.id;
    if (!id) throw new Error('Tweet ID is required');

    logger.info(`Attempting to retweet tweet with ID: ${id}`);
    
    try {
      const success = await this.client.retweet(id);
      
      if (success) {
        logger.info(`Successfully retweeted tweet ${id}`);
        return { 
          success: true,
          id
        };
      } else {
        logger.warn(`Failed to retweet tweet ${id}`);
        return { 
          success: false,
          id,
          note: 'Retweet API call failed'
        };
      }
    } catch (error) {
      logger.error(`Error retweeting tweet: ${error}`);
      return {
        success: false,
        error: error instanceof Error ? error.message : String(error),
      };
    }
  }

  /**
   * Like a tweet
   */
  async likeTweet(params: Record<string, any>): Promise<any> {
    if (!this.client) await this.init();
    if (!this.client) throw new Error('X client not initialized');

    const id = params.id;
    if (!id) throw new Error('Tweet ID is required');

    logger.info(`Attempting to like tweet with ID: ${id}`);
    
    try {
      const success = await this.client.likeTweet(id);
      
      if (success) {
        logger.info(`Successfully liked tweet ${id}`);
        return { 
          success: true,
          id
        };
      } else {
        logger.warn(`Failed to like tweet ${id}`);
        return { 
          success: false,
          id,
          note: 'Like API call failed'
        };
      }
    } catch (error) {
      logger.error(`Error liking tweet: ${error}`);
      return {
        success: false,
        error: error instanceof Error ? error.message : String(error),
      };
    }
  }

  /**
   * Get current X trends
   */
  async getTrends(): Promise<string[]> {
    if (!this.client) await this.init();
    if (!this.client) throw new Error('X client not initialized');

    throw new Error('getTrends is not implemented in the X API client');
  }

  /**
   * Get the OpenAI native functions for use with the OpenAI API
   */
  getNativeOpenAIFunctions(): OpenAIFunctionDefinition[] {
    return Array.from(this.functionDefinitions.values());
  }

  /**
   * Convert OpenAI function parameters to Astreus ToolParameterSchema array
   */
  private convertOpenAISchemaToToolParameters(openAISchema: any): ToolParameterSchema[] {
    const result: ToolParameterSchema[] = [];
    
    if (!openAISchema || !openAISchema.properties) {
      return result;
    }
    
    // Get the required parameters
    const requiredParams = openAISchema.required || [];
    
    // Convert each property to a ToolParameterSchema
    for (const [name, prop] of Object.entries<any>(openAISchema.properties)) {
      // Basic parameter properties
      const parameter: ToolParameterSchema = {
        name,
        type: prop.type as any,
        description: prop.description || `Parameter ${name}`,
        required: requiredParams.includes(name)
      };
      
      // Add additional properties
      if (prop.default !== undefined) {
        parameter.default = prop.default;
      }
      
      // Note: ToolParameterSchema doesn't support enum directly
      // Include enum values in the description for reference
      if (prop.enum) {
        parameter.description = `${parameter.description} (Allowed values: ${prop.enum.join(', ')})`;
      }
      
      result.push(parameter);
    }
    
    return result;
  }
}

// Default export
export default XPlugin;

/**
 * Create a native OpenAI tool from a plugin's function definition
 */
export function createNativeOpenAITool(name: string, description: string, parameters: any): ProviderTool {
  return {
    name,
    description,
    parameters,
    native: true // Set the flag to indicate this is a native schema
  };
} 