import axios from 'axios';
import { createHmac } from 'crypto';
import FormData from 'form-data';
import { XProfile, XTweet, SearchMode, MediaFile, ReferencedStatus } from './types';
import { encode as encodeQueryString } from 'querystring';
import fs from 'fs';
import { logger } from '@astreus-ai/astreus';

/**
 * X (formerly Twitter) API client
 */
export class XClient {
  private apiKey: string; 
  private apiSecret: string;
  private accessToken: string | undefined;
  private accessSecret: string | undefined;
  private clientId: string | undefined;
  private clientSecret: string | undefined;
  private baseUrl = 'https://api.twitter.com/1.1';
  private baseUrlV2 = 'https://api.twitter.com/2';

  /**
   * Create a new X API client
   */
  constructor(
    apiKey: string,
    apiSecret: string,
    accessToken?: string,
    accessSecret?: string,
    clientId?: string,
    clientSecret?: string
  ) {
    this.apiKey = apiKey;
    this.apiSecret = apiSecret;
    this.accessToken = accessToken;
    this.accessSecret = accessSecret;
    this.clientId = clientId;
    this.clientSecret = clientSecret;
  }

  /**
   * Generate the OAuth 1.0a authorization header
   */
  private generateAuthHeader(
    method: string,
    url: string,
    params: Record<string, string> = {}
  ): string {
    const timestamp = Math.floor(Date.now() / 1000).toString();
    const nonce = Buffer.from(Math.random().toString(36)).toString('base64');

    const oauthParams: Record<string, string> = {
      oauth_consumer_key: this.apiKey,
      oauth_nonce: nonce,
      oauth_signature_method: 'HMAC-SHA1',
      oauth_timestamp: timestamp,
      oauth_token: this.accessToken || '',
      oauth_version: '1.0',
    };

    // Combine and sort parameters
    const allParams = { ...params, ...oauthParams };
    const sortedParams = Object.keys(allParams)
      .sort()
      .reduce((acc: Record<string, string>, key) => {
        acc[key] = allParams[key];
        return acc;
      }, {});

    // Create parameter string
    const paramString = Object.keys(sortedParams)
      .map((key) => {
        return `${encodeURIComponent(key)}=${encodeURIComponent(sortedParams[key])}`;
      })
      .join('&');

    // Create signature base
    const signatureBase = [
      method.toUpperCase(),
      encodeURIComponent(url),
      encodeURIComponent(paramString),
    ].join('&');

    // Create signing key
    const signingKey = `${encodeURIComponent(this.apiSecret)}&${
      this.accessSecret ? encodeURIComponent(this.accessSecret) : ''
    }`;

    // Generate signature
    const signature = createHmac('sha1', signingKey)
      .update(signatureBase)
      .digest('base64');

    // Create OAuth header
    const oauthHeader = `OAuth oauth_consumer_key="${encodeURIComponent(
      this.apiKey
    )}", oauth_nonce="${encodeURIComponent(
      nonce
    )}", oauth_signature="${encodeURIComponent(
      signature
    )}", oauth_signature_method="HMAC-SHA1", oauth_timestamp="${timestamp}", oauth_token="${
      this.accessToken ? encodeURIComponent(this.accessToken) : ''
    }", oauth_version="1.0"`;

    return oauthHeader;
  }

