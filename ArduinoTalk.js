var config = require('./config.js'),
	optimist = require('optimist'),
	Arduino = require('arduino'),
	ArduinoPort = optimist.argv.port,
	xmpp = require('node-xmpp'),
	gtalk = new xmpp.Client({
		jid         : config.BOT_GTALK_ID,
		password    : config.BOT_GTALK_PASSWORD,
		host        : 'talk.google.com',
		port        : 5222
	}),
	Imap = new require('imap')({
		user: config.EMAIL_USER,
		password: config.EMAIL_PASSWORD,
		host: config.EMAIL_HOST,
		port: 993,
		secure: true
	}),
	Sigar = require('./node_modules/sigar/build/Release/sigar').init(),
	cpu = {
		prev : Sigar.cpu(),
		avg : [],
		index : 0,
		sum : 0,
		usedAvg : null,
		used : 0
	},
	mem = {
		avg : [],
		index : 0,
		sum : 0,
		usedAvg : null,
		used : 0
	},
	fbNotifications = {
		last : null,
		count : null
	},
	emailNotificationsCount = null,
	FUNC_DIGITALREAD = 1,
	FUNC_DIGITALWRITE = 2,
	FUNC_ANALOGREAD = 3,
	FUNC_STATS = 4,
	FUNC_NOTIFICATIONS = 5,
	FUNC_HARDWARETEST = 6;

/* Some lib... */
function addZero(str) {
	str = str + '';
	if(str.length < 2) str = '0' + str;
	return str;
}

function getRequestTime(formatted) {
	var d = new Date();
	
	if(formatted) {
		var m = new Array("Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec");
		return d.getDate() + '/' + m[d.getMonth()] + '/' + d.getFullYear() + ' ' + addZero(d.getHours()) + ':' + addZero(d.getMinutes()) + ':' + addZero(d.getSeconds());
	} else {
		return Math.round(d.getTime() / 1000);
	}
}

function formatTime(time) {
    var hours = Math.floor(time / 3600),
        minutes = Math.floor((time % 3600) / 60);

    return (hours > 0 ? hours + ':' + addZero(minutes) : minutes) + ":" + addZero(Math.round(time % 60));
}

function log(msg) {
	console.log('[' + getRequestTime(true) + '] ' + msg);
}

function message(jid, text) {
	gtalk.send(new xmpp.Element('message', {
		to: jid,
		type: 'chat'
   	}).
	c('body').
	t('\n' + text));
}
/* Lib end */

setInterval(function() {
	var prev = cpu.prev,
		curr = Sigar.cpu(),
		diff_user = curr.user - prev.user,
		diff_sys  = curr.sys  - prev.sys,
		diff_nice = curr.nice - prev.nice,
		diff_idle = curr.idle - prev.idle,
		diff_wait = curr.wait - prev.wait,
		diff_irq = curr.irq - prev.irq,
		diff_soft_irq = curr.soft_irq - prev.soft_irq,
		diff_stolen = curr.stolen - prev.stolen;

	diff_user = diff_user < 0 ? 0 : diff_user;
	diff_sys  = diff_sys  < 0 ? 0 : diff_sys;
	diff_nice = diff_nice < 0 ? 0 : diff_nice;
	diff_idle = diff_idle < 0 ? 0 : diff_idle;
	diff_wait = diff_wait < 0 ? 0 : diff_wait;
	diff_irq = diff_irq < 0 ? 0 : diff_irq;
	diff_soft_irq = diff_soft_irq < 0 ? 0 : diff_soft_irq;
	diff_stolen = diff_stolen < 0 ? 0 : diff_stolen;

	var diff_total = diff_user + diff_sys + diff_nice + diff_idle + diff_wait + diff_irq + diff_soft_irq + diff_stolen,
		perc = {
			user: diff_user / diff_total,
			sys: diff_sys / diff_total,
			nice: diff_nice / diff_total,
			idle: diff_idle / diff_total,
			wait: diff_wait / diff_total,
			irq: diff_irq / diff_total,
			soft_irq: diff_soft_irq / diff_total,
			stolen: diff_stolen / diff_total
		};

	perc.combined = perc.user + perc.sys + perc.nice + perc.wait;
	cpu.prev = curr;

	var readings = 60;

	cpu.used = perc.combined * 100;
	cpu.usedAvg === null && (cpu.sum = cpu.used * readings);

	cpu.sum -= cpu.avg[cpu.index] || 0;
	cpu.avg[cpu.index] = cpu.used;
	cpu.sum += cpu.avg[cpu.index];
	cpu.index++;
	cpu.index >= readings && (cpu.index = 0);
	cpu.usedAvg = Math.round(cpu.sum / readings);

	mem.used = Sigar.mem().used_percent;
	mem.usedAvg === null && (mem.sum = mem.used * readings);

	mem.sum -= mem.avg[mem.index] || 0;
	mem.avg[mem.index] = mem.used;
	mem.sum += mem.avg[mem.index];
	mem.index++;
	mem.index >= readings && (mem.index = 0);
	mem.usedAvg = Math.round(mem.sum / readings);
}, 1000);

