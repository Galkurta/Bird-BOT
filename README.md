# BirdTON Bot

An automated bot for playing BirdTON game on Telegram. This bot helps automate the gameplay process while handling boost upgrades and energy management efficiently.

## Features

- Automated gameplay
- Energy management
- Automatic boost upgrades
- Balance tracking
- Multi-account support
- Progress monitoring
- Session time estimation

## Prerequisites

Before running the bot, make sure you have the following installed:

- Node.js (version 16 or higher)
- npm (Node Package Manager)

## Installation

1. Clone this repository:

```bash
git clone https://github.com/yourusername/Bird-BOT.git
cd Bird-BOT
```

2. Install dependencies:

```bash
npm install
```

## Registration

1. Register [BirdTON](https://t.me/BIRDTonBot/app?startapp=6944804952)

2. After registration, copy your initialization data (you'll see this in the Telegram web app URL after you start the game).

3. Edit `data.txt` file in the project root and paste your initialization data. You can add multiple accounts by putting each initialization data on a new line.

## Configuration

The bot comes with default configurations, but you can modify them in the `config` folder:

- `logger.js`: Logging configuration
- `banner.js`: Application banner settings

## Usage

Start the bot:

```bash
node main.js
```

The bot will:

1. Process all accounts in `data.txt`
2. Automatically handle boost upgrades
3. Play games when maximum boost is reached
4. Show progress with formatted balance (K/M/B)
5. Wait for 1 hour before starting the next cycle

## Key Features Explained

### Balance Display

- Uses K for thousands (e.g., 1.5K)
- Uses M for millions (e.g., 2.5M)
- Uses B for billions (e.g., 1.2B)

### Game Session

- Shows estimated completion time
- Displays actual session duration
- Tracks remaining energy

### Boost System

- Automatically upgrades boosts when possible
- Stops at maximum level (49)
- Shows required coins for upgrades

## Logging

The bot uses Winston logger with the following levels:

- INFO: General progress information
- WARN: Non-critical warnings
- ERROR: Error messages

## Contributing

Feel free to:

- Report bugs
- Suggest improvements
- Submit pull requests

## Disclaimer

This bot is for educational purposes only. Use at your own risk and be aware of Telegram's terms of service.

## License

MIT License - feel free to use and modify as needed.

## Support

If you need help or want to report issues, you can:

1. Open an issue on GitHub
2. Contact the maintainer
3. Join our Telegram support group

## Acknowledgments

Thanks to:

- Telegram for their gaming platform
- BirdTON game developers
- Open source community

Remember to always follow Telegram's terms of service and the game's rules while using this bot.