  /**
   * Make an authenticated request to the X API
   */
  private async request<T>(
    method: string,
    endpoint: string,
    params: Record<string, string> = {},
    isV2 = false,
    data?: any
  ): Promise<T> {
    const baseUrl = isV2 ? this.baseUrlV2 : this.baseUrl;
    const url = `${baseUrl}${endpoint}`;
    
    logger.debug(`API Request: ${method} ${url}`);
    logger.debug(`Request parameters: ${JSON.stringify(params)}`);
    
    let queryString = '';
    if (Object.keys(params).length > 0 && method === 'GET') {
      queryString = '?' + encodeQueryString(params);
    }
    
    // Use OAuth 2.0 if client credentials are available, otherwise use OAuth 1.0a
    let headers: Record<string, string> = {};
    
    if (this.clientId && this.clientSecret && isV2) {
      // Use OAuth 2.0 for V2 endpoints when client credentials are available
      logger.debug(`Attempting OAuth 2.0 authentication with client ID: ${this.clientId.substring(0, 4)}...`);
      try {
        // Get bearer token using client credentials
        const tokenUrl = 'https://api.twitter.com/2/oauth2/token';
        
        logger.debug(`Requesting OAuth 2.0 token from ${tokenUrl}`);
        
        const tokenResponse = await axios({
          method: 'POST',
          url: tokenUrl,
          headers: {
            'Content-Type': 'application/x-www-form-urlencoded',
            Authorization: `Basic ${Buffer.from(`${this.clientId}:${this.clientSecret}`).toString('base64')}`
          },
          data: `grant_type=client_credentials&client_id=${encodeURIComponent(this.clientId)}&client_secret=${encodeURIComponent(this.clientSecret)}&client_type=service_client&scope=tweet.read%20tweet.write%20users.read`
        });
        
        logger.debug(`OAuth 2.0 token response status: ${tokenResponse.status}`);
        
        if (tokenResponse.data && tokenResponse.data.access_token) {
          headers = {
            Authorization: `Bearer ${tokenResponse.data.access_token}`,
            'Content-Type': data instanceof FormData ? 'multipart/form-data' : 'application/json',
          };
          logger.debug(`Successfully obtained OAuth 2.0 bearer token. Token type: ${tokenResponse.data.token_type}, Scope: ${tokenResponse.data.scope || 'unknown'}`);
        }
        else {
          logger.debug(`Failed to obtain OAuth 2.0 token. Response: ${JSON.stringify(tokenResponse.data)}`);
          throw new Error('Failed to obtain bearer token');
        }
      }
      catch (error) {
        logger.warn(`Error getting OAuth 2.0 token, falling back to OAuth 1.0a`);
        if (axios.isAxiosError(error) && error.response) {
          logger.debug(`OAuth 2.0 error details: Status ${error.response.status}, Data: ${JSON.stringify(error.response.data || {})}`);
        }
        
        // Fall back to OAuth 1.0a
        logger.debug(`Using OAuth 1.0a as fallback`);
        const authHeader = this.generateAuthHeader(method, url, method === 'GET' ? params : {});
        headers = {
          Authorization: authHeader,
          'Content-Type': data instanceof FormData ? 'multipart/form-data' : 'application/json',
        };
      }
    } else {
      // Use OAuth 1.0a
      logger.debug(`Using OAuth 1.0a authentication with API key: ${this.apiKey.substring(0, 4)}...`);
      const authHeader = this.generateAuthHeader(method, url, method === 'GET' ? params : {});
      headers = {
        Authorization: authHeader,
        'Content-Type': data instanceof FormData ? 'multipart/form-data' : 'application/json',
      };
    }

    try {
      // Check if credentials are available
      if (!this.apiKey || !this.apiSecret) {
        logger.error(`Missing API key or secret`);
        throw new Error('X API key and secret are required');
      }
      
      if (isV2 && method === 'POST' && !this.accessToken) {
        logger.warn(`POST requests to v2 API may require user access token - current action may fail`);
        logger.debug(`Check your X Developer Portal for the required app permissions and token types`);
      }
      
      // Log request details for debugging
      logger.debug(`Making ${method} request to: ${url}${queryString}`);
      logger.debug(`Request headers: ${JSON.stringify({...headers, Authorization: 'REDACTED'})}`);
      
      if (method !== 'GET' && data) {
        if (data instanceof FormData) {
          logger.debug(`Request contains FormData payload`);
        } else {
          logger.debug(`Request payload: ${JSON.stringify(data)}`);
        }
      }
      
      const response = await axios({
        method,
        url: `${url}${queryString}`,
        headers,
        data: method !== 'GET' ? data : undefined,
      });
      
      // Log response summary
      logger.debug(`Response status: ${response.status}`);
      logger.debug(`Response headers: ${JSON.stringify(response.headers)}`);
      
      if (response.data) {
        const dataSummary = typeof response.data === 'object' 
          ? `${JSON.stringify(response.data).substring(0, 200)}${JSON.stringify(response.data).length > 200 ? '...' : ''}`
          : response.data;
        logger.debug(`Response data (truncated): ${dataSummary}`);
      }
      
      return response.data as T;
    } catch (error) {
      logger.error(`Request error:`, error);
      if (axios.isAxiosError(error) && error.response) {
        logger.error(`API error ${error.response.status}:`, 
          JSON.stringify(error.response.data || error.message));
        
        // More detailed logging for specific error codes
        if (error.response.status === 401) {
          logger.error('Authentication error: Your credentials are invalid or expired');
        } else if (error.response.status === 403) {
          logger.error('Authorization error: You don\'t have permission to perform this action');
          
          if (isV2 && method === 'POST') {
            logger.error('This may be because your app does not have write permissions');
            logger.error('Check your app permissions in the X Developer Portal');
          }
        } else if (error.response.status === 429) {
          logger.error('Rate limit exceeded: You\'ve made too many requests to the X API');
          if (error.response.headers['x-rate-limit-reset']) {
            const resetTime = parseInt(error.response.headers['x-rate-limit-reset'] as string) * 1000;
            logger.error(`Rate limit will reset at: ${new Date(resetTime).toLocaleString()}`);
          }
        }
        
        throw new Error(
          `X API error: ${error.response.status} - ${
            JSON.stringify(error.response.data) || error.message
          }`
        );
      }
      throw error;
    }
  }