function sendStats(device) {
	Arduino.req(device, FUNC_STATS, new Buffer([cpu.used, mem.used]));
}

function sendNotifications(device) {
	Arduino.req(device, FUNC_NOTIFICATIONS, new Buffer([fbNotifications.count, emailNotificationsCount]));
}

function getFBNotifications() {
	require('https').get({
	    host: 'www.facebook.com',
	    headers: {'user-agent': 'Mozilla/5.0'},
	    path: "/feeds/notifications.php?id=" + config.FB_ID + "&viewer=" + config.FB_ID + "&key=" + config.FB_RSS_KEY + "&format=json"
	}, function(res) {
		var data = '';
		res.setEncoding('utf8');
		res.on('data', function(chunk) {
			data += chunk;
		});
		res.on('end', function() {
			try {
				data = JSON.parse(data).entries;
			} catch (e) { }
			var count = 0;
			if(fbNotifications.last === null) fbNotifications.last = data[0].id;
			else {
				for(var i in data) {
					if(data[i].id == fbNotifications.last) break;
					count++;
				}
			}
			if(count !== fbNotifications.count) {
				log("FB notifications updated");
				fbNotifications.count = count;
				sendNotifications(255);
			}
		});
	});
}

function getNewEmails() {
	Imap.connect(function(err) {
		Imap.openBox('INBOX', true, function(err, mailbox) {
			Imap.search(['UNSEEN', ['SINCE', (new Date().getTime()) - (3600000 * 24 * 7)]], function(err, results) {
				Imap.logout();
				if(results.length !== emailNotificationsCount) {
					log("Email notifications updated");
					emailNotificationsCount = results.length;
					sendNotifications(255);
				}
			});
		});
	});
}

log("Connecting to GTalk...");
gtalk.on('online', function() {
	gtalk.send(new xmpp.Element('presence', { }).
		c('show').t('chat').up()/*.
		c('status').t('')*/
	);

	Arduino.on('req', function(device, func, data) {
		switch(func) {
			case FUNC_NOTIFICATIONS:
				sendNotifications(device);
			break;
			case FUNC_STATS:
				sendStats(device);
		}
	});

	Arduino.on('error', function(err) {
		log(err);
		//if((err + '').substr(0, 18) === 'Error: Cannot open') process.exit();
	});

	log("Connecting to the Arduino...");
	Arduino.connect(ArduinoPort, function() {
		log("Server gracefully started");
		
		getFBNotifications();
		getNewEmails();

		setInterval(function() {
			getFBNotifications();
			getNewEmails();
		}, 60000);

		/*setInterval(function() {
			sendStats(255);
		}, 1000);*/
	});
});

gtalk.on('stanza', function(stanza) {
	if(stanza.is('message') && stanza.attrs.type !== 'error' && stanza.attrs.id) { //get only text messages
		var jid = stanza.attrs.from;
		stanza.children[0].children.forEach(function(m) {
			if(m === '\n') return;
			var argv = optimist.parse(m.split(' '));
			switch((argv._[0] + '').toLowerCase()) {
				case 'dr':
				case 'digitalread':
					Arduino.req(argv.device || 255, FUNC_DIGITALREAD, new Buffer([parseInt(argv._[1], 10)]), function(data) {
						message(jid, 'digitalRead(' + argv._[1] + '): ' + (data[0] ? 'HIGH' : 'LOW'));
					});
				break;
				case 'dw':
				case 'digitalwrite':
					Arduino.req(argv.device || 255, FUNC_DIGITALWRITE, new Buffer([parseInt(argv._[1], 10), ['1', 'high', 'true'].indexOf((argv._[2] + '').toLowerCase()) !== -1 ? 1 : 0]));
				break;
				case 'ar':
				case 'analogread':
					Arduino.req(argv.device || 255, FUNC_ANALOGREAD, new Buffer([parseInt(argv._[1], 10)]), function(data) {
						message(jid, 'analogRead(A' + argv._[1] + '): ' + (data[0] + (data[1] << 8)));
					});
				break;
				case 'hardwaretest':
					Arduino.req(argv.device || 255, FUNC_HARDWARETEST);
				break;
				case 'n':
				case 'notifications':
					message(jid, "FB Notifications: " + fbNotifications.count +
						"\nEmail Notifications: " + emailNotificationsCount);
				break;
				case 's':
				case 'stats':
					message(jid, "The cpu is at: " + cpu.usedAvg + '%' +
						"\nThe ram is at: " + mem.usedAvg + '%' +
						"\nSystem uptime: " + formatTime(Sigar.uptime()));
				break;
				default:
					message(jid, 'I don\'t get what you\'re saying...');
			}
		});
	}
});
