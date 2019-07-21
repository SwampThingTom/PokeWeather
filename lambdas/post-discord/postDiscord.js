'use strict';

const AWS = require('aws-sdk');
const uuid = require('uuid');
const documentClient = new AWS.DynamoDB.DocumentClient();

const discordService = new AWS.Service({

    endpoint: 'https://discordapp.com/api',
    convertResponseTypes: false,

    apiConfig: {
        metadata: {
            protocol: 'rest-json'
        },
        operations: {
            PostForecast: {
                http: {
                    method: 'POST',
                    requestUri: '/webhooks/{webhookID}/{token}'
                },
                input: {
                    type: 'structure',
                    required: [ 'webhookID', 'token', 'data' ],
                    payload: 'data',
                    members: {
                        'webhookID': {
                            location: 'uri',
                            locationName: 'webhookID',
                            sensitive: true
                        },
                        'token': {
                            location: 'uri',
                            locationName: 'token',
                            sensitive: true
                        },
                        'data': {
                            type: 'structure',
                            required: [ 'username', 'content' ],
                            members: {
                                'username': {},
                                'content': {}
                            }
                        }
                    }
                },
            },
        },
    }
});

discordService.isGlobalEndpoint = true;

const locations = {
    '2110989': {
        locationName: 'Herndon (Floris)',
        locationLink: 'https://s2.sidewalklabs.com/regioncoverer/?center=38.929707%2C-77.423269&zoom=13&cells=89b647',
    },
    '341249': {
        locationName: 'Reston (RTC)',
        locationLink: 'https://s2.sidewalklabs.com/regioncoverer/?center=38.918489%2C-77.354433&zoom=13&cells=89b649',
    },
};

const pogoWeatherIcons = {
    "Clear":         "☀",
    "Rain":          "☂",
    "Partly Cloudy": "⛅",
    "Cloudy":        "☁",
    "Windy":         "🎐",
    "Snow":          "☃",
    "Fog":           "🌫",
    "Unknown":       "?",
};

const weatherMap = {
     1: { text: "Clear",         windyable: true },
     2: { text: "Clear",         windyable: true },
     3: { text: "Partly Cloudy", windyable: true },
     4: { text: "Partly Cloudy", windyable: true },
     5: { text: "Cloudy",        windyable: true },
     6: { text: "Cloudy",        windyable: true },
     7: { text: "Cloudy",        windyable: true },
     8: { text: "Cloudy",        windyable: true },
    11: { text: "Fog",           windyable: false },
    12: { text: "Rain",          windyable: false },
    13: { text: "Cloudy",        windyable: true },
    14: { text: "Partly Cloudy", windyable: true },
    15: { text: "Rain",          windyable: false },
    16: { text: "Cloudy",        windyable: true },
    17: { text: "Partly Cloudy", windyable: true },
    18: { text: "Rain",          windyable: false },
    19: { text: "Snow",          windyable: false },
    20: { text: "Cloudy",        windyable: true },
    21: { text: "Partly Cloudy", windyable: true },
    22: { text: "Snow",          windyable: false },
    23: { text: "Cloudy",        windyable: true },
    24: { text: "Snow",          windyable: false },
    25: { text: "Rain",          windyable: false },
    26: { text: "Rain",          windyable: false },
    29: { text: "Snow",          windyable: false },
    32: { text: "Windy",         windyable: false },
    33: { text: "Clear",         windyable: true },
    34: { text: "Clear",         windyable: true },
    35: { text: "Partly Cloudy", windyable: true },
    36: { text: "Partly Cloudy", windyable: true },
    37: { text: "Cloudy",        windyable: true },
    38: { text: "Cloudy",        windyable: true },
    39: { text: "Partly Cloudy", windyable: true },
    40: { text: "Cloudy",        windyable: true },
    41: { text: "Partly Cloudy", windyable: true },
    42: { text: "Cloudy",        windyable: true },
    43: { text: "Cloudy",        windyable: true },
    44: { text: "Cloudy",        windyable: true },
};

