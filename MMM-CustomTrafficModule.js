Module.register("MMM-CustomTrafficModule", {

        // Using https://docs.traveltime.com/api/start/routes

        // {
        //         module: 'MMM-CustomTrafficModule',
        //         position: 'top_left',
        //         config: {
        //                 bingMapsKey: 'AvE-U-CdL3R4HoB5HnL8g9cti6E5-QaDEpMNBQKzkeqKMN4s2LLG8JKoZoqvyzDt',
        //                 origin: "28 Ivy Nola Way, Henderson, Auckland",
        //                 destinations: [
        //                         {
        //                                 "label": "BNZ Parking",
        //                                 "searchString": "33 Fort Street, Auckland CBD, Auckland",
        //                                 "travelModes": [
        //                                         "Driving",
        //                                         "Transit"
        //                                 ],
        //                         },
        //                         {
        //                                 "label": "Newmarket",
        //                                 "searchString": "Westfield Newmarket Broadway, Newmarket, Auckland",
        //                                 "travelModes": [
        //                                         "Driving",
        //                                 ],
        //                         },
        //                         {
        //                                 "label": "Kmart Henderson",
        //                                 "searchString": "The Boundary 5 Vitasovich Avenue, Henderson, Auckland 0612",
        //                                 "travelModes": [
        //                                         "Driving",
        //                                 ],
        //                         }
        //                 ]
        //         },
        // },

        // Module config defaults
        defaults: {
                bingMapsKey: '', // AvE-U-CdL3R4HoB5HnL8g9cti6E5-QaDEpMNBQKzkeqKMN4s2LLG8JKoZoqvyzDt
                // travelTimeAppId: '', // 2a6adfe5
                // travelTimeApiKey: '', // 469682f33e8b9ab1302352fead80533a
                // positionStackApiKey: '', // 2c1b016dca74c2f45ccaa50d3e9f06db
                // destination1: 'Work:SW1A 2PW',
                // destination2: 'Gym:XXX',
                // destination3: 'School:XXX',
                updateInterval: 10 * 60 * 1000,
                // AvoidHighways: false,
                // AvoidTolls: false,
                // unitSystem: 'METRIC'
                origin: '',
                destinations: []
        },

        getLocationDetails: async function (locationString) {
                const response = await fetch("http://api.positionstack.com/v1/forward?" + new URLSearchParams({
                        access_key: this.config.positionStackApiKey,
                        query: locationString,
                }));
                if (!response.ok) {
                        Log.error("MMM-TrafficTimesCustom: Positionstack API error ", response.status);
                        return;
                }
                const data = await response.json();
                const details = data?.data[0];
                console.log('details received: ', details);
                return details;
        },

        getCoords: async function (locationString) {
                const details = await this.getLocationDetails(locationString);
                const coords = {
                        lat: details.latitude,
                        lng: details.longitude
                };
                console.log('coords: ', coords);
                return coords;
        },

        getTravelTimeApiParams: async function () {
                console.log('getting params');
                const origin = {
                        ...this.config.origin,
                        coords: await this.getCoords(this.config.origin.searchString),
                };
                var destinations = this.config.destinations;
                for (let i = 0; i < destinations.length; i++) {
                        destinations[i].coords = await this.getCoords(destinations[i].searchString);
                }
                destinations = destinations.filter((d) => !!d.coords?.lat); // filter out undefined coords
                const arrivalIds = destinations.map((d) => d.id);

                // save unreachable ids
                this.unreachableIds = this.destinationIds.filter((d) => arrivalIds.indexOf(d.id) >= 0);

                const params = {
                        "locations": [
                                origin,
                                ...destinations
                        ],
                        "departure_searches": [
                                {
                                        "id": "One-to-many Matrix",
                                        "departure_location_id": this.config.origin.id,
                                        "arrival_location_ids": arrivalIds,
                                        "transportation": {
                                                "type": "driving"
                                        },
                                        "departure_time": new Date().toISOString(),
                                        "travel_time": 3600,
                                        "properties": [
                                                "travel_time",
                                                "distance"
                                        ]
                                }
                        ]
                };
                console.log('params', params);
                return params;
        },

        fetchTravelTimes: async function () {
                if (!this.travelTimeParams || this.unreachableIds.length > 0) { // retry get params if unreachable destination
                        this.travelTimeParams = await this.getTravelTimeApiParams();
                }
                await fetch("https://api.traveltimeapp.com/v4/time-filter", {
                        method: "POST",
                        headers: {
                                'Content-Type': 'application/json',
                                'X-Application-Id': this.config.travelTimeAppId,
                                'X-Api-Key': this.config.travelTimeApiKey
                        },
                        body: JSON.stringify(this.travelTimeParams)
                }).then(res => res.json())
                        .then(data => {
                                console.log("Request complete! response:", data);
                                this.travelTimeData = data?.results[0].locations;

                                console.log('8', data?.results[0].locations[0].properties[0].travel_time);
                        });
        },

        // http://dev.virtualearth.net/REST/v1/Routes/{travelMode}?wayPoint.1={wayPoint1}&viaWaypoint.2={viaWaypoint2}&waypoint.3={waypoint3}&wayPoint.n={waypointN}&heading={heading}&optimize={optimize}&avoid={avoid}&distanceBeforeFirstTurn={distanceBeforeFirstTurn}&routeAttributes={routeAttributes}&timeType={timeType}&dateTime={dateTime}&maxSolutions={maxSolutions}&tolerances={tolerances}&distanceUnit={distanceUnit}&key={BingMapsKey}

        getTravelTimeBing: async function (destinationString, travelMode) {
                const response = await fetch("http://dev.virtualearth.net/REST/v1/Routes/" + travelMode + "?" + new URLSearchParams({
                        'wp.0': this.config.origin,
                        'wp.1': destinationString,
                        'optimize': travelMode === 'Driving' ? 'timeWithTraffic' : 'time',
                        'key': this.config.bingMapsKey,
                }));
                if (!response.ok) {
                        Log.error("MMM-TrafficTimesCustom: Bing maps API error ", response.status);
                        return;
                }
                const data = await response.json();
                console.log('bing data received: ', data);
                return data;
        },

        fetchTravelTimesBing: async function () {
                var travelTimes = [];
                for (let i = 0; i < this.config.destinations.length; i++) {
                        for (let j = 0; j < this.config.destinations[i].travelModes.length; j++) {
                                const result = await this.getTravelTimeBing(this.config.destinations[i].searchString, this.config.destinations[i].travelModes[j]);
                                if (result && result.statusDescription === 'OK') {
                                        const routeLegs = result.resourceSets[0].resources[0].routeLegs[0];
                                        travelTimes.push({
                                                label: this.config.destinations[i].label,
                                                travelDistance: routeLegs.travelDistance,
                                                travelDuration: routeLegs.travelDuration,
                                                endTime: routeLegs.endTime,
                                                travelMode: routeLegs.travelMode,
                                        });
                                }
                        }
                }
                console.log(travelTimes);
                this.bingTravelTimesData = travelTimes;
                this.lastUpdated = new Date().toISOString();
        },



        getStyles: function () {
                return ["MMM-CustomTrafficModule.css"];
        },

        start: function () {
                var self = this;
                Log.info("Starting module: " + this.name);

                if (this.config.bingMapsKey === "") {
                        Log.error("MMM-TrafficTimesCustom: Bing Maps API key not provided!");
                        return;
                }

                if (this.config.origin === '' || this.config.destinations === []) {
                        Log.error("MMM-TrafficTimesCustom: Origin or destinations not provided!");
                        return;
                }

                setInterval(function () {
                        self.updateDom();
                }, this.config.updateInterval);
        },

        // Override dom generator.
        getDom: function () {

                var wrapper = document.createElement("div");
                wrapper.style = "text-align:left;font-size:0.65em;line-height:normal";

                // var self = this;

                // const isoTime = new Date().toISOString()
                // console.log(isoTime);

                wrapper.innerHTML = '<span>LOADING TRAVEL TIMES</span>';

                // this.fetchTravelTimes().then(() => {
                //         console.log("saved data", this.travelTimeData);

                //         const resultsList = document.createElement('div');
                //         for (let i = 0; i < this.travelTimeData.length; i++) {
                //                 var row = document.createElement('div');
                //                 var destination = this.travelTimeData[i];
                //                 row.innerHTML = 'Destination: ' + destination.id + ' - time: ' + destination.properties[0].travel_time + ' - distance: ' + destination.properties[0].distance;
                //                 resultsList.appendChild(row);
                //         }
                //         // note unreachable ids
                //         if (this.unreachableIds.length > 0) {
                //                 var row = document.createElement('div');
                //                 row.innerHTML = 'Unreachable';
                //                 for (let i = 0; i < this.unreachableIds.length; i++) {
                //                         row.innerHTML += ' - ' + this.unreachableIds[i];
                //                 }
                //                 resultsList.appendChild(row);
                //         }
                //         // wrapper.innerHTML = '';
                //         wrapper.appendChild(resultsList);
                //         wrapper.innerHTML += '<p></p><span>last update ' + new Date().toISOString() + '</span>';
                // });

                this.fetchTravelTimesBing().then(() => {
                        console.log("saved Bing data", this.bingTravelTimesData);
                        var bingRow = document.createElement('div');
                        bingRow.innerHTML = 'Bing data received';
                        wrapper.appendChild(bingRow);
                });

                return wrapper;
        }
});