  /**
   * Get an X user profile by username
   */
  async getProfile(username: string): Promise<XProfile | null> {
    try {
      // V2 API endpoint for user lookup
      const response = await this.request<any>(
        'GET',
        `/users/by/username/${username}`,
        {
          'user.fields': 'description,profile_image_url,public_metrics,verified,created_at,location,url',
        },
        true
      );

      if (response && response.data) {
        const user = response.data;
        return {
          id: user.id,
          username: username,
          displayName: user.name,
          bio: user.description || '',
          location: user.location || '',
          url: user.url || '',
          followersCount: user.public_metrics?.followers_count || 0,
          followingCount: user.public_metrics?.following_count || 0,
          tweetCount: user.public_metrics?.tweet_count || 0,
          verified: user.verified || false,
          profileImageUrl: user.profile_image_url || '',
          createdAt: user.created_at ? new Date(user.created_at) : new Date(),
        };
      }
      return null;
    } catch (error) {
      logger.error('Error fetching X profile:', error);
      throw error;
    }
  }

  /**
   * Get tweets from a user by username
   */
  async getTweets(username: string, limit = 10): Promise<XTweet[]> {
    try {
      // First get the user ID
      const user = await this.getProfile(username);
      if (!user) {
        throw new Error(`User ${username} not found`);
      }

      // Then get the tweets
      const response = await this.request<any>(
        'GET',
        `/users/${user.id}/tweets`,
        {
          max_results: limit.toString(),
          'tweet.fields': 'created_at,public_metrics,entities,referenced_tweets',
          expansions: 'attachments.media_keys,referenced_tweets.id',
          'media.fields': 'url,preview_image_url,type',
        },
        true
      );

      if (!response.data || !Array.isArray(response.data)) {
        return [];
      }

      return this.processTweets(response);
    } catch (error) {
      logger.error('Error fetching tweets:', error);
      return [];
    }
  }

  /**
   * Get a tweet by ID
   */
  async getTweet(id: string): Promise<XTweet | null> {
    try {
      const response = await this.request<any>(
        'GET',
        `/tweets/${id}`,
        {
          'tweet.fields': 'created_at,public_metrics,entities,referenced_tweets',
          expansions: 'attachments.media_keys,referenced_tweets.id,author_id',
          'media.fields': 'url,preview_image_url,type',
          'user.fields': 'username,name,profile_image_url',
        },
        true
      );

      if (!response.data) {
        return null;
      }

      const tweets = this.processTweets(response);
      return tweets.length > 0 ? tweets[0] : null;
    } catch (error) {
      logger.error('Error fetching tweet:', error);
      return null;
    }
  }

