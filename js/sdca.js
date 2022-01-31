// SDCA implementation code

/*jslint browser: true, white: true, single: true, for: true, unordered: true, long: true */
/*global $, alert, console, window, osm2geo, layerviewer, jQuery */

var sdca = (function ($) {
	
	'use strict';
	
	
	// Settings defaults
	var _settings = {
		
		// Base URL
		baseUrl: '/calculator/',
		
		// Selector for nav
		selector: '#layerselector',
		useJqueryTabsRendering: false,
		
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
		enableScale: true,
		
		// Drawing
		enableDrawing: true,
		drawingGeometryType: 'LineString',
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
	
	
	// Panel state control; this has a main panel state (design-scheme/view-results), but the data-layers screen can temporarily displace the main state
	var _panels = ['data-layers', 'design-scheme', 'view-results'];
	var _actualCurrentPanel = 'design-scheme';		// The panel actually in place
	var _currentMainPanel = 'design-scheme';	// The main panel currently, even if temporarily overriden
	var _previousMainPanel = false;				// The main panel previously
	
	
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
			
			// Manage panels
			sdca.managePanels ();
			
			// Load layers from datasets file, and then initialise layers
			sdca.loadDatasets ();
				
			// Initialisation is wrapped within loadDatasets
			// layerviewer.initialise (_settings, _layerConfig);
			
			// Handler for drawn line
			sdca.handleDrawLine ();
		},
		
		
		// Panel management
		managePanels: function ()
		{
			// Data layers toggle
			$('button#explore-data-layers').click (function () {
				if (_actualCurrentPanel == 'data-layers') {	// I.e. clicked again as implied toggle-off
					sdca.switchPanel (_currentMainPanel, true);
				} else {
					sdca.switchPanel ('data-layers', true);
				}
			});
			
			// Data layers back button
			$('#data-layers .govuk-back-link').click (function () {
				sdca.switchPanel (_currentMainPanel, true);
			});
			
			// Back to the design button
			$('#view-results .govuk-back-link').click (function () {
				sdca.switchPanel ('design-scheme');
			});
		},
		
		
		// Panel switching
		switchPanel: function (newCurrentPanel, temporaryState)
		{
			// Loop through each panel to show the new one and hide others
			$.each (_panels, function (index, panel) {
				if (panel == newCurrentPanel) {
					$('#' + panel + '.sdca-panel').show ();
				} else {
					$('#' + panel + '.sdca-panel').hide ();
				}
			});
			
			// Update the main state, if not a temporary change
			if (!temporaryState) {
				_previousMainPanel = _actualCurrentPanel;
				_currentMainPanel = newCurrentPanel;
			}
			
			// Set the state of the panel actually currently in place, even if temporary
			_actualCurrentPanel = newCurrentPanel;
		},
		
		
		// Function to load layers from datasets file
		loadDatasets: function ()
		{
			// Load the datasets and field definitions
			$.getJSON ('/lexicon/datasets.json', function (datasets) {
				$.getJSON ('/lexicon/data_dictionary/fields.json', function (fields) {
					$.getJSON ('/lexicon/styles/styles.json', function (styles) {
						
						// #!# Duplicate fields, pending layer merging work
						fields.carbon_full = fields.lsoa;
						fields.carbon_general = fields.lsoa;
						fields.carbon_super_general = fields.lsoa;
						
						// Add each dataset
						var type;
						var $clone;
						var popupLabels;
						var popupDescriptions;
						var fieldname;
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
							
							// Set labels and descriptions for popups, if present
							popupLabels = {};
							popupDescriptions = {};
							if (fields[dataset.id]) {
								$.each (fields[dataset.id], function (index, field) {
									fieldname = field.col_name;
									popupLabels[fieldname] = field.name;
									popupDescriptions[fieldname] = field.description;
								});
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
										// paint is added below, if defined; if not present as a key, the layerviewer will use default styling
									}
								},
								popupHtml: (dataset.has_attributes == 'TRUE' ? false : '<p>' + sdca.htmlspecialchars (dataset.title) + '</p>'),
								popupLabels: popupLabels,
								popupDescriptions: popupDescriptions,
							};
							
							// Define style if present
							if (styles[dataset.id]) {
								_layerConfig[dataset.id].vector.layer.paint = styles[dataset.id];
							}
							
							// Create a UI nav menu entry
							$clone = $('#layerselector ul li.template').clone (true);
							$clone.removeClass ('template').addClass (dataset.id);
							$clone.find ('input[type="checkbox"').attr ('id', 'show_' + dataset.id);
							$clone.find ('a').attr ('href', '#' + dataset.id);
							$clone.find ('a').attr ('title', dataset.description);
							$clone.html ($clone.html ().replace ('Template', dataset.title));
							$clone.appendTo ('#layerselector ul');
							
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
			});
		},
		
		
		// Handler for drawn line
		handleDrawLine: function ()
		{
			// Only show the submit button once a geometry is present
			$('#geometry').on ('change', function (e) {
				if ($('#geometry').val ()) {
					$('#calculate, .edit-clear').css ('visibility', 'visible');
				} else {
					$('#calculate, .edit-clear').css ('visibility', 'hidden');
				}
			});

			// Run when the captured geometry value changes; this is due to the .trigger ('change') in layerviewer.drawing () as a result of the draw.create/draw.update events
			$('button#calculate').click (function (e) {
				
				// Show the loading spinner
				$('.loading-spinner').css ('display', 'inline-block');
				
				// Capture the data, which will be GeoJSON
				var geojson = $('#geometry').val ();
				
				// End if the line has been cleared
				if (geojson === '') {return;}
				
				// Send the data to the API
				$.ajax ({
					type: 'GET',
					url: '/api/v1/locations.json',
					dataType: 'json',
					data: {
						line: geojson,
						bbox: '0,0,0,0',	// Random value to avoid rejection from sample API
						zoom: 14			// Random value to avoid rejection from sample API
					},
					success: function (data, textStatus, jqXHR) {
						sdca.showResults (data);
						sdca.switchPanel ('view-results');
						
						// Reset the loading spinner
						$('.loading-spinner').css ('display', 'none');
					},
					error: function (jqXHR, textStatus, errorThrown) {
						var responseBody = JSON.parse (jqXHR.responseText);
						alert ('[Prototype development:]\n\nError:\n\n' + responseBody.error);
					},
				});
			});
			
			// Clear results when any drawing button clicked
			$('#drawing a').click (function () {
				
				// Fade out panel
				// #!# Needs to be reimplemented for new UI - should reset panel
				
				// Remove the geometries added to the map, if present
				layerviewer.eraseDirectGeojson ('results');
			});
		},
		
		
		// Function to show the results
		showResults: function (data)
		{
			// Create the PAS2080 table
			var pas2080Labels = {
				pas2080_code: 'Code',
				emissions: 'Emissions',
				emissions_high: 'High',
				emissions_low: 'Low',
				confidence: 'Confidence',
				notes: 'Notes'
			};
			var pas2080 = sdca.htmlTable (data.pas2080, pas2080Labels);
			
			// Create the time series table
			var timeseriesLabels = {
				year: 'Year',
				emissions: 'Emissions',
				emissions_cumulative: 'Emissions (cumulative)',
			};
			var timeseries = sdca.htmlTable (data.timeseries, timeseriesLabels);
			
			// Populate the results in the interface
			$('.netzero_compatible').text ((data.netzero_compatible[0] == 'yes' ? 'Net zero compatible' : 'Not net zero compatible'));
			if (data.netzero_compatible[0] == 'no') {
				$('.govuk-panel--confirmation').addClass ('failure');
			}
			$('.payback_time').text (data.payback_time[0] + ' years');
			$('.emissions_whole_life').text (layerviewer.number_format (data.emissions_whole_life[0]));
			$('.comments').text (data.comments[0]);
			$('.pas2080').html (pas2080);
			$('.timeseries').html (timeseries);
			
			// Define icons based on data value
			var layerConfig = {
				iconField: 'type',
				icons: {
					error: '/images/markers/red.svg',
					warning: '/images/markers/orange.svg',
					info: '/images/markers/blue.svg',
				}
			};
			
			// Add the geometries to the map
			var featureCollection = JSON.parse (data.geometry);
			layerviewer.addDirectGeojson (featureCollection, 'results', layerConfig);
		},
		
		
		// Function to create an HTML table from a dataset
		htmlTable: function (data, labels)
		{
			// Start the table
			var html  = '<table class="govuk-table">';
			
			// Headers, using first row as keys, finding labels where they exist
			html += '<tr class="govuk-table__row">';
			$.each (data[0], function (field, value) {
				html += '<th scope="col" class="govuk-table__header">' + sdca.htmlspecialchars ((labels[field] || field)) + '</td>';
			});
			html += '</tr>';
			
			// Add data for each row
			$.each (data, function (index, row) {
				html += '<tr class="govuk-table__row">';
				$.each (row, function (field, value) {
					html += '<td class="govuk-table__cell ' + field + '">' + sdca.htmlspecialchars (value) + '</td>';
				});
				html += '</tr>';
			});
			
			// End the table
			html += '</table>';
			
			// Return the HTML
			return html;
		},
		
		
		// Function to make data entity-safe
		htmlspecialchars: function (string)
		{
			if (typeof string !== 'string') {return string;}
			return string.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
		}
	};
	
} (jQuery));

