'use strict';

const AWS = require('aws-sdk');
const uuid = require('uuid');
const documentClient = new AWS.DynamoDB.DocumentClient();

const __TESTING__ = false;

const forecastService = new AWS.Service({
    endpoint: 'http://dataservice.accuweather.com',
    convertResponseTypes: false,

    apiConfig: {
        metadata: {
            protocol: 'rest-json'
        },
        operations: {
            GetForecast: {
                http: {
                    method: 'GET',
                    requestUri: '/forecasts/v1/hourly/12hour/{locationID}'
                },
                input: {
                    type: 'structure',
                    required: [ 'apiKey', 'locationID', 'details', 'metric' ],
                    members: {
                        'apiKey': {
                            location: 'querystring',
                            locationName: 'apikey',
                            sensitive: true
                        },
                        'locationID': {
                            location: 'uri',
                            locationName: 'locationID'
                        },
                        'details': {
                            location: 'querystring',
                            locationName: 'details'
                        },
                        'metric': {
                            location: 'querystring',
                            locationName: 'metric'
                        }
                    }
                },
            },
        },
    }
});

forecastService.isGlobalEndpoint = true;

// UTC pull times for actual forecast data.
const forecastTimes = [ '08', '16', '24' ];

const locations = [
    { locationID: '2110989', locationName: 'Herndon (Floris)', hourly: true },
    { locationID: '341249',  locationName: 'Reston (RTC)' },
];

function getForecastFromResponse(response) {
    const keys = Object.keys(response).filter(key => {
        if (key === null || key === undefined) return false;
        const value = response[key];
        return !(value === null || value === undefined);
    });

    return keys.map(key => {
        return response[key];
    });
}

function makeHourlyForecast(locationID, locationName, requestTime, forecast) {
    return forecast.map(hourly => {
        return {
            id: uuid.v1(),
            locationID: locationID,
            locationName: locationName,
            requestTime: requestTime,
            dateTime: hourly.DateTime,
            weatherIcon: hourly.WeatherIcon,
            isDaylight: hourly.IsDaylight,
            windSpeed: hourly.Wind.Speed.Value,
            windGust: hourly.WindGust.Speed.Value,
        }
    });
}

function saveHourlyForecast(hour) {
    return new Promise((resolve, reject) => {
        if (__TESTING__) {
            // Log results but don't persist to db.
            console.log(JSON.stringify(hour));
            resolve();
            return;
        }

        const params = {
            Item: hour,
            TableName: process.env.DB_TABLE_NAME
        };
        documentClient.put(params, (err, data) => {
            if (err) {
                console.error('Unable to save forecast: ', err);
                reject('Unable to save forecast');
                return;
            }
            console.log(JSON.stringify(hour));
            resolve();
        });
    });
}

function hour(time) {
    return time.substring(11,13);
}

function getForecastForLocation(location) {
    return new Promise((resolve, reject) => {
        forecastService.getForecast({
            apiKey: process.env.WS_API_KEY,
            locationID: location.locationID,
            details: 'true',
            metric: 'true',
        }, (err, data) => {
            if (err) {
                reject(err);
                return;
            }
            const forecast = getForecastFromResponse(data);
            resolve(forecast);
        });
    });
}

function updateForecastForLocation(location, requestTime) {
    return new Promise((resolve, reject) => {
        const { locationID, locationName, hourly } = location;

        const shouldFetchLocation = location.hourly || forecastTimes.includes(hour(requestTime));
        if (!shouldFetchLocation) {
            console.log('Not fetching location for ' + locationName + ' this hour.');
            resolve();
            return;
        }

        getForecastForLocation(location)
          .then(forecast => {
              const hourlyForecast = makeHourlyForecast(locationID, locationName, requestTime, forecast);
              const promises = hourlyForecast.map(hour => {
                  saveHourlyForecast(hour);
              });

              // Don't fail even if we are unable to save all of the data.
              Promise.all(promises).then(resolve).catch(resolve);
          })
          .catch(err => {
              console.error('Unable to get AccuWeather forecast: ', err);
              reject('Unable to get AccuWeather forecast');
          });
    });
}

exports.handler = function(event, context, callback) {
    const requestTime = new Date().toISOString();
    const promises = locations.map(location =>
        updateForecastForLocation(location, requestTime)
    );

    Promise.all(promises)
        .then(() => callback(null, 'Success'))
        .catch(err => callback(err));
};