  /**
   * Search for tweets
   */
  async searchTweets(
    query: string,
    limit = 10,
    mode = SearchMode.Latest
  ): Promise<XTweet[]> {
    try {
      // Adjust query based on search mode
      let adjustedQuery = query;
      if (mode === SearchMode.Photos) {
        adjustedQuery += ' filter:images';
      } else if (mode === SearchMode.Videos) {
        adjustedQuery += ' filter:videos';
      } else if (mode === SearchMode.People) {
        // For people search, we'd need a different approach
        // This is a placeholder - the API doesn't directly support people search
        adjustedQuery += ' filter:verified'; // As a simple approximation
      }

      const endpoint = mode === SearchMode.Top ? '/tweets/search/recent' : '/tweets/search/recent';
      
      const response = await this.request<any>(
        'GET',
        endpoint,
        {
          query: adjustedQuery,
          max_results: limit.toString(),
          'tweet.fields': 'created_at,public_metrics,entities,referenced_tweets',
          expansions: 'attachments.media_keys,referenced_tweets.id,author_id',
          'media.fields': 'url,preview_image_url,type',
          'user.fields': 'username,name,profile_image_url',
        },
        true
      );

      if (!response.data || !Array.isArray(response.data)) {
        return [];
      }

      return this.processTweets(response);
    } catch (error) {
      logger.error('Error searching tweets:', error);
      return [];
    }
  }

  /**
   * Process tweets from API response
   */
  private processTweets(response: any): XTweet[] {
    const tweets: XTweet[] = [];
    const tweetData = Array.isArray(response.data) ? response.data : [response.data];
    
    // Create a map of media items
    const mediaMap = new Map();
    if (response.includes?.media) {
      response.includes.media.forEach((media: any) => {
        mediaMap.set(media.media_key, media);
      });
    }

    // Create a map of referenced tweets
    const refTweetMap = new Map();
    if (response.includes?.tweets) {
      response.includes.tweets.forEach((tweet: any) => {
        refTweetMap.set(tweet.id, tweet);
      });
    }

    // Create a map of users
    const userMap = new Map();
    if (response.includes?.users) {
      response.includes.users.forEach((user: any) => {
        userMap.set(user.id, user);
      });
    }

    for (const tweet of tweetData) {
      const user = userMap.get(tweet.author_id);
      const username = user ? user.username : 'unknown';
      const displayName = user ? user.name : 'Unknown User';
      const profileImageUrl = user ? user.profile_image_url : '';

      const mediaItems = [];
      if (tweet.attachments?.media_keys) {
        for (const mediaKey of tweet.attachments.media_keys) {
          const media = mediaMap.get(mediaKey);
          if (media) {
            mediaItems.push({
              type: media.type,
              url: media.url || media.preview_image_url,
            });
          }
        }
      }

      // Handle referenced tweets (like retweets, quotes)
      let retweetedStatus: ReferencedStatus | undefined = undefined;
      let quotedStatus: ReferencedStatus | undefined = undefined;
      let inReplyToStatusId: string | undefined = undefined;
      
      if (tweet.referenced_tweets) {
        for (const ref of tweet.referenced_tweets) {
          const refTweet = refTweetMap.get(ref.id);
          
          if (ref.type === 'retweeted' && refTweet) {
            retweetedStatus = {
              id: refTweet.id,
              text: refTweet.text,
              username: username, // This is an approximation
            };
          } else if (ref.type === 'quoted' && refTweet) {
            quotedStatus = {
              id: refTweet.id,
              text: refTweet.text,
              username: username, // This is an approximation
            };
          } else if (ref.type === 'replied_to') {
            inReplyToStatusId = ref.id;
          }
        }
      }

      tweets.push({
        id: tweet.id,
        text: tweet.text,
        username,
        displayName,
        profileImageUrl,
        createdAt: new Date(tweet.created_at),
        likeCount: tweet.public_metrics?.like_count || 0,
        retweetCount: tweet.public_metrics?.retweet_count || 0,
        replyCount: tweet.public_metrics?.reply_count || 0,
        media: mediaItems,
        retweetedStatus,
        quotedStatus,
        inReplyToStatusId,
      });
    }

    return tweets;
  }