const thresholds = {
  windSpeed: 20,
  windGust: 29.5
};

function pogoWeather(accuWeather) {
    const pogoWeather = weatherMap[accuWeather.weatherIcon];
    if (!pogoWeather) {
        return "Unknown";
    }
    const windy = accuWeather.windSpeed > thresholds.windSpeed && accuWeather.windGust > thresholds.windGust;
    if (pogoWeather.windyable && windy) {
        return "Windy";
    }
    return pogoWeather.text;
}

function itemKey(locationID, requestTime) {
    const requestDateHour = requestTime.slice(0,13);
    return `${locationID}-${requestDateHour}`;
}

function getForecast(table, locationID, requestTime, callback) {
    const location = locations[locationID];
    console.log('Requesting forecast for: ' + location.locationName + '\n' + requestTime);
    const params = {
      TableName: table,
      KeyConditionExpression: 'locationRequestTime = :locationRequestTime',
      ExpressionAttributeValues: { ':locationRequestTime': itemKey(locationID, requestTime) }
    };
    documentClient.query(params, function(err, data) {
        if (err) {
            console.error('Error getting forecast:', err);
            return;
        }
        if (data.LastEvaluatedKey) {
            console.log('LastEvaluatedKey present. Not all data was returned.')
        }
        const forecast = data.Items;
        if (forecast.length == 0) {
            console.error('No items in forecast');
            return;
        }
        forecast.sort((a, b) => {
            const dateA = new Date(a.dateTime);
            const dateB = new Date(b.dateTime);
            if (dateA < dateB) return -1;
            if (dateA > dateB) return 1;
            return 0;
        });
        console.log(forecast);
        const fetchTime = forecast[0].requestTime;
        const pogoForecast = forecast.slice(0,8).map(accuWeather => {
            return {
                hour: accuWeather.forecastHour,
                weather: pogoWeather(accuWeather)
            };
        });
        callback(location, fetchTime, pogoForecast);
	});
}

function postToDiscord(message) {
    discordService.postForecast({
        webhookID: process.env.WEBHOOK_ID,
        token: process.env.WEBHOOK_TOKEN,
        data: {
            'username': 'PogoWeather',
            'content': message,
        }
    }, (err, data) => {
        if (err) {
            console.error('Error posting to discord:', err);
            return;
        }
        console.log('Successfully posted to discord');
    });
}

function weatherForecastText(location, requestTime, pogoForecast) {
    const header = 'Weather forecast for ' + formattedLocation(location) + '\n';
    const forecastTime = formattedRequestTime(requestTime) + '\n';
    const forecastText1 = forecastText(pogoForecast.slice(0,4)) + '\n';
    const forecastText2 = forecastText(pogoForecast.slice(4)) + '\n';
    return header + forecastTime + forecastText1 + forecastText2;
}

function formattedLocation(location) {
    if (!location.locationLink) {
        return location.locationName;
    }
    return "[" + location.locationName + "](<" + location.locationLink + ">)";
}

function formattedRequestTime(requestTime) {
    return new Date(requestTime).toLocaleString() + " UTC";
}

function forecastText(forecast) {
    return forecast.reduce((forecastText, hour) => {
        const icon = pogoWeatherIcons[hour.weather];
        const hourForecastText = hour.hour + ':\u200B' + icon + '  ';
        return forecastText + hourForecastText;
    }, '').trim();
}

exports.handler = () => {
    const dbTable = process.env.DB_TABLE_NAME;
    const requestTime = new Date().toISOString().slice(0,13);
    //const requestTime = '2019-03-04T08';

    Object.keys(locations).forEach(locationID => {
        getForecast(dbTable, locationID, requestTime, (location, fetchTime, pogoForecast) => {
            const message = weatherForecastText(location, fetchTime, pogoForecast);
            console.log(message);
            postToDiscord(message);
        });
    });
};
