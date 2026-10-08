process.env.NTBA_FIX_319 = 1;
const TelegramBot = require('node-telegram-bot-api');

const logSystem = 'telegram';
require('./exceptionWriter.js')(logSystem);

exports.sendMessage = function (chatId, messageText) {
	if (!messageText) {
		log('warn', logSystem, 'No text to send.');
		return;
	}

	if (!config.telegram) {
		log('error', logSystem, 'Telegram is not configured!');
		return;
	}

	if (!config.telegram.enabled) return;

	const token = config.telegram.token || '';
	if (!token || token === '') {
		log('error', logSystem, 'No telegram token specified in configuration!');
		return;
	}

	if (!chatId || chatId === '' || chatId === '@') {
		log('error', logSystem, 'No telegram chat id specified!');
		return;
	}

	const bot = new TelegramBot(token);
	bot.sendMessage(chatId, messageText, {
			parse_mode: 'Markdown'
		})
		.then(() => {
			log('info', logSystem, 'Telegram message sent to %s: %s', [chatId, messageText]);
		}, error => {
			log('error', logSystem, 'Telegram request failed: %s', [error.code]);
			if (error.code === 'EFATAL') {
				log('error', logSystem, 'Telegram request failed: communication error (no data)');
			} else {
				log('error', logSystem, 'Telegram API error: [%s] %s', [error.response.body.error_code, error.response.body.description]);
			}
		});
}
