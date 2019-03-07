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
     1: { text: "Clear",         wind: true },
     2: { text: "Clear",         wind: true },
     3: { text: "Partly Cloudy", wind: true },
     4: { text: "Partly Cloudy", wind: true },
     5: { text: "Cloudy",        wind: true },
     6: { text: "Cloudy",        wind: true },
     7: { text: "Cloudy",        wind: true },
     8: { text: "Cloudy",        wind: true },
    11: { text: "Fog",           wind: false },
    12: { text: "Rain",          wind: false },
    13: { text: "Cloudy",        wind: false },
    14: { text: "Partly Cloudy", wind: false },
    15: { text: "Rain",          wind: false },
    16: { text: "Cloudy",        wind: false },
    17: { text: "Partly Cloudy", wind: false },
    18: { text: "Rain",          wind: false },
    19: { text: "Snow",          wind: false },
    20: { text: "Cloudy",        wind: false },
    21: { text: "Partly Cloudy", wind: false },
    22: { text: "Snow",          wind: false },
    23: { text: "Cloudy",        wind: false },
    24: { text: "Snow",          wind: false },
    25: { text: "Rain",          wind: false },
    26: { text: "Rain",          wind: false },
    29: { text: "Snow",          wind: false },
    32: { text: "Windy",         wind: false },
    33: { text: "Clear",         wind: true },
    34: { text: "Clear",         wind: true },
    35: { text: "Partly Cloudy", wind: true },
    36: { text: "Partly Cloudy", wind: true },
    37: { text: "Cloudy",        wind: true },
    38: { text: "Cloudy",        wind: true },
    39: { text: "Partly Cloudy", wind: false },
    40: { text: "Cloudy",        wind: false },
    41: { text: "Partly Cloudy", wind: false },
    42: { text: "Cloudy",        wind: false },
    43: { text: "Cloudy",        wind: false },
    44: { text: "Cloudy",        wind: false },
};

function pogoWeather(accuWeather) {
    const pogoWeather = weatherMap[accuWeather.weatherIcon];
    if (!pogoWeather) {
        return "Unknown";
    }
    if (accuWeather.windSpeed + accuWeather.windGust > 55) {
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
