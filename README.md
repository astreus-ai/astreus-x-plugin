# Astreus X Plugin

An X (formerly Twitter) integration plugin for the Astreus AI agent framework, allowing agents to interact with X.

## Features

- **Official X API Integration**: Uses the official X API v2
- **Comprehensive X Integration**: Access profiles, tweets, search, post tweets, and more
- **Poll Support**: Create polls on X
- **Rich Media Support**: Post tweets with images and videos
- **Enhanced Logging**: Detailed logging of API requests and responses for improved debugging
- **Integration with Astreus Logger**: Consistent logging patterns with the core framework

## Installation

```bash
npm install astreus-x-plugin
```

## Configuration

Create a `.env` file with your X API credentials:

```env
# X API v2 credentials
X_API_KEY=your_api_key
X_API_SECRET_KEY=your_api_secret
X_ACCESS_TOKEN=your_access_token
X_ACCESS_TOKEN_SECRET=your_access_token_secret

# Configuration options
CACHE_TWEET_SECONDS=300  # Cache tweets for 5 minutes
CACHE_PROFILE_SECONDS=3600  # Cache profiles for 1 hour

# Logging options
LOG_LEVEL=info  # Options: error, warn, info, debug
```

## Usage

### Basic Usage

```typescript
import { Agent } from 'astreus';
import XPlugin from 'astreus-x-plugin';

// Create an X plugin instance
const xPlugin = new XPlugin();

// Initialize the plugin
await xPlugin.init();

// Create an agent with the X plugin
const agent = new Agent({
  plugins: [xPlugin]
});

// Now the agent can use X functionality
const result = await agent.run(`
  Find the latest tweets from Elon Musk and summarize them.
`);
```

### Custom Configuration

```typescript
import { Agent } from 'astreus';
import XPlugin from 'astreus-x-plugin';

// Create a plugin with custom configuration
const xPlugin = new XPlugin({
  apiKey: 'your_api_key',
  apiSecret: 'your_api_secret',
  accessToken: 'your_access_token',
  accessSecret: 'your_access_token_secret',
  cacheTweetSeconds: 600,
  logLevel: 'debug'  // Set logging verbosity
});

// Initialize the plugin
await xPlugin.init();

// Create an agent with the plugin
const agent = new Agent({
  plugins: [xPlugin]
});
```

## Available Tools

The X plugin provides the following tools to Astreus agents:

- `x_get_profile`: Get an X user profile by username
- `x_get_tweets`: Get recent tweets from an X user
- `x_get_tweet`: Get a specific tweet by ID
- `x_search_tweets`: Search for tweets using a query
- `x_send_tweet`: Send a new tweet
- `x_send_tweet_with_poll`: Send a tweet with a poll
- `x_retweet`: Retweet a tweet
- `x_like_tweet`: Like a tweet
- `x_get_trends`: Get current X trends

## Debugging

The plugin includes detailed logging of API requests and responses, which is useful for troubleshooting issues. You can adjust the logging level using the `LOG_LEVEL` environment variable or by setting the `logLevel` option when creating the plugin instance.

## Contributing

Contributions are welcome! Please feel free to submit a Pull Request.

## License

MIT 