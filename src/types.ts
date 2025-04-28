/**
 * Type definitions for the X (formerly Twitter) plugin
 */

// X Plugin Configuration
export interface XConfig {
  // API v2 credentials
  apiKey?: string;
  apiSecret?: string;
  accessToken?: string;
  accessSecret?: string;
  clientId?: string;
  clientSecret?: string;
  
  // Advanced options
  cacheTweetSeconds?: number; // Cache tweets for N seconds
  cacheProfileSeconds?: number; // Cache profile data for N seconds
}

// X Profile
export interface XProfile {
  id: string;
  username: string;
  displayName: string;
  bio?: string;
  verified: boolean;
  profileImageUrl?: string;
  followersCount: number;
  followingCount: number;
  tweetCount: number;
  createdAt: Date;
  location?: string;
  url?: string;
}

// Tweet Media
export interface XMedia {
  type: string;
  url: string;
}

// Referenced Status
export interface ReferencedStatus {
  id: string;
  text: string;
  username: string;
}

// X Tweet
export interface XTweet {
  id: string;
  text: string;
  username: string;
  displayName?: string;
  profileImageUrl?: string;
  createdAt: Date;
  likeCount: number;
  retweetCount: number;
  replyCount: number;
  media?: XMedia[];
  retweetedStatus?: ReferencedStatus;
  quotedStatus?: ReferencedStatus;
  inReplyToStatusId?: string;
}

// Search Mode
export enum SearchMode {
  Top = 'top',
  Latest = 'latest',
  People = 'people',
  Photos = 'photos',
  Videos = 'videos'
}

// Media File for Uploading
export interface MediaFile {
  path?: string;
  buffer?: Buffer;
  filename?: string;
  contentType?: string;
}

// Grok Message
export interface GrokMessage {
  role: 'user' | 'assistant';
  content: string;
}

// Grok Chat Options
export interface GrokChatOptions {
  messages: GrokMessage[];
  conversationId?: string;
  returnSearchResults?: boolean;
  returnCitations?: boolean;
}

// Grok Rate Limit
export interface GrokRateLimit {
  isRateLimited: boolean;
  message?: string;
  upsellInfo?: any;
}

// Grok Chat Response
export interface GrokChatResponse {
  conversationId: string;
  message: string;
  messages: GrokMessage[];
  webResults?: any[];
  metadata?: any;
  rateLimit?: GrokRateLimit;
} 