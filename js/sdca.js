// SDCA implementation code

/*jslint browser: true, white: true, single: true, for: true, unordered: true, long: true */
/*global $, alert, console, window, osm2geo, layerviewer, jQuery */

var sdca = (function ($) {
	
	'use strict';
	
	// Settings defaults
	var _settings = {
		
		// CycleStreets API; obtain a key at https://www.cyclestreets.net/api/apply/
		apiBaseUrl: 'https://api.cyclestreets.net',
		apiKey: 'YOUR_API_KEY',
		
		// Mapbox API key
		mapboxApiKey: 'YOUR_MAPBOX_API_KEY',
		
		// Initial lat/lon/zoom of map and tile layer
		defaultLocation: {
			latitude: 53.891,
			longitude: -1.216,
			zoom: 5.2
		},
		defaultTileLayer: 'osoutdoor',
		
		// Default layers ticked
		defaultLayers: [],
		
		// Icon size, set globally for all layers
		iconSize: [38, 42],
		
		// Zoom position
		zoomPosition: 'top-left',
		
		// Geolocation position
		geolocationPosition: 'top-left',
		
		// Enable scale bar
		enableScale: true
	};
	
	// Layer definitions
	var _layerConfig = {
		
		// Public transport - vector layer
		publictransport: {
			vector: {
				source: {
					'type': 'vector',
					'tiles': [
						'/data/publictransport/{z}/{x}/{y}.pbf'
					],
					'minzoom': 6,
					'maxzoom': 14
				},
				layer: {
					'id': 'publictransport',
					'type': 'circle',
					'source': 'publictransport',
					'source-layer': 'publictransport',
					'paint': {
						// Make circles larger as the user zooms from z12 to z22
						'circle-radius': {
							'base': 2.5,
							'stops': [
								[8, 3],
								[22, 180]
							]
						},
						// Color circles using a match expression; see: https://docs.mapbox.com/mapbox-gl-js/style-spec/#expressions-match
						'circle-stroke-width': 1,
						'circle-color': [
							'match',
							['get', 'grade'],
							'A+', '#313695',
							'A',  '#4575b4',
							'A-', '#4575b4',
							'B+', '#74add1',
							'B',  '#abd9e9',
							'B-', '#abd9e9',
							'C+', '#e0f3f8',
							'C',  '#e0f3f8',
							'C-', '#ffffbf',
							'D+', '#ffffbf',
							'D',  '#fee090',
							'D-', '#fee090',
							'E+', '#fdae61',
							'E',  '#fdae61',
							'E-', '#f46d43',
							'F+', '#d73027',
							'F',  '#d73027',
							'F-', '#a50026',
							/* other */ '#e0e0e0'
						]
					}
				}
			}
		},
		
		trafficcounts: {
			apiCall: '/v2/trafficcounts.locations',
			apiFixedParameters: {
				groupyears: '1'
			},
			iconUrl: '/images/icons/icon_congestion_bad.svg',
			lineColourField: 'car_pcu',	// #!# Fixme - currently no compiled all_motors_pcu value
			lineColourStops: [
				[40000, '#ff0000'],	// Colour and line values based on GMCC site
				[20000, '#d43131'],
				[10000, '#e27474'],
				[5000, '#f6b879'],
				[2000, '#fce8af'],
				[0, '#61fa61']
			],
			lineWidthField: 'cycle_pcu',	// #!# Fixme - should be Daily cycles
			lineWidthStops: [
				[1000, 10],
				[500, 8],
				[100, 6],
				[10, 4],
				[0, 2]
			],
			popupHtml:	// Popup code thanks to https://hfcyclists.org.uk/wp/wp-content/uploads/2014/02/captions-html.txt
				  '<p>Count Point {properties.id} on <strong>{properties.road}</strong>, a {properties.road_type}<br />'
				+ 'Located in {properties.wardname} in {properties.boroughname}<br />'
				+ '[macro:yearstable({properties.minyear}, {properties.maxyear}, cycles;p2w;cars;buses;lgvs;mgvs;hgvs;all_motors;all_motors_pcu, Cycles;P2W;Cars;Buses;LGVs;MGVs;HGVs;Motors;Motor PCU)]'
				+ '<p><strong>{properties.maxyear} PCU breakdown -</strong> Cycles: {properties.cycle_pcu}, P2W: {properties.p2w_pcu}, Cars: {properties.car_pcu}, Buses: {properties.bus_pcu}, LGVs: {properties.lgv_pcu}, MGVs: {properties.mgv_pcu}, HGVs: {properties.hgv_pcu}</p>'
				+ '</div>'
		},
		
		planningapplications: {
			apiCall: 'https://www.planit.org.uk/api/applics/geojson',
			apiFixedParameters: {
				pg_sz: 100,
				limit: 100,
				select: 'location,description,address,app_size,app_type,app_state,uid,area_name,start_date,url'
			},
			apiKey: false,
			iconUrl: '/images/icons/signs_neutral.svg',
			iconSizeField: 'app_size',
			iconSizes: {
				'Small': [24, 24],
				'Medium': [36, 36],
				'Large': [50, 50]
			},
			popupHtml:
				  '<p><strong>{properties.description}</strong></p>'
				+ '<p>{properties.address}</p>'
				+ '<p>Size of development: <strong>{properties.app_size}</strong><br />'
				+ 'Type of development: <strong>{properties.app_type}</strong><br />'
				+ 'Status: <strong>{properties.app_state}</strong></p>'
				+ '<p>Reference: <a href="{properties.url}">{properties.uid}</a><br />'
				+ 'Local Authority: {properties.area_name}<br />'
				+ 'Date: {properties.start_date}</p>'
				+ '<p><a href="{properties.url}"><img src="/images/icons/bullet_go.png" /> <strong>View full details</a></strong></p>'
		}
	};
	
	
	return {
		
	// Public functions
		
		// Main function
		initialise: function (config)
		{
			// Merge the configuration into the settings
			$.each (_settings, function (setting, value) {
				if (config.hasOwnProperty(setting)) {
					_settings[setting] = config[setting];
				}
			});
			
			// Load layers from datasets file, and then initialise layers
			sdca.loadDatasets ();
				
			// Initialisation is wrapped within loadDatasets
			// layerviewer.initialise (_settings, _layerConfig);
		},
		
		
		// Function to load layers from datasets file
		loadDatasets: function ()
		{
			// Load the datasets and field definitions
			$.getJSON ('/datasets.json', function (datasets) {
				$.getJSON ('/fields.json', function (fields) {
					
					// Add each dataset
					var type;
					var $clone;
					$.each (datasets, function (index, dataset) {
						
						// Skip if required
						if (dataset.show == 'FALSE') {
							return;		// continue
						}
						
						// Determine the renderer; see: https://docs.mapbox.com/mapbox-gl-js/style-spec/layers/#type
						// The incoming data derives from the geometries_type listed at: https://github.com/SDCA-tool/sdca-data/blob/main/datasets.csv
						switch (dataset.geometries_type) {
							case 'LineString':
							case 'MultiLineString':
								type = 'line';
								break;
							case 'MultiPolygon':
							case 'Polygon':
								type = 'fill';
								break;
							case 'MultiPoint':
							case 'Point':
								type = 'circle';
								break;
						}
						
						// Register the layer definition
						_layerConfig[dataset.id] = {
							vector: {
								source: {
									'type': 'vector',
									'tiles': [
										'/data/' + dataset.id + '/{z}/{x}/{y}.pbf'
									],
									'minzoom': 6,
									'maxzoom': 14
								},
								layer: {
									'id': dataset.id,
									'type': type,
									'source': dataset.id,
									'source-layer': dataset.id
								}
							},
							popupHtml: (dataset.has_attributes == 'TRUE' ? false : '<p>' + sdca.htmlspecialchars (dataset.title) + '</p>'),
						};
						
						// Create a UI nav menu entry
						$clone = $('nav #selector ul li.template').clone (true);
						$clone.removeClass ('template').addClass (dataset.id);
						$clone.find ('input[type="checkbox"').attr ('id', 'show_' + dataset.id);
						$clone.find ('a').attr ('href', '#' + dataset.id);
						$clone.find ('a').attr ('title', dataset.description);
						$clone.html ($clone.html ().replace ('Template', dataset.title));
						$clone.appendTo ('nav #selector ul');
						
						// Create the information panel
						$clone = $('#sections div.template').clone (true);
						$clone.removeClass ('template');
						$clone.attr ('id', dataset.id);
						$clone.find ('h2').html (dataset.title);
						$clone.find ('p').html (dataset.description);
						$clone.appendTo ('#sections');
					});
					
					// Run the layerviewer for these settings and layers
					layerviewer.initialise (_settings, _layerConfig);
				});
			});
		},
		
		
		// Function to make data entity-safe
		htmlspecialchars: function (string)
		{
			if (typeof string !== 'string') {return string;}
			return string.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
		}
	};
	
} (jQuery));

