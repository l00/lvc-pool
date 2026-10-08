let nodemailer = require('nodemailer');
let mailgun = require('mailgun.js');

let logSystem = 'email';
require('./exceptionWriter.js')(logSystem);

exports.sendEmail = function (email, subject, content) {
	if (!email) {
		log('warn', logSystem, 'Unable to send e-mail: no destination email.');
		return;
	}

	if (!config.email) {
		log('error', logSystem, 'Email system not configured!');
		return;
	}

	if (!config.email.enabled) return;

	let messageData = {
		from: config.email.fromAddress,
		to: email,
		subject: subject,
		text: content
	};

	let transportMode = config.email.transport;
	let transportCfg = config.email[transportMode] ? config.email[transportMode] : {};

	if (transportMode === "mailgun") {
		let mg = mailgun.client({
			username: 'api',
			key: transportCfg.key
		});
		mg.messages.create(transportCfg.domain, messageData)
			.then(() => {
				log('info', logSystem, 'E-mail sent to %s: %s', [messageData.to, messageData.subject]);
			})
			.catch(error => {
				log('error', logSystem, 'Unable to send e-mail to %s: %s', [messageData.to, JSON.stringify(error)]);
			});
	} else {
		transportCfg['transport'] = transportMode;
		let transporter = nodemailer.createTransport(transportCfg);
		transporter.sendMail(messageData, function (error) {
			if (error) {
				log('error', logSystem, 'Unable to send e-mail to %s: %s', [messageData.to, error.toString()]);
			} else {
				log('info', logSystem, 'E-mail sent to %s: %s', [email, subject]);
			}
		});
	}
};
