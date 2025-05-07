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
npm install @astreus-ai/x-plugin
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
import { createAgent } from 'astreus';
import XPlugin from '@astreus-ai/x-plugin';

// Create an X plugin instance
const xPlugin = new XPlugin();

// Initialize the plugin
await xPlugin.init();

// Create an agent with the X plugin
const agent = await createAgent({
  name: 'Social Media Agent',
  description: 'An agent that can interact with X',
  plugins: [xPlugin]
});

// Now the agent can use X functionality
const response = await agent.chat(`Find the latest tweets from Elon Musk and summarize them.`);
```

### Custom Configuration

```typescript
import { createAgent } from 'astreus';
import XPlugin from '@astreus-ai/x-plugin';

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
const agent = await createAgent({
  name: 'Social Media Agent',
  description: 'An agent that can interact with X',
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

## 🤝 Contributing

Contributions are welcome! Please feel free to submit a Pull Request.

1. Fork the repository
2. Create your feature branch (`git checkout -b feature/amazing-feature`)
3. Commit your changes (`git commit -m 'Add some amazing feature'`)
4. Push to the branch (`git push origin feature/amazing-feature`)
5. Open a Pull Request

## 📄 License

This project is licensed under the MIT License - see the [LICENSE](LICENSE) file for details.

## 📬 Contact

Astreus Team - [https://astreus.org](https://astreus.org)

Project Link: [https://github.com/astreus-ai/astreus-x-plugin](https://github.com/astreus-ai/astreus-x-plugin) 