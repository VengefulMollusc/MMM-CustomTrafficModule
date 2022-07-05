Module.register("MMM-CustomTrafficModule", {

        // Using https://docs.traveltime.com/api/start/routes

        // {
        //         module: 'MMM-CustomTrafficModule',
        //         position: 'top_left',
        //         config: {
        //                 travelTimeAppId: '2a6adfe5',
        //                 travelTimeApiKey: '469682f33e8b9ab1302352fead80533a',
        //                 positionStackApiKey: '2c1b016dca74c2f45ccaa50d3e9f06db',
        //                 origin: {
        //                         "id": "Home",
        //                         "searchString": "28 Ivy Nola Way, Henderson, Auckland",
        //                 },
        //                 destinations: [
        //                         {
        //                                 "id": "BNZ Parking",
        //                                 "searchString": "33 Fort Street, Auckland CBD, Auckland",
        //                         },
        //                         {
        //                                 "id": "Newmarket",
        //                                 "searchString": "Westfield Newmarket Broadway, Newmarket, Auckland",
        //                         },
        //                         {
        //                                 "id": "Kmart Henderson",
        //                                 "searchString": "The Boundary 5 Vitasovich Avenue, Henderson, Auckland 0612",
        //                         }
        //                 ]
        //         },
        // },

        // Module config defaults
        defaults: {
                travelTimeAppId: '', // 2a6adfe5
                travelTimeApiKey: '', // 469682f33e8b9ab1302352fead80533a
                positionStackApiKey: '', // 2c1b016dca74c2f45ccaa50d3e9f06db
                // destination1: 'Work:SW1A 2PW',
                // destination2: 'Gym:XXX',
                // destination3: 'School:XXX',
                updateInterval: 10 * 60 * 1000,
                // AvoidHighways: false,
                // AvoidTolls: false,
                // unitSystem: 'METRIC'
                origin: {},
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
                const params = {
                        "locations": [
                                origin,
                                ...destinations
                        ],
                        "departure_searches": [
                                {
                                        "id": "One-to-many Matrix",
                                        "departure_location_id": this.config.origin.id,
                                        "arrival_location_ids": this.config.destinations.map((d) => d.id),
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
                if (!this.travelTimeParams) {
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



        getStyles: function () {
                return ["MMM-CustomTrafficModule.css"];
        },

        start: function () {
                var self = this;
                Log.info("Starting module: " + this.name);

                if (this.config.appId === "" || this.config.appKey === "") {
                        Log.error("MMM-TrafficTimesCustom: API key or App ID not provided!");
                        return;
                }

                if (this.config.origin === {} || this.config.destinations === []) {
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

                const isoTime = new Date().toISOString()
                console.log(isoTime);

                wrapper.innerHTML = '<span>LOADING TRAVEL TIMES</span>';

                this.fetchTravelTimes().then(() => {
                        console.log("saved data", this.travelTimeData);

                        const resultsList = document.createElement('div');
                        for (let i = 0; i < this.travelTimeData.length; i++) {
                                var row = document.createElement('div');
                                var destination = this.travelTimeData[i];
                                row.innerHTML = 'Destination: ' + destination.id + ' - ' + destination.properties[0].travel_time;
                                resultsList.appendChild(row);
                        }
                        wrapper.appendChild(resultsList);
                });

                // travelTimeData [
                //         {
                //                 "id": "Newmarket",
                //                 "properties": [
                //                         {
                //                                 "travel_time": 1626,
                //                                 "distance": 18583
                //                         }
                //                 ]
                //         },
                //         {
                //                 "id": "Kmart Henderson",
                //                 "properties": [
                //                         {
                //                                 "travel_time": 341,
                //                                 "distance": 1679
                //                         }
                //                 ]
                //         },
                //         {
                //                 "id": "BNZ Parking",
                //                 "properties": [
                //                         {
                //                                 "travel_time": 1748,
                //                                 "distance": 20064
                //                         }
                //                 ]
                //         }
                // ]

                // RAW [
                //         {
                //                 "search_id": "One-to-many Matrix",
                //                 "locations": [
                //                         {
                //                                 "id": "BNZ Parking",
                //                                 "properties": [
                //                                         {
                //                                                 "travel_time": 1474,
                //                                                 "distance": 20579
                //                                         }
                //                                 ]
                //                         }
                //                 ],
                //                 "unreachable": []
                //         }
                // ]

                return wrapper;
        }
});