  /**
   * Send a tweet
   */
  async sendTweet(
    text: string, 
    inReplyTo?: string,
    media?: MediaFile[]
  ): Promise<string | null> {    
    try {
      logger.info(`Preparing to send tweet: "${text.substring(0, 30)}${text.length > 30 ? '...' : ''}"`);
      
      let endpoint = '/tweets';
      let payload: any = { text };
      
      if (inReplyTo) {
        logger.debug(`Tweet will be a reply to: ${inReplyTo}`);
        payload.reply = { in_reply_to_tweet_id: inReplyTo };
      }

      // Handle media uploads if provided
      if (media && media.length > 0) {
        const mediaIds = [];
        
        logger.debug(`Uploading ${media.length} media files for tweet`);
        
        for (const file of media) {
          const mediaId = await this.uploadMedia(file);
          if (mediaId) {
            mediaIds.push(mediaId);
            logger.debug(`Media uploaded successfully, ID: ${mediaId}`);
          } else {
            logger.warn(`Failed to upload media file: ${file.filename || 'unnamed'}`);
          }
        }
        
        if (mediaIds.length > 0) {
          logger.debug(`Attaching ${mediaIds.length} media files to tweet`);
          payload.media = { media_ids: mediaIds };
        }
      }

      logger.debug(`Sending tweet to X API with payload: ${JSON.stringify(payload, null, 2)}`);
      
      // Log the authentication details (without secrets)
      logger.debug(`Using X API credentials - API Key: ${this.apiKey ? '✓' : '✗'}, Access Token: ${this.accessToken ? '✓' : '✗'}`);
      
      if (!this.accessToken || !this.accessSecret) {
        logger.warn('Missing X API access token or secret - required for posting tweets');
        logger.debug('Check your environment variables or configuration for X API tokens');
      }

      const response = await this.request<any>(
        'POST',
        endpoint,
        {},
        true,
        payload
      );
      
      logger.debug(`X API response received: ${JSON.stringify(response || 'null', null, 2)}`);
      
      if (response && response.data && response.data.id) {
        logger.success(`Tweet successfully posted with ID: ${response.data.id}`);
        return response.data.id;
      } else {
        // Check if we have any response data
        if (response) {
          logger.warn(`Received response but missing tweet ID. Response: ${JSON.stringify(response)}`);
          
          // Check for specific response patterns
          if (response.errors) {
            logger.error(`X API returned errors: ${JSON.stringify(response.errors)}`);
          }
        } else {
          logger.warn(`Empty response received from X API`);
        }
        return null;
      }
    } catch (error) {
      logger.error(`Error sending tweet:`, error);
      
      // More detailed error handling
      if (error instanceof Error) {
        logger.debug(`Error type: ${error.name}, Message: ${error.message}`);
        
        if (error.message.includes('401')) {
          logger.error('Authentication error - check your X API credentials');
          logger.debug('This is usually due to expired or invalid tokens, or incorrect API keys');
        } else if (error.message.includes('403')) {
          logger.error('Permission error - your app may not have write permissions');
          logger.debug('Check your X Developer Portal app settings and ensure Write permissions are enabled');
        } else if (error.message.includes('duplicate')) {
          logger.error('Duplicate tweet error - X does not allow posting identical tweets');
        } else if (error.message.includes('network')) {
          logger.error('Network error when contacting X API - check your internet connection');
        }
        
        if (error.stack) {
          logger.debug(`Error stack trace: ${error.stack}`);
        }
      }
      
      throw error;
    }
  }

  /**
   * Upload media to X
   */
  private async uploadMedia(file: MediaFile): Promise<string | null> {
    try {
      const form = new FormData();
      
      if (file.path) {
        // Read file from disk
        form.append('media', fs.createReadStream(file.path));
      } else if (file.buffer) {
        // Use buffer
        form.append('media', file.buffer, {
          filename: file.filename || 'media.jpg',
          contentType: file.contentType || 'image/jpeg',
        });
      } else {
        throw new Error('Either file path or buffer must be provided');
      }
      
      const response = await this.request<any>(
        'POST',
        '/media/upload',
        {},
        false,
        form
      );
      
      return response.media_id_string || null;
    } catch (error) {
      logger.error('Error uploading media:', error);
      return null;
    }
  }

  /**
   * Send a tweet with a poll
   */
  async sendTweetWithPoll(
    text: string,
    poll: {
      options: string[];
      durationMinutes: number;
    }
  ): Promise<string | null> {
    try {
      const endpoint = '/tweets';
      
      // Validate poll options
      if (!poll.options || poll.options.length < 2 || poll.options.length > 4) {
        throw new Error('Poll must have between 2 and 4 options');
      }
      
      // Validate duration (5 minutes to 7 days)
      const duration = Math.max(5, Math.min(poll.durationMinutes, 10080));
      
      const payload = {
        text,
        poll: {
          options: poll.options,
          duration_minutes: duration,
        },
      };
      
      const response = await this.request<any>(
        'POST',
        endpoint,
        {},
        true,
        payload
      );
      
      return response.data?.id || null;
    } catch (error) {
      logger.error('Error sending tweet with poll:', error);
      return null;
    }
  }

