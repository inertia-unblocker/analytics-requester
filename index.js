const express = require('express'),
	bodyParser = require('body-parser'),
	cors = require('cors'),
	fetch = require('node-fetch'),
	timezones = require('./timezones.json'),
	app = express(),
	PORT = 5000,
	umamiUsername = process.env.UMAMI_USERNAME || 'TheAlphaReturns',
	umamiPassword = process.env.UMAMI_PASSWORD,
	umamiUrl = process.env.UMAMI_URL || 'https://inertia-analytics.vercel.app';

app.use(cors());
app.use(bodyParser.urlencoded({ extended: false }));
app.use(bodyParser.json());

function getUnixTime(dateObject) {
	return Math.floor(dateObject.getTime());
}

function convert(unixTime, tz) {
	let hr = 3600000;
	let min = 60000;
	let offset = timezones.filter(timezone => timezone.abbr == tz)[0].offset;

	let hroffset = Math.floor(offset * hr);
	let minoffset = 0;

	if (offset.toString().endsWith('.5')) {
		minoffset = min * 30;
	}

	if (offset.toString().endsWith('.75') /* **cough** NEPAL **cough** */) {
		minoffset = min * 45;
	}

	let returnTime = (unixTime-hroffset)-minoffset;
	return returnTime;
}

function from24to12(hmsString) {
	[h, m, s] = hmsString.split(':');
	h = parseInt(h);
	m = parseInt(m);
	s = parseInt(s);
	let ap = '';

	if (h > 12) {
		h -= 12;
		ap = 'PM';
	} else if (h < 12) {
		ap = 'AM';
	} else {
		ap = 'PM';
	}
	
	h = h.toString();
	m = m.toString();
	s = s.toString();

	m = m.length == 1 ? '0' + m : m;
	s = s.length == 1 ? '0' + s : s;

	return `${h}:${m} ${ap}`;
}

function convertSec(sec) {
	let wk = 0;
	let day = 0;
	let hr = 0;
	let min = 0;

	while (sec >= 60) {
		min += 1;
		sec -= 60;
	}

	while (min >= 60) {
		hr++;
		min -= 60;
	}

	while (hr >= 24) {
		day++;
		hr -= 24;
	}

	while (day >= 7) {
		wk++;
		day -= 7;
	}

	wkstr = wk ? `${wk}w, ` : '';
	daystr = day ? `${day}d, ` : '';
	hrstr = hr ? `${hr}` : '00';
	minstr = min ? `${min}` : '00';
	secstr = sec ? `${sec}` : '00';

	hrstr  = hrstr.length  == 1 ? '0' + hrstr : hrstr;
	minstr = minstr.length == 1 ? '0' + minstr : minstr;
	secstr = secstr.length == 1 ? '0' + secstr : secstr;

	return `${wkstr}${daystr}${hrstr}h ${minstr}m ${secstr}s`;
}



app.options('/getData', cors());
app.get('/getData', async (req, res) => {
	try {
		let tz = req.query.tz;

		const request = (url, params = {}, headers, method = 'GET') => {
			let options = {
				method,
				headers,
			};
			
			if (method == 'GET') {
				url += '?' + (new URLSearchParams(params)).toString();
			} else if (method == 'POST') {
				options.body = JSON.stringify(params);
			}
			
			return fetch(url, options).then(response => response.json());
		};
		
		const get = (url, params, headers) => request(url, params, headers, 'GET');
		const post = (url, params, headers) => request(url, params, headers, 'POST');

		const now = new Date();
		
		let jsonres_token = await post(`${umamiUrl}/api/auth/login`, { username: umamiUsername, password: umamiPassword });
		const token = jsonres_token.token;

		let headers = {
			'Authorization': `Bearer ${token}`
		};

		let jsonres_websites = await get(`${umamiUrl}/api/websites`, {}, headers);
		let website_id = jsonres_websites.filter(website => website.name.toLowerCase() === 'inertia')[0].website_id;

		thismorning = getUnixTime(new Date(now.toISOString().substring(10, 0)));

		let stats = await get(`${umamiUrl}/api/website/${website_id}/stats`, { start_at: convert(thismorning, tz), end_at: convert(getUnixTime(now), tz) }, headers);
		let pageviews = await get(`${umamiUrl}/api/website/${website_id}/pageviews`, { start_at: convert(thismorning, tz), end_at: convert(getUnixTime(now), tz), unit: 'hour', tz: 'America/New_York' }, headers);









		// ======= FORMATTING ======= //
		let data = { stats, pageviews };
		let rows_hourly = [];
		for (let i=0; i<data.pageviews.sessions.length; i++) {
			let arrayDate = from24to12(data.pageviews.sessions[i].t.split(' ')[1]);
			let arrayValue = data.pageviews.sessions[i].y;
	
			rows_hourly.push({
				key: `${i+1}`,
				time: `${arrayDate}`,
				value: arrayValue,
			});
		}

		let totaltime = convertSec(parseInt(data.stats.totaltime.value));

		let finalData = {
			columns_daily: [
				{
					key: 'name',
					label: 'Today',
				},
				{
					key: 'value',
					label: '',
				}
			],
			rows_daily: [
				{
					key: '1',
					name: 'Bounces',
					value: data.stats.bounces.value,
				},
				{
					key: '2',
					name: 'Pageviews',
					value: data.stats.pageviews.value,
				},
				{
					key: '3',
					name: 'Total Time',
					value: totaltime,
				},
				{
					key: '4',
					name: 'Visitors',
					value: data.stats.uniques.value,
				}
			],
			columns_hourly: [
				{
					key: 'time',
					label: 'Hourly',
				},
				{
					key: 'value',
					label: '',
				}
			],
			rows_hourly,
		};

		res.status(200).json(finalData);
	} catch (err) {
		console.log(err);
		res.status(500).json({ error: err.message });
	}
});

app.get('/', (req, res) => {
	res.redirect('/getData');
});

app.listen(PORT, () => {
	console.log(`Server is running on port ${PORT}`);
});