// SDCA implementation code

/*jslint browser: true, white: true, single: true, for: true, unordered: true, long: true */
/*global $, alert, console, window, osm2geo, layerviewer, jQuery, turf, Chart */

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
		stopDrawingWhenClearingLine: false

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
	

	/* UI state */
	var _startupPanelId = 'design-scheme'; // Panel to show at startup
	var _isTempPanel = false; // If we have a temp (i.e. data layers) panel in view
	var _currentPanelId = null; // Store the current panel in view
	var _previousPanelId = null; // The previous panel. Used when exiting the _tempPanel


	/* Interventions state control */
	var _interventions = null; // Store the parsed array of interventions JSON
	var _currentInterventionType = { // Object to control the current intervention index
		indexInternal: false,
		indexListener: function (val) { },
		set index(val) {
			this.indexInternal = val;
			this.indexListener(val);
		},
		get index() {
			return Number(this.indexInternal); // Return Number to ensure index of 0 (currently high speed rail) doesn't return as False
		},
		registerListener: function (listener) {
			this.indexListener = listener;
		}
	}
	var _currentlyEditingRegistry = { // Store the intervention we are editing for deletion purposes.
		indexInternal: -1,
		indexListener: function (val) { },
		set index(val) {
			this.indexInternal = val;
			this.indexListener(val);
		},
		get index() {
			return this.indexInternal;
		},
		registerListener: function (listener) {
			this.indexListener = listener;
		}
	}
	var _interventionRegistry = {
		_timestamp: null,
		type: 'FeatureCollection',
		features: []
	};

	/* Map state */
	var _mapState = { // Object to control the current intervention index
		stateInternal: false, // 'view-all', 'edit', 'new'
		stateListener: function (val) { },
		set state(val) {
			this.stateInternal = val;
			this.stateListener(val);
		},
		get state() {
			return this.stateInternal;
		},
		registerListener: function (listener) {
			this.stateListener = listener;
		}
	}
	
	/* Labels */
	var _pas2080Labels = {};
	
	/* API state */
	var _lastApiCallRegistryTimestamp = null; // Store the last time we called the API, for comparison to the registry timestamp
	var _returnedApiData = null; // Store API returned data for user export purposes

	/* Drawing and map */
	var _drawingHappening = null; // Store the LayerViewer _drawingHappening Object, which is observable in order to trigger SDCA UI changes when LayerViewer internal drawing state changes
	var _draw = false; // Store the LayerViewer _draw Object
	var _map = false; // Store the Layerviewer _map Object

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

			// Handler for drawn line
			sdca.handleDrawLine ();
			
			// Manage panels
			sdca.managePanels ();
			sdca.handleFileUpload ();

			// Intervention handlers
			sdca.retrieveInterventions ();
			sdca.filterInterventions ();
			sdca.trackInterventions ();
			sdca.registerIntervention ();
			sdca.editIntervention ();
			sdca.deleteIntervention ();
			sdca.handleChartRadios ();

			// Map state controller
			sdca.mapState ();

			sdca.exportData ();
			
			sdca.pas2080Labels ();

			// LayerViewer initialisation is wrapped within loadDatasets
			// layerviewer.initialise (_settings, _layerConfig);
		},


		// Controller to manage map state
		mapState: function () {
			_mapState.registerListener(function (state) {
				switch (state) {
					case 'view-all':
						// Send our user added interventions to LayerViewer for display
						sdca.addFeaturesToMap(_interventionRegistry);

						// Clear any drawings as we are not in edit or new mode
						sdca.clearDrawings();

						// Make sure we are not editing anything
						_currentlyEditingRegistry.index = -1;

						break;

					case 'edit':

						// Adjust the UI drawing buttons
						$('.draw.line').text('Redo drawing');
						$('.drawing-complete').show();

						// Reset geometry val
						$('#geometry').val('');

						// Change the labels on the draw page 
						$('#draw-intervention h2').text('Edit this intervention');
						$('#draw-intervention button.drawing-complete').text('I have finished editing this intervention');

						break;

					case 'new':
						// Make sure we are not editing anything
						_currentlyEditingRegistry.index = -1;

						// Clear all drawing from the map
						sdca.clearDrawings();

						// Clear the #geometry field, used for storing temp draw coordinates
						$('#geometry').val('');

						// Adjust the UI drawing buttons
						$('.draw.line').text('Start new drawing on the map');
						$('.drawing-complete').hide();

						// Adjust the labels on the drawing page 
						$('#draw-intervention h2').text('Draw an intervention on the map');
						$('#draw-intervention button.drawing-complete').text('I have finished designing this intervention');
						$('#draw-intervention .distance').text('0 km');

						break;

					default:
						// Set as 'view-all', which will trigger a new change to this state
						_mapState.state = 'view-all';
				}

				// Show the delete intervention button
				if (_mapState.state == 'edit') {
					$('#delete-intervention').show ();
				} else {
					$('#delete-intervention').hide ();
				}
			});

			// At startup, set map state as view-all
			_mapState.state = 'view-all';
		},


		// Panel management
		managePanels: function () {
			// If a button is clicked with a target panel, go to that panel
			$('body').on('click', 'button, a', function () {
				var panel = $(this).data('sdca-target-panel');
				if (panel !== undefined) {
					// Are we currently exiting a temporary panel (i.e. layer viewer)
					if (_isTempPanel) {
						sdca.switchPanel(_previousPanelId);
					} else {
						sdca.switchPanel(panel);
					}
				}
			});

			// Data layers panel: show active state
			$('#explore-data-layers').on('click', function () {
				$(this).toggleClass('selected');
				
				if ($(this).hasClass('selected')) {
					$(this).text('Hide data layers panel');
				} else {
					$(this).text('Explore data layers');
				}
			});

			// At startup, show the desired panel
			sdca.switchPanel(_startupPanelId);
		},


		// Panel switching
		switchPanel: function (panelToShow) {
			// Save the previous panel
			_previousPanelId = _currentPanelId;

			// Only show the desired sdca panel
			$('.sdca-panel').hide();
			$('#' + panelToShow).show();

			// Is this panel a temporary one? Set status
			_isTempPanel = ($('#' + panelToShow).data('sdca-is-temp-panel') ? true : false);
			
			// Add autofocus if required
			$('.autofocus').focus ();
			
			// Save the panel as current
			_currentPanelId = panelToShow;

			// Update the map state
			if (panelToShow !== 'draw-intervention') {
				_mapState.state = 'show-all';
			}
		},


		// UI management for GIS file upload
		handleFileUpload: function () {
			// By default, the file upload button is disabled
			$('#submit-gis-file').attr('disabled', 'disabled').addClass('govuk-button--disabled');

			// Once we have uploaded a file, enable the button
			$('input#gis-file').on('change', function () {
				$('#submit-gis-file').removeAttr('disabled').removeClass('govuk-button--disabled');
			});

			// Handle GeoJSON "upload", i.e. replace the internal intervention registry with the contents of the uploaded file
			$('#submit-gis-file').on('click', function () {
				// Get the file
				var importedFile = document.getElementById('gis-file').files[0];

				var reader = new FileReader();
				reader.onload = function () {
					var fileContent = JSON.parse(reader.result);

					// Replace the registry with the contents of the file
					_interventionRegistry = fileContent;

					// Add these features to the map
					sdca.addFeaturesToMap();

					// Update timestamp
					_interventionRegistry._timestamp = Date.now();

					// Reset the geometry field
					$('#geometry').val('');

					// Ensure the calculate button is visible
					$('#calculate').show();

					// Update the list of interventions with the new data
					sdca.updateUserInterventionList();

					// Show the results of the upload
					sdca.switchPanel('design-scheme');
				};
				reader.readAsText(importedFile);
			});
		},


		// Get the different intervention types and populate them
		retrieveInterventions: function () {
			// Get the interventions JSON file
			$.getJSON('/lexicon/data_tables/interventions.json', function (interventions) {
				_interventions = interventions;
				sdca.populateInterventions();
			});
		},


		// Populate interventions in hTML
		populateInterventions: function () {
			var mode = ''; // i.e. High speed rail

			$('#interventions-accordion').empty();

			// Iterate through each intervention
			$.each(_interventions, function (interventionIndex, intervention) {

				// Save the python-case intervention mode (i.e. high-speed-rail)
				mode = sdca.convertLabelToPython(intervention.mode);

				// If we already have an accordion header for this,
				if ($('#intervention-' + mode).length > 0) {

					// Append a new list row
					$('#interventions-accordion-content-' + mode + ' .govuk-summary-list').append(
						sdca.generateInterventionRowHtml(intervention, interventionIndex)
					);
				} else {

					// Otherwise, append a new section
					$('#interventions-accordion').append(
						sdca.generateInterventionHeaderHtml(intervention, interventionIndex)
					);
				}
			});

			// Initialise the accordion with the new HTML
			window.GOVUKFrontend.initAll();
		},


		// Code to enter editing mode for an intervention
		editIntervention: function () {
			$('body').on('click', '.edit-intervention', function () {
				
				// Set the map state to trigger UI changes
				_mapState.state = 'edit';
				
				// Set the registry index to the intervention we want to edit
				_currentlyEditingRegistry.index = $(this).data('sdca-registry-index');

				// Pull the intervention type and set that so we know what we are editing
				var interventionObject = _interventionRegistry.features[_currentlyEditingRegistry.index];
				_currentInterventionType.index = interventionObject._interventionTypeIndex;
			});
		},


		// Code for handling adding, registering, removing interventions
		trackInterventions: function () {
			// If we click on the link to add a new intervention, save the type for global access
			$('body').on('click', '#interventions-accordion .govuk-summary-list__actions a.govuk-link', function () {
				// Set the current intervention index
				_currentInterventionType.index = Number($(this).data('sdca-intervention-index')); // Use Number to ensure the "0" index is not represented as false

				// Set the map state
				_mapState.state = 'new';
			});

			// UI listener to handle changes to the current intervention
			_currentInterventionType.registerListener(function (index) {
				index = Number(index); // Ensure 0 isn't interpreted as False
				if (index > -1) {
					$('.intervention-mode').text(_interventions[index].mode);
					$('.intervention-name').text(_interventions[index].intervention_name);
					$('.intervention-description').text(_interventions[index].intervention_description);
				}
			});

			// Update the intervention list at startup
			sdca.updateUserInterventionList();
		},


		// Handler for the delete intervention button
		// !TODO needs to clear any drawings from map
		deleteIntervention: function () {
			// Listener for change in editing state, to show button
			_currentlyEditingRegistry.registerListener(function (index) {
				if (Number(index) > -1) {
					$('#delete-intervention').show();
				} else {
					$('#delete-intervention').hide();
				}
			});
			
			// Delete intervention button handler
			$('#delete-intervention').on('click', function () {
				// If we are creating a new intervention, the delete button is hidden
				if (_currentlyEditingRegistry.index < 0) {
					// Shouldn't happen
				} else {
					// The following two steps are a way around JavaScript now having a proper ArrayItem.remove() method
					// Empty the array at the correct index
					delete _interventionRegistry.features[_currentlyEditingRegistry.index];

					// Create a new clean array without the undefined index and push it
					var cleanedInterventionArray = [];
					$.each(_interventionRegistry.features, function (indexInArray, feature) {
						if (feature !== undefined) {
							cleanedInterventionArray.push(feature)
						}
					});
					_interventionRegistry.features = cleanedInterventionArray;
				}

				// Update timestamp
				_interventionRegistry._timestamp = Date.now();

				// Done editing, set currently editing registry as false
				_currentlyEditingRegistry.index = -1;

				// Regenerate user intervention list
				sdca.updateUserInterventionList();

				// ET go home
				sdca.switchPanel('design-scheme');
			});
		},


		// Add intervention to registry/main page
		registerIntervention: function () {
			$('#register-intervention').on('click', function () {

				// Get the intervention type
				var currentIntervention = _interventions[_currentInterventionType.index];

				// Get the full name of the GeometryType
				var openGisTypes = {
					line: 'LineString',
					point: 'Point',
					polygon: 'Polygon'
				};

				var geometryType = openGisTypes[_interventions[_currentInterventionType.index].geometry] || 'LineString';

				// Build the GeoJSON object
				var newGeoJson = {
					_interventionTypeIndex: _currentInterventionType.index,
					type: 'Feature',
					properties: {
						infrastructure_type: currentIntervention.infrastructure_type,
						mode_class: currentIntervention.mode_class,
						mode: currentIntervention.mode,
						intervention_class: currentIntervention.intervention_class,
						intervention_name: currentIntervention.intervention_name,
						intervention: currentIntervention.intervention
					},
					geometry: {
						type: geometryType,
						coordinates: JSON.parse($('#geometry').val())
					}
				};

				// Are we editing an existing intervention, or creating a new one?
				if (Number(_currentlyEditingRegistry.index) > -1) {
					_interventionRegistry.features[Number(_currentlyEditingRegistry.index)].geometry.coordinates = JSON.parse($('#geometry').val());
				} else {
					// Add this as a GeoJSON object to the registry
					_interventionRegistry.features.push(newGeoJson);
				}

				// Update timestamp
				_interventionRegistry._timestamp = Date.now();

				// Reset the geometry field
				$('#geometry').val('');

				// Update the front page list 
				sdca.updateUserInterventionList();

				// Remove the current intervention index, if we were editing
				_currentInterventionType.index = -1;

			});
		},


		// Update the list of user interventions
		updateUserInterventionList: function () {
			var html = '';
			$.each(_interventionRegistry.features, function (indexInRegistry, feature) {
				
				if (feature == undefined) {
					// i.e., we deleted it
					return;
				}
				
				// Calculate distance
				// !TODO This only calculates LineStrings for now
				var distance = sdca.calculateInterventionLength(feature);

				// Generate the HTML
				html += getSummaryListRow(indexInRegistry, feature.properties.intervention_name, feature.properties.mode, distance);
			});

			function getSummaryListRow(indexInRegistry, intervention_name, mode, distance) {
				return (`
				<div class="govuk-summary-list__row">
					<dt class="govuk-summary-list__key">
					${intervention_name}
					</dt>
					<dd class="govuk-summary-list__value">
					${distance}
					</dd>
					<dd class="govuk-summary-list__actions">
					<a class="govuk-link edit-intervention" data-sdca-registry-index="${indexInRegistry}" data-sdca-target-panel="draw-intervention" href="#">
						Change<span class="govuk-visually-hidden"> ${intervention_name} intervention</span>
					</a>
					</dd>
				</div>
				`);
			}

			// Update the table
			$('.user-interventions-list').html(html);
			
			// Change button state to secondary when the registry has a feature in it
			if ($.isEmptyObject (_interventionRegistry.features)) {
				$('button#add-intervention').html ('Add an intervention');
				$('button#add-intervention').removeClass ('govuk-button--secondary');
			} else {
				$('button#add-intervention').html ('Add another intervention');
				$('button#add-intervention').addClass ('govuk-button--secondary');
			}
		},


		calculateInterventionLength: function (feature) {
			var distance = '';
			if (feature.geometry.type == 'LineString') {
				var line = turf.lineString(feature.geometry.coordinates);
				distance = turf.length(line, { units: 'kilometers' }).toFixed(2) + ' kilometres';
			} else {
				// !TODO Add area calculation (and what to do for point?)
				distance = 'N/A';
			}

			return distance;
		},


		// Generate intervention accordion header HTML
		generateInterventionHeaderHtml: function (intervention, interventionIndex) {
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
						${sdca.generateInterventionRowHtml(intervention, interventionIndex)}
					</dl>
	
					</div>
					</div>
				`);
		},


		// Generate intervention row HTML
		generateInterventionRowHtml: function (intervention, interventionIndex) {
			return (
				`
			<div class="govuk-summary-list__row">
				<dt class="govuk-summary-list__key">
				${intervention.intervention_name}
				</dt>
				<dd class="govuk-summary-list__value">
				${intervention.intervention_description}
				</dd>
				<dd class="govuk-summary-list__actions">
					<a class="govuk-link" data-sdca-intervention-index="${interventionIndex}" data-sdca-target-panel="draw-intervention" href="#">
					Add to map<span class="govuk-visually-hidden"> a new ${intervention.intervention_name}</span>
					</a>
				</dd>
			</div>
			`);
		},


		// Convert normal case into python case. 
		convertLabelToPython: function (label) {
			// "High speed rail" => "high-speed-rail"
			return label.replace(/\s+/g, '-').toLowerCase();
		},


		// Enable filtering of interventions
		filterInterventions: function () {

			var currentSelectedRowIndex = -1;

			$('#filter-interventions').on('keyup', function (e) {
				// Once we type, expand all the accordion sections to facilitate discovery
				// GOV.UK design system has no programmatic access like jQuery or Bootstrap, so manually simulate click
				if ($('#interventions-accordion .govuk-accordion__show-all-text').first().text() == 'Show all sections') {
					$('#interventions-accordion .govuk-accordion__show-all-text').click();
				}

				var value = $(this).val().toLowerCase();

				// Filter rows
				$('.govuk-summary-list__row').filter(function () {
					$(this).toggle($(this).text().toLowerCase().indexOf(value) > -1);
				});

				// Hide any empty sections
				$('.govuk-accordion__section').filter(function () {
					$(this).toggle($(this).text().toLowerCase().indexOf(value) > -1);
				});

				// As we are searching for a new item, reset keyboard-selected row indes
				if (e.which !== 40 && e.which !== 38) {
					currentSelectedRowIndex = -1;
				}
			});


			// On key up/dey down, scroll up/down the filtered interventions list
			$(window).on('keydown', function (e) {

				// This applies to the search-for-interventions screen
				if (_currentPanelId !== 'search-for-intervention') {
					return;
				}

				// Get the available (filtered list) of govuk-summary-list__row(s)
				var rows = $('#interventions-accordion .govuk-summary-list__row:visible');

				// If we pressed enter, select this row
				if (e.which === 13) {
					$(rows[currentSelectedRowIndex]).find('.govuk-link').click();
				}

				// Actions for key up/down
				if (e.which === 40) { //key down
					currentSelectedRowIndex += 1;
				} else if (e.which === 38) { // key up
					currentSelectedRowIndex -= 1;
				}

				// Can't go below -1 or above max row
				if (currentSelectedRowIndex <= -1) {
					currentSelectedRowIndex = -1;
					$('#sdca-panel-container').scrollTo(0);
					return;
				}
				if (currentSelectedRowIndex >= $(rows).length) {
					currentSelectedRowIndex = $(rows).length - 1;
				}

				// Select the correct active row
				$(rows).removeClass('active');
				$(rows[currentSelectedRowIndex]).addClass('active');
				
				// Scroll selected row into view if it is off screen
				$('#sdca-panel-container').scrollTo($(rows[currentSelectedRowIndex]).first(), {
					offset: 200,
					duration: 500
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
								popupDescriptions: popupDescriptions
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

						// Also get the _draw Object
						_draw = layerviewer.getDrawObject();

						// Also get the _map Object
						_map = layerviewer.getMap();
					});
				});
			});
		},
		
		
		// Handler for drawn line
		handleDrawLine: function () {
			// At startup, get and store the drawing status proxy 
			_drawingHappening = layerviewer.getDrawingStatusObject();

			// Listener for LayerViewer _drawingHappening
			// Drawing panel UI controller based on drawing state in LayerViewer
			_drawingHappening.registerListener(function (drawingHappening) {
				if (drawingHappening) {
					$('.draw.line').hide();
					$('.edit-clear').show();
					$('.stop-drawing').show();
					$('.drawing-complete').hide();
				} else {
					$('.draw.line').show().text('Redo drawing').addClass('govuk-button--secondary');
					$('.stop-drawing').hide();
				}
			});

			// Only show the submit button once a geometry is present
			$('#geometry').on('change', function (e) {
				if ($('#geometry').val()) {
					$('.edit-clear').hide();
					$('#calculate').show();
					$('.drawing-complete').show();
				} else {
					$('#calculate, .edit-clear').hide();
					$('.drawing-complete').hide();
				}

				// Update the length
				var geojson = JSON.parse($('#geometry').val());
				var line = turf.lineString(geojson);
				var length = turf.length(line, { units: 'kilometers' }).toFixed(2);
				$('.distance').text(length + ' km');

			});

			// Stop drawing handler
			$('.stop-drawing').on('click', function () {
				// Stop the drawing
				layerviewer.finishDrawing();
			});


			// Run when the captured geometry value changes; this is due to the .trigger ('change') in layerviewer.drawing () as a result of the draw.create/draw.update events
			$('button#calculate').click(function (e) {
				// Disable button to prevent multiple clicks
				$('button#calculate').attr('disabled', 'disabled');

				// Do not resend data If we have not made any changes to the intervention registry
				if (_lastApiCallRegistryTimestamp == _interventionRegistry._timestamp) {
					sdca.switchPanel('view-results');
					return;
				}

				// Show the loading spinner
				$('.loading-spinner').css('display', 'inline-block');

				// Build payload payload
				var payload = JSON.stringify(_interventionRegistry);

				// Send the data to the API
				$.ajax({
					type: 'GET',
					url: '/api/v1/locations.json',
					dataType: 'json',
					data: {
						geojson: payload
					},
					success: function (data, textStatus, jqXHR) {
						_returnedApiData = data;
						sdca.showResults(data);
						sdca.switchPanel('view-results');

						// Register the last API call
						_lastApiCallRegistryTimestamp = _interventionRegistry._timestamp;
					},
					error: function (jqXHR, textStatus, errorThrown) {
						var responseBody = JSON.parse(jqXHR.responseText);
						alert('[Prototype development:]\n\nError:\n\n' + responseBody.error);
					},
					complete: function () {
						// Reset the loading spinner
						$('.loading-spinner').css('display', 'none');

						// Enable button to prevent multiple clicks
						$('button#calculate').removeAttr('disabled');
					}
				});
			});

			// Clear results when any drawing button clicked
			$('#drawing a').click(function () {

				// Fade out panel
				// #!# Needs to be reimplemented for new UI - should reset panel

				// Remove the geometries added to the map, if present
				layerviewer.eraseDirectGeojson('results');
			});
		},


		// Clear all drawings and drawing-associated layers
		clearDrawings: function () {
			// Clear all drawings
			if (_draw) {
				_draw.deleteAll();
			}
		},

		
		// Clear any Sdca layers from the map
		clearSdcaLayers: function () {
			// Delete any layers created from drawings
			var layers = _map.getStyle().layers;
			layers.forEach(function (layer) {
				if (layer.id.includes('sdca-')) {
					_map.removeLayer(layer.id);
					_map.removeSource(layer.id);
				}
			});
		},


		// Function to draw features on the map
		addFeaturesToMap: function (featureCollection) {

			if (!_map) {return;}

			// If there are no features, delete all sources, layers, then return
			if (!featureCollection || !featureCollection.features.length) {
				sdca.clearDrawings();
				sdca.clearSdcaLayers();
				return;
			}

			sdca.clearSdcaLayers();

			featureCollection.features.forEach((feature, index) => {

				var id = 'sdca-route-' + Number(index);

				// Get the information about the feature in order to add to popup HTML
				var interventionLexiconEntry = _interventions[feature._interventionTypeIndex];

				var popupHtml = `
				
				<dl class="govuk-summary-list">
					<div class="govuk-summary-list__row">
					<dt class="govuk-summary-list__key">
						Mode
					</dt>
					<dd class="govuk-summary-list__value">
						${interventionLexiconEntry.mode}
					</dd>
					</div>
					<div class="govuk-summary-list__row">
					<dt class="govuk-summary-list__key">
						Intervention
					</dt>
					<dd class="govuk-summary-list__value intervention-name">
						${interventionLexiconEntry.intervention_name}
					</dd>
					</div>
					<div class="govuk-summary-list__row">
					<dt class="govuk-summary-list__key">
						Total distance
					</dt>
					<dd class="govuk-summary-list__value distance">
						${sdca.calculateInterventionLength(feature)}
					</dd>
					</div>
				</dl>

				<button class="govuk-button edit-intervention" data-sdca-target-panel="draw-intervention" data-module="govuk-button" data-sdca-registry-index="${index}">
					Edit this intervention
				</button>
				`;

				_map.addSource(id, {
					'type': 'geojson',
					'data': feature
				});

				_map.addLayer({
					'id': id,
					'type': 'line',
					'source': id,
					'layout': {
						'line-join': 'round',
						'line-cap': 'round'
					},
					'paint': {
						'line-color': '#888',
						'line-width': 8
					}
				});
				_map.on('click', id, function (e) {
					var popup = new mapboxgl.Popup()
						.setLngLat(e.lngLat)
						.setHTML(popupHtml)
						.addTo(_map);

				});
			});
		},


		// Export or share the data returned from the API
		exportData: function () {
			$('.export-data').on('click', function () {
				// Return if no data
				if (!_returnedApiData) {
					console.log('There is no data to export yet. Have you pressed calculate?');
				}

				// Create payload
				var dataToExport = $(this).data('sdca-export');
				
				var dataExports = {
					all: _returnedApiData,
					pas2080: _returnedApiData.pas2080,
					timeseries: _returnedApiData.timeseries
				};

				let dataStr = JSON.stringify(dataExports[dataToExport]);
				let exportFileDefaultName = 'carbon-calculator-scheme-results.json';

				// Create downloadable element and click it
				var element = document.createElement('a');
				element.setAttribute('href', 'data:text/plain;charset=utf-8,' + encodeURIComponent(dataStr));
				element.setAttribute('download', exportFileDefaultName);
				element.setAttribute('target', '_blank');
				element.style.display = 'none';
				document.body.appendChild(element);
				element.click();
				document.body.removeChild(element);
			});


			$('#share-to-email').on('click', function () {
				// Return if no data
				if (!_returnedApiData) {
					console.log('There is no data to export yet. Have you pressed calculate?');
				}

				// Create payload
				// !TODO This will need to export any URL components
				var href = "mailto:?subject=Shared Digital Carbon Architecture http://dev.carbon.place";

				// Create downloadable element and click it
				var element = document.createElement('a');
				element.setAttribute('href', href);
				element.style.display = 'none';
				document.body.appendChild(element);
				element.click();
				document.body.removeChild(element);
			});
		},


		// Function to load the PAS 2080 labels
		pas2080Labels: function ()
		{
			// Get the interventions JSON file
			$.getJSON ('/lexicon/web_text/pas2080.json', function (pas2080) {
				$.each (pas2080, function (index, row) {
					_pas2080Labels[row.pas2080_code] = row.pas2080_name;
				});
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
				emissions_cumulative: 'Emissions (cumulative)'
			};
			var timeseries = sdca.htmlTable (data.timeseries, timeseriesLabels);
			
			// Create the demand change table
			var demandChangeLabels = {
				mode: 'Mode',
				before: 'Before',
				after: 'After',
				change: 'Change',
				changekm: 'Change in km',
				changeemissions: 'Change in emissions'
			};
			var demand_change = sdca.htmlTable (data.demand_change, demandChangeLabels);
			
			// Create the itemised emissions table
			var itemisedEmissionsLabels = {
				intervention_id: '#',
				intervention: 'Intervention',
				asset: 'Asset',
				item: 'Item',
				quantity: 'Quantity',
				A1_3: 'A1_3',
				A4: 'A4',
				A5: 'A5',
				B4: 'B4'
			};
			$.each (data.itemised_emissions, function (key, value) {
				data.itemised_emissions[key].quantity += ' ';
				data.itemised_emissions[key].quantity += value.quantity_units;
				delete data.itemised_emissions[key].quantity_units;
			});
			var itemised_emissions = sdca.htmlTable (data.itemised_emissions, itemisedEmissionsLabels);
			
			// Populate the results in the interface
			$('.netzero_compatible').text ((data.netzero_compatible[0] == 'yes' ? 'Net zero compatible' : 'Not net zero compatible'));
			if (data.netzero_compatible[0] == 'no') {
				$('.govuk-panel--confirmation').addClass ('failure');
			}
			$('.payback_time').text (data.payback_time[0] + ' years');
			$('.emissions_whole_life').text (layerviewer.number_format (data.emissions_whole_life[0]));
			$('.comments').text (data.comments[0]);
			$('.pas2080').append (pas2080);
			$('.timeseries').append (timeseries);
			$('.demand_change').append (demand_change);
			$('.itemised_emissions').append (itemised_emissions);
			
			// Define icons based on data value
			var layerConfig = {
				iconField: 'type',
				icons: {
					error: '/images/markers/red.svg',
					warning: '/images/markers/orange.svg',
					info: '/images/markers/blue.svg'
				}
			};
			
			// Add the geometries to the map
			var featureCollection = JSON.parse (data.geometry);
			layerviewer.addDirectGeojson (featureCollection, 'results', layerConfig);

			// Generate charts
			sdca.generateEmissionsByYearChart(data.timeseries);
			sdca.generateEmissionsByTypeChart(data.pas2080);
		},


		// Generate time series chart (y/y emissions)
		generateEmissionsByYearChart: function (data) {
			const ctx = document.getElementById('emissions-by-year-chart').getContext('2d');
			
			var labels = data.map((row) => row.year);
			var dataRows = data.map((row) => row.emissions_cumulative);

			new Chart(ctx, {
				type: 'line',
				data: {
					labels: labels,
					datasets: [
						{
							label: 'Cumulative emissions',
							data: dataRows,
							fill: {
								target: 'origin',
								//above: '#1d70b8'
							},
							borderColor: '#1d70b8',
							tension: 0.1
						}
					]
				}
			});
		},


		// Handle the radio to show the right chart
		handleChartRadios: function () {
			// Listen for change and choose the appropriate chart
			$('#emissions-by-type-select').on('change', function () {
				var selectedChartType = $('#emissions-by-type-select').val();
				$('.emissions-chart').hide();
				$('#emissions-by-type-chart-' + selectedChartType).show();
			});

			// At startup, select default
			$('#emissions-by-type-select').trigger('change');
		},


		// Generate emissions by type pie chart
		generateEmissionsByTypeChart: function (data)
		{
			// Substitute in labels from the web_text definitions
			if (!$.isEmptyObject (_pas2080Labels)) {
				$.each (data, function (index, row) {
					data[index].pas2080_name = _pas2080Labels[row.pas2080_code] + ' (' + row.pas2080_code + ')';
				});
			}

			// Chart labels
			var labels = data.map((row) => row.pas2080_name);

			// Define charts
			var charts = [
				{
					type: 'high',
					element: document.getElementById('emissions-by-type-chart-high').getContext('2d'),
					dataRows: data.map((row) => row.emissions_high)
				},
				{
					type: 'average',
					element: document.getElementById('emissions-by-type-chart-average').getContext('2d'),
					dataRows: data.map((row) => row.emissions)
				},
				{
					type: 'low',
					element: document.getElementById('emissions-by-type-chart-low').getContext('2d'),
					dataRows: data.map((row) => row.emissions_low)
				}
			];

			// Programatically generate 3 charts
			charts.forEach((chart) => {
				new Chart(chart.element, {
					type: 'doughnut',
					data: {
						labels: labels,
						datasets: [
							{
								label: 'PAS2080 type',
								data: chart.dataRows,
								fill: true,
								// from GOVUK colours https://design-system.service.gov.uk/styles/colour/
								backgroundColor: [
									'#1d70b8', // blue
									'#28a197', // tuorquoise
									'#85994b', // light-green
									'#b58840', // brown
									'#f47738', // orange
									'#f499be', // light-pink
									'#d53880', // pink
									'#912b88', // bright-purple
									'#6f72af', // light-purple
									'##5694ca' // light-blie
								],
								tension: 0.1
							}
						]
					},
					options: {
						animation: {
							duration: 0 // general animation time
						},
						hover: {
							animationDuration: 0 // duration of animations when hovering an item
						},
						responsiveAnimationDuration: 0, // animation duration after a resize
						plugins: {
							legend: {
								position: 'right'
							}
						}
					}
				});
			});
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