  /**
   * Retweet a tweet
   */
  async retweet(id: string): Promise<boolean> {
    try {
      const endpoint = '/retweets';
      const payload = { tweet_id: id };
      
      await this.request<any>(
        'POST',
        endpoint,
        {},
        true,
        payload
      );
      
      return true;
    } catch (error) {
      logger.error('Error retweeting:', error);
      return false;
    }
  }

  /**
   * Like a tweet
   */
  async likeTweet(id: string): Promise<boolean> {
    try {
      const endpoint = '/likes';
      const payload = { tweet_id: id };
      
      await this.request<any>(
        'POST',
        endpoint,
        {},
        true,
        payload
      );
      
      return true;
    } catch (error) {
      logger.error('Error liking tweet:', error);
      return false;
    }
  }

  async init(): Promise<boolean> {
    try {
      logger.info('Initializing X API client');
      
      if (!this.apiKey || !this.apiSecret) {
        logger.error('X API credentials missing: API key and API secret are required');
        return false;
      }
      
      logger.info('Verifying X API credentials...');
      
      // Log credential status without revealing sensitive information
      logger.debug(`Credential check - API Key: ${this.apiKey ? '✓' : '✗'}, API Secret: ${this.apiSecret ? '✓' : '✗'}`);
      logger.debug(`Credential check - Access Token: ${this.accessToken ? '✓' : '✗'}, Access Secret: ${this.accessSecret ? '✓' : '✗'}`);
      logger.debug(`Credential check - Client ID: ${this.clientId ? '✓' : '✗'}, Client Secret: ${this.clientSecret ? '✓' : '✗'}`);
      
      // Try to verify the credentials by making a simple request
      logger.debug('Attempting to verify credentials with test API call');
      
      if (this.accessToken && this.accessSecret) {
        try {
          // Try a simple authenticated request
          await this.request<any>(
            'GET',
            '/account/verify_credentials.json',
            {},
            false
          );
          logger.info('Successfully connected to X API with full permissions');
          return true;
        } catch (error) {
          if (error instanceof Error) {
            if (error.message.includes('401')) {
              logger.error('Authentication error: Invalid access token and/or access token secret');
              logger.debug('Please check your TWITTER_ACCESS_TOKEN and TWITTER_ACCESS_TOKEN_SECRET environment variables');
            } else if (error.message.includes('403')) {
              logger.error('Permission error: Your app may be missing required permissions');
              logger.debug('Check your X Developer Portal app settings - Read and Write permissions may be required');
            } else {
              logger.error(`Error verifying credentials: ${error.message}`);
            }
          } else {
            logger.error('Unknown error during credential verification');
          }
        }
      }
      
      // If we don't have user tokens, try to verify read-only access
      try {
        // Try a basic read-only request
        await this.request<any>(
          'GET',
          '/users/by/username/twitter',
          {},
          true
        );
        logger.info('Successfully connected to X API with read permissions');
        
        // Warn about limited access if we have no access tokens
        if (!this.accessToken || !this.accessSecret) {
          logger.warn('X API access is read-only - certain actions like posting tweets will fail');
          logger.debug('To enable full access, set TWITTER_ACCESS_TOKEN and TWITTER_ACCESS_TOKEN_SECRET environment variables');
        }
        
        return true;
      } catch (error) {
        if (error instanceof Error) {
          logger.error(`Error connecting to X API: ${error.message}`);
          
          if (error.message.includes('401') || error.message.includes('403')) {
            logger.error('Authentication or permissions issue - check your API credentials');
            logger.debug('Verify your app settings in the X Developer Portal are correct');
          } else {
            logger.debug(`Full error details: ${error.stack || error}`);
          }
        } else {
          logger.error('Unknown error connecting to X API');
        }
        return false;
      }
    } catch (error) {
      logger.error('Failed to initialize X API client:', error);
      return false;
    }
  }
} 