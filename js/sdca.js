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

	var _startupPanelId = 'design-scheme'; // Panel to show at startup
	var _isTempPanel = false; // If we have a temp (i.e. data layers) panel in view
	var _currentPanelId = null; // Store the current panel in view
	var _previousPanelId = null; // The previous panel. Used when exiting the _tempPanel
	
	var _interventions = null; // Store the parsed interventions CSV
	var _currentIntervention = {}; // Store the type of the current intervention

	var _interventionsCsvUrl = 'https://raw.githubusercontent.com/SDCA-tool/sdca-data/main/data_tables/interventions.csv';
	
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

			// Retrieve, populate and filter
			sdca.retrieveInterventions ();
			sdca.filterInterventions()
			
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
			// If a button is clicked with a target panel, go to that panel
			$('body').on('click', 'button, a', function () {
				var panel = $(this).data('sdca-target-panel');
				if (panel !== undefined) {
					// Are we currently exiting a temporary panel (i.e. layer viewer)
					if (_isTempPanel) {
						sdca.switchPanel(_previousPanelId)
					} else {
						sdca.switchPanel(panel)
					}
				}
			});

			// At startup, show the desired panel
			sdca.switchPanel(_startupPanelId);
		},
		
		
		// Panel switching
		switchPanel: function (panelToShow)
		{	
			// Save the previous panel
			_previousPanelId = _currentPanelId;
			
			// Only show the desired sdca panel
			$('.sdca-panel').hide();
			$('#' + panelToShow).show();

			// Is this panel a temporary one? Set status
			_isTempPanel = ($('#' + panelToShow).data('sdca-is-temp-panel') ? true : false)

			// Save the panel as current
			_currentPanelId = panelToShow;
		},


		// Get the different intervention types and populate them
		retrieveInterventions: function () {
			// Stream and parse the CSV file
			Papa.parse(_interventionsCsvUrl, {
				header: true,
				download: true,
				skipEmptyLines: true,
				complete: function (fields) {
					_interventions = fields;

					sdca.populateInterventions();
				}
			});
		},


		// Populate interventions in hTML
		populateInterventions: function () {
			var mode = ''; // i.e. High speed rail

			$('#interventions-accordion').empty();
			
			// Iterate through each intervention
			$.each(_interventions.data, function (indexInArray, intervention) {

				// Save the python-case intervention mode (i.e. high-speed-rail)
				mode = sdca.convertLabelToPython(intervention.mode)

				// If we already have an accordion header for this, 
				if ($('#intervention-' + mode).length > 0) {

					// Append a new list row
					$('#interventions-accordion-content-' + mode + ' .govuk-summary-list').append(
						sdca.generateInterventionRowHtml(intervention)
					)
				} else {

					// Otherwise, append a new sectiona
					$('#interventions-accordion').append(
						sdca.generateInterventionHeaderHtml(intervention)
					)
				}
			});


			// Initialise the accordion with the new HTML
			window.GOVUKFrontend.initAll()

			// If we click on the link to add a new intervention, save the type for global access
			$('body').on('click', '#interventions-accordion .govuk-summary-list__actions a.govuk-link', function () {
				_currentIntervention = {
					mode: $(this).data('sdca-mode'),
					intervention: $(this).data('sdca-intervention'),
					description: $(this).data('sdca-intervention-description')
				}

				// Update the draw panel with this description
				$('.intervention-name').text(_currentIntervention.mode + ' - ' + _currentIntervention.intervention);
				$('.intervention-description').text(_currentIntervention.intervention-description);
			});
		},


		// Generate intervention accordion header HTML
		generateInterventionHeaderHtml: function (intervention) {
			var mode = sdca.convertLabelToPython(intervention.mode);
			return (`
				<div class="govuk-accordion__section" id="intervention-${mode}">
					<div class="govuk-accordion__section-header">
					<h2 class="govuk-accordion__section-heading">
						<span class="govuk-accordion__section-button" id="interventions-accordion-heading-${mode}">
						${intervention.mode}
						</span>
					</h2>
					</div>
					<div id="interventions-accordion-content-${mode}" class="govuk-accordion__section-content"
					aria-labelledby="interventions-accordion-content-${mode}">
	
					<dl class="govuk-summary-list">
						${sdca.generateInterventionRowHtml(intervention)}
					</dl>
	
					</div>
					</div>
				`)
		},

		
		// Generate intervention row HTML
		generateInterventionRowHtml: function (intervention) {
			return (						
			`
			<div class="govuk-summary-list__row">
				<dt class="govuk-summary-list__key">
				${intervention.intervention}
				</dt>
				<dd class="govuk-summary-list__value">
				${intervention.intervention_description}
				</dd>
				<dd class="govuk-summary-list__actions">
					<a class="govuk-link" data-sdca-mode="${intervention.mode}" data-sdca-intervention="${intervention.intervention}" data-sdca-intervention-description="${intervention.intervention_description}" data-sdca-target-panel="draw-intervention" href="#">
					Add to map<span class="govuk-visually-hidden"> a new ${intervention.intervention}</span>
					</a>
				</dd>
			</div>
			`)
		},


		// Convert normal case into python case. 
		convertLabelToPython: function (label) {
			// "High speed rail" => "high-speed-rail"
			return label.replace(/\s+/g, '-').toLowerCase();
		},


		// Enable filtering of interventions
		filterInterventions: function () {
			$('#filter-interventions').on('keyup', function () {
				// Once we type, expand all the accordion sections to facilitate discovery
				// GOV.UK design system has no programmatic access like jQuery or Bootstrap, so manually simulate click
				if ($('#interventions-accordion .govuk-accordion__show-all-text').first().text() == 'Show all sections') {
					$('#interventions-accordion .govuk-accordion__show-all-text').click();
				}
				
				var value = $(this).val().toLowerCase();

				// Filter rows
				$('.govuk-summary-list__row').filter(function () {
					$(this).toggle($(this).text().toLowerCase().indexOf(value) > -1)
				});

				// Hide any empty sections
				$('.govuk-accordion__section').filter(function () {
					$(this).toggle($(this).text().toLowerCase().indexOf(value) > -1)
				});
			});
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
							$clone = $('.layertemplate').clone (true);
							$clone.removeClass ('layertemplate');
							$clone.find ('input[type="checkbox"').attr ('id', 'show_' + dataset.id);
							$clone.find ('input[type="checkbox"').attr ('value', dataset.id);
							$clone.find ('label').text (dataset.title);
							$clone.find ('label').attr ('for', 'show_' + dataset.id);
							$clone.appendTo ('#accordion-default-content-1 .govuk-checkboxes');
							
							/*
							// Create the information panel
							$clone = $('#sections div.template').clone (true);
							$clone.removeClass ('template');
							$clone.attr ('id', dataset.id);
							$clone.find ('h2').html (dataset.title);
							$clone.find ('p').html (dataset.description);
							$clone.appendTo ('#sections');
							*/
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
					$('.finish-drawing').show();
					$('.draw.line').addClass('govuk-button--secondary').text('Continue drawing on map');
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

