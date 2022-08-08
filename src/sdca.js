// SDCA implementation code

/*jslint browser: true, white: true, single: true, for: true, unordered: true, long: true, getset: true, this: true, variable: true */
/*global $, alert, console, window, osm2geo, layerviewer, mapboxgl, jQuery, turf, Chart */

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
			latitude: 54.383,
			longitude: -4.051,
			zoom: 5.4
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
	
	// API layer definitions
	var _apiLayers = {
		
		trafficcounts: {
			_category: 'Transport data',
			name: 'Traffic counts',
			description: 'AADF (Annual Average Daily Flows) data for all main roads in the UK',
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
				  '<p>Count Point {properties.id} on <strong>{properties.road}</strong>, a {properties.road_type}.</p>'
			//	+ 'Located in {properties.wardname} in {properties.boroughname}<br />'
				+ '[macro:yearstable({properties.minyear}, {properties.maxyear}, cycles;p2w;cars;buses;lgvs;mgvs;hgvs;all_motors;all_motors_pcu, Cycles;P2W;Cars;Buses;LGVs;MGVs;HGVs;Motors;Motor PCU)]'
				+ '<p><strong>{properties.maxyear} PCU breakdown -</strong> Cycles: {properties.cycle_pcu}, P2W: {properties.p2w_pcu}, Cars: {properties.car_pcu}, Buses: {properties.bus_pcu}, LGVs: {properties.lgv_pcu}, MGVs: {properties.mgv_pcu}, HGVs: {properties.hgv_pcu}</p>'
				+ '</div>'
		},
		
		planningapplications: {
			_category: 'Planning system data',
			name: 'Planning applications',
			description: 'Planning applications (large/medium) submitted to local authorities around the UK.',
			apiCall: 'https://www.planit.org.uk/api/applics/geojson',
			apiFixedParameters: {
				pg_sz: 100,
				limit: 100,
				select: 'location,description,address,app_size,app_type,app_state,uid,area_name,start_date,url',
				app_size: 'Large,Medium',
				app_state: 'Undecided,Permitted,Conditions,Rejected'
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
	
	// Sublayer parameters, to be merged in
	var _sublayerParameters = {};
	
	/* Panel state */
	var _panelState = {
		startupId: 'design-scheme',		// Panel to show at startup
		isTemp: false,					// Whether we have a temp (i.e. data layers) panel in view
		currentId: null,				// Current panel in view
		previousId: null				// Previous panel; used when exiting a temp panel
	};
	
	/* Charts */
	var _charts = []; // Store charts for accessing/updating data/destroying
	
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
	};
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
	};
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
	};
	
	/* Labels */
	var _pas2080Labels = {};
	
	/* API state */
	var _lastApiCallRegistryTimestamp = null; // Store the last time we called the API, for comparison to the registry timestamp
	var _returnedApiData = null; // Store API returned data for user export purposes

	/* Drawing and map */
	var _drawingHappening = null; // Store the LayerViewer _drawingHappening Object, which is observable in order to trigger SDCA UI changes when LayerViewer internal drawing state changes
	var _draw = false; // Store the LayerViewer _draw Object
	var _map = false; // Store the Layerviewer _map Object
	var _markers = []; // Access MapboxGL markers

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
			
			// Keep drawn items on top after layer additions
			_settings.forceTopLayers = ['sdca-lines', 'sdca-points'];
			
			// Load layers from datasets file, and then initialise layers
			sdca.loadDatasets ();
			
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
			sdca.handleResetInterface ();
			sdca.exportIntervention ();

			// Map state controller
			sdca.mapState ();

			sdca.exportData ();
			
			sdca.pas2080Labels ();

			// LayerViewer initialisation is wrapped within loadDatasets
		},


		// Controller to manage map state
		mapState: function ()
		{
			_mapState.registerListener(function (state) {
				switch (state) {
					case 'view-all':
						// Send our user added interventions to LayerViewer for display
						sdca.addFeaturesToMap(_interventionRegistry);

						// Clear any drawings as we are not in edit or new mode
						sdca.clearDrawings();

						// Make sure we are not editing anything
						_currentlyEditingRegistry.index = -1;

						// Only show the calculate button if we have at least one intervention
						$('#calculate').toggle(_interventionRegistry.features.length > 0);

						break;

					case 'edit':

						// Adjust the UI drawing buttons
						$('.draw').text('Redo drawing');
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
						$('.draw').text('Start new drawing on the map').removeClass('govuk-button--secondary');
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
					$('.edit-draw').show ();
				} else {
					$('#delete-intervention').hide ();
				}
			});

			// At startup, set map state as view-all
			_mapState.state = 'view-all';
		},


		// Panel management
		managePanels: function ()
		{
			// If a button is clicked with a target panel, go to that panel
			$('body').on('click', 'button, a', function () {
				var panel = $(this).data('sdca-target-panel');
				if (panel !== undefined) {
					// Are we currently exiting a temporary panel (i.e. layer viewer)?
					if (_panelState.isTemp) {
						sdca.switchPanel (_panelState.previousId);
					} else {
						sdca.switchPanel (panel);
					}
				}
			});

			// Data layers panel: show active state
			$('#explore-data-layers').on('click', function () {
				$(this).toggleClass('selected');
				
				if ($(this).hasClass('selected')) {
					$(this).html ('Hide data layers panel &#9650;');
				} else {
					$(this).html ('Explore data layers &#9660;');
				}
			});

			// At startup, show the desired panel
			sdca.switchPanel (_panelState.startupId);
		},


		// Panel switching
		switchPanel: function (panelToShow)
		{
			// Save the previous panel
			_panelState.previousId = _panelState.currentId;

			// Only show the desired sdca panel
			$('.sdca-panel').hide();
			$('#' + panelToShow).show();

			// Is this panel a temporary one? Set status
			_panelState.isTemp = ($('#' + panelToShow).data('sdca-is-temp-panel') ? true : false);
			
			// Add autofocus if required
			$('.autofocus').focus ();
			
			// Save the panel as current
			_panelState.currentId = panelToShow;

			// Update the map state
			if (panelToShow !== 'draw-intervention') {
				_mapState.state = 'show-all';
			}
		},


		// Handle resetting the tool
		handleResetInterface: function ()
		{
			// Reset options shouldn't be available at startup
			$('#start-again').hide();

			$('#reset-tool').on('click', function () {
				// Wipe the intervention registry
				_interventionRegistry = {
					_timestamp: null,
					type: 'FeatureCollection',
					features: []
				};

				// Run the map draw to empty the map
				sdca.addFeaturesToMap(_interventionRegistry);

				// Reset the geometry field
				$('#geometry').val('');

				// Ensure the calculate button is not visible
				$('#calculate').hide();

				// Remove all user interventions to reflect empty registry
				sdca.updateUserInterventionList();

				// Remove the geometries added to the map, if present
				layerviewer.eraseDirectGeojson('resultWarnings');
			});
		},


		// User can click on button to save intervention design as JSON file
		exportIntervention: function ()
		{
			$('#save-interventions').on('click', function () {
				let dataStr = JSON.stringify(_interventionRegistry, null, '\t');
				let exportFileName = 'carbon-calculator-scheme' + sdca.timestampSuffix () + '.geojson';

				// Create downloadable element and click it
				var element = document.createElement('a');
				element.setAttribute('href', 'data:text/plain;charset=utf-8,' + encodeURIComponent(dataStr));
				element.setAttribute('download', exportFileName);
				element.setAttribute('target', '_blank');
				element.style.display = 'none';
				document.body.appendChild(element);
				element.click();
				document.body.removeChild(element);
			});
		},
		
		
		// Helper function to create a timestamp suffix for downloads
		timestampSuffix: function ()
		{
			// Get the date
			var d = Date.now ();
			d = new Date (d);
			
			// Format string
			var timestampSuffix = '_' + d.getFullYear () + ('0' + (d.getMonth () + 1)).slice (-2) + ('0' + d.getDate ()).slice (-2) + '-' + d.getHours () + d.getMinutes () + d.getSeconds ();
			return timestampSuffix;
		},
		
		
		// UI management for GIS file upload
		handleFileUpload: function ()
		{
			// By default, the file upload button is disabled
			$('#submit-gis-file').attr('disabled', 'disabled').addClass('govuk-button--disabled');

			// Once we have uploaded a file, enable the button
			$('input#gis-file').on('change', function () {
				$('#submit-gis-file').removeAttr('disabled').removeClass('govuk-button--disabled');

				// Hide the error messages
				$('#gis-upload-form').removeClass('govuk-form-group--error');
				$('#gis-file-error').hide();
			});

			// By default, the error message should be hidden 
			$('#gis-file-error').hide();

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
					sdca.addFeaturesToMap(_interventionRegistry);

					// Update timestamp
					_interventionRegistry._timestamp = Date.now();

					// Reset the geometry field
					$('#geometry').val('');

					// Update the list of interventions with the new data
					sdca.updateUserInterventionList();

					// Fit bounds to uploaded GeoJSON
					_map.fitBounds(turf.bbox(fileContent), { padding: 30 });

					// Did we manage to parse any interventions?
					// For now, loop through the FeatureCollection.features and remove any without any properties
					// Having no properties means we can't associate the GeoJSON coordinates with any kind of intervention
					var corruptFileTrigger = false;
					$.each(_interventionRegistry.features, function (indexInArray, feature) {
						if (Object.keys(feature.properties).length === 0) {
							// We have at least one feature without any discernable properties
							corruptFileTrigger = true;

							// Delete it, if further on in development we decide to ignore this
							sdca.deleteInterventionFromRegistry(indexInArray);
						}
					});

					// If there was a problem with at least one of the features, display error message
					if (corruptFileTrigger) {
						// Update UI to display error message
						$('#gis-upload-form').addClass('govuk-form-group--error');
						$('#gis-file-error').show();
					} else {
						// Reset error UI
						$('#gis-upload-form').removeClass('govuk-form-group--error');
						$('#gis-file-error').hide();

						// Show the results of the upload
						sdca.switchPanel('design-scheme');
					}

				};
				reader.readAsText(importedFile);
			});
		},


		// Get the different intervention types and populate them
		retrieveInterventions: function ()
		{
			// Get the interventions JSON file
			$.getJSON('/lexicon/data_tables/interventions.json', function (interventions) {
				_interventions = interventions;
				sdca.populateInterventions();
			});
		},


		// Populate interventions in hTML
		populateInterventions: function ()
		{
			var mode = ''; // i.e. High speed rail

			$('#interventions-accordion').empty();

			// Iterate through each intervention
			$.each(_interventions, function (interventionIndex, intervention) {

				// Save the python-case intervention mode (i.e. high-speed-rail)
				mode = sdca.convertLabelToMoniker (intervention.mode);

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
		},


		// Code to enter editing mode for an intervention
		editIntervention: function ()
		{
			// When on the editing screen, hide the 'edit drawing' button once clicked
			$('.edit-draw').on ('click', function () {
				$('.edit-draw').hide ();
			});

			$('body').on('click', '.edit-intervention', function () {
				
				// Set the map state to trigger UI changes
				_mapState.state = 'edit';
				
				// Set the registry index to the intervention we want to edit
				_currentlyEditingRegistry.index = $(this).data('sdca-registry-index');

				// Pull the intervention type and set that so we know what we are editing
				var interventionObject = _interventionRegistry.features[_currentlyEditingRegistry.index];
				_currentInterventionType.index = interventionObject._interventionTypeIndex;

				// Enable editing of drawn objects
				// This saves a copy of the feature we want to edit, deleted the original feature from the intervention registry, and adds the saved version as a new drawing.
				$('body').on('click', '.edit-draw', function () {
					// Save a copy of the feature we are editing
					var interventionToBeEdited = _interventionRegistry.features[_currentlyEditingRegistry.index];
					
					// Remove that intervention from the map/registry
					sdca.deleteInterventionFromRegistry(_currentlyEditingRegistry.index);

					// Update timestamp
					_interventionRegistry._timestamp = Date.now();

					// Simulate new drawing mode
					_currentlyEditingRegistry.index = -1;

					// Clear the #geometry field, used for storing temp draw coordinates
					$('#geometry').val('');

					// Update the map features (with the removed feature)
					sdca.addFeaturesToMap(_interventionRegistry);

					// Add the saved copy of the feature to be edited to the map as a new drawing
					_draw.add(interventionToBeEdited);

					// Get the featureId of the drawing, and set direct_select mode (i.e. the best edit mode)
					var featureId = _draw.getAll().features.pop().id;
					_draw.changeMode ('direct_select', {featureId: featureId});
				});
			});
		},


		// Code for handling adding, registering, removing interventions
		trackInterventions: function ()
		{
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
					// Enable the correct drawing mode
					$('.draw').toggleClass('point', _interventions[_currentInterventionType.index].geometry === 'point');
					$('.draw').toggleClass('line', _interventions[_currentInterventionType.index].geometry === 'line');

					// Update the UI
					$('.intervention-mode').text(_interventions[index].mode);
					$('.intervention-name').text(_interventions[index].intervention_name);
					$('.intervention-description').text(_interventions[index].intervention_description);

					// Only show distance if we are drawing a line
					$('.distance-row').toggle(_interventions[_currentInterventionType.index].geometry === 'line');
				}
			});

			// Update the intervention list at startup
			sdca.updateUserInterventionList();
		},


		// Handler for the delete intervention button
		// !TODO needs to clear any drawings from map
		deleteIntervention: function ()
		{
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
					sdca.deleteInterventionFromRegistry(_currentlyEditingRegistry.index);
				}

				// Update timestamp
				_interventionRegistry._timestamp = Date.now();

				// Done editing, set currently editing registry as false
				_currentlyEditingRegistry.index = -1;

				// Regenerate user intervention list
				sdca.updateUserInterventionList();

				// Go home
				sdca.switchPanel('design-scheme');
			});
		},


		// Delete an intervention from the registry
		deleteInterventionFromRegistry: function (interventionIndex)
		{
			// The following two steps are a way around JavaScript now having a proper ArrayItem.remove() method
			// Empty the array at the correct index
			delete _interventionRegistry.features[interventionIndex];

			// Create a new clean array without the undefined index and push it
			var cleanedInterventionArray = [];
			$.each(_interventionRegistry.features, function (indexInArray, feature) {
				if (feature !== undefined) {
					cleanedInterventionArray.push(feature);
				}
			});
			_interventionRegistry.features = cleanedInterventionArray;
		},


		// Add intervention to registry/main page
		registerIntervention: function ()
		{
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
					id: (Object.keys (_interventionRegistry.features).length),		// I.e. allocate next, so if 2 features (0, 1), next will be 2
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

				// Remove the temporary marker, it will be replaced by a GeoJSON circle
				$.each(_markers, function (indexInArray, marker) { 
					 marker.remove();
				});

			});
		},


		// Update the list of user interventions
		updateUserInterventionList: function ()
		{
			var html = '';
			$.each(_interventionRegistry.features, function (indexInRegistry, feature) {
				
				if (feature == undefined) {
					// i.e., we deleted it
					return;
				}
				
				// Calculate distance
				// !TODO This only calculates LineStrings for now
				var distance = sdca.calculateInterventionLength (feature);

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
			if ($.isEmptyObject(_interventionRegistry.features)) {
				$('button#add-intervention').html('Add an intervention');
				$('button#add-intervention').removeClass('govuk-button--secondary');
			} else {
				$('button#add-intervention').html('Add another intervention');
				$('button#add-intervention').addClass('govuk-button--secondary');
			}

			// If there are no interventions, hide the Start again controls
			if (!_interventionRegistry || !_interventionRegistry.features.length) {
				$('#start-again').hide();
			} else {
				$('#start-again').show();
			}
		},


		calculateInterventionLength: function (feature)
		{
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
		generateInterventionHeaderHtml: function (intervention, interventionIndex)
		{
			var mode = sdca.convertLabelToMoniker (intervention.mode);
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
		generateInterventionRowHtml: function (intervention, interventionIndex)
		{
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


		// Convert normal case into kebab case, e.g. "High speed rail" => "high-speed-rail"
		convertLabelToMoniker: function (label)
		{
			return label.replace (/\s+/g, '-').toLowerCase ();
		},


		// Enable filtering of interventions
		filterInterventions: function ()
		{
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
				if (_panelState.currentId !== 'search-for-intervention') {
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
						
						// Start an ordered list of layer definitions
						var layers = [];
						
						// Add each dataset
						var type;
						var popupLabels;
						var popupDescriptions;
						var fieldname;
						var layer;
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
							layer = {
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
								layer.vector.layer.paint = styles[dataset.id];
							}
							
							// Add the ID and category
							layer.id = dataset.id;
							layer._category = dataset.category;
							layer.title = dataset.title;
							layer.description = dataset.description;
							
							// Merge in sublayer parameters if present for this layer
							if (_sublayerParameters.hasOwnProperty (dataset.id)) {
								$.each (_sublayerParameters[dataset.id], function (key, value) {
									layer[key] = value;
								});
							}
							
							// Register this layer
							layers.push (layer);
						});
						
						// Merge in API-based layers
						$.each (_apiLayers, function (layerId, layer) {
							layer.id = layerId;
							layer.title = layer.name;
							layers.push (layer);
						});
						
						// Iterate through the layers to create the accordion
						var categoryMoniker;
						$.each (layers, function (index, layer) {
							
							// Save the category, python-case
							categoryMoniker = sdca.convertLabelToMoniker (layer._category);
							
							// If we already have an accordion header for this
							if ($('#data-layer-' + categoryMoniker).length > 0) {

								// Append a new list row
								$('#data-layers-accordion-content-' + categoryMoniker + ' .govuk-checkboxes').append(
									sdca.generateLayerAccordionRowHtml (layer)
								);
							} else {
			
								// Otherwise, append a new section
								$('#data-layers-accordion').append (
									sdca.generateLayerAccordionHeaderHtml (layer)
								);
							}
						});
						
						// Create sublayer controls
						sdca.createSublayerControls (layers, fields);
						
						// Run the layerviewer for these settings and layers
						var layersById = {};
						var layerId;
						$.each (layers, function (index, layer) {
							delete layer._category;		// Not needed by LayerViewer
							layersById[layer.id] = layer;
						});
						layerviewer.initialise (_settings, layersById);
						
						// Drawing handlers
						sdca.handleDrawing ();
						
						// Also get the _draw Object
						_draw = layerviewer.getDrawObject ();

						// Also get the _map Object
						_map = layerviewer.getMap ();

						// Initialise the drawing layer
						sdca.drawingLayerInit ();

						// Initialise the accordion with the new HTML
						window.GOVUKFrontend.initAll ();
					});
				});
			});
		},
		
		
		// Function to create and handle sublayer controls
		createSublayerControls: function (layers, fields)
		{
			// Deal with each layer that has a sublayer parameter
			var selectNameId;
			var sublayerControlHtml;
			var selectedLayerId;
			var checkboxId;
			$.each (layers, function (index, layer) {
				if (layer.sublayerParameter) {
					
					// Create the dropdown
					selectNameId = layer.id + '_type';
					sublayerControlHtml = sdca.sublayerDropdown (selectNameId, fields[layer.id]);
					
					// Attach the dropdown to the HTML
					$('#layercontrol_' + layer.id).append (sublayerControlHtml);
					
					// On select, reload layer
					// #!# This would ideally be native to the layerViewer, but hard to generalise
					$('body').on ('change', '#' + selectNameId, function (event) {
						selectedLayerId = event.target.id.replace ('_type', '');
						checkboxId = 'show_' + selectedLayerId;
						if ($('#' + checkboxId).is (':checked')) {
							$('#' + checkboxId).click ();
							$('#' + checkboxId).click ();
						}
					});
					
					// Treat sublayer change as implicit enable
					$('body').on ('change', '#' + selectNameId, function (event) {
						selectedLayerId = event.target.id.replace ('_type', '');
						checkboxId = 'show_' + selectedLayerId;
						if ($('#' + checkboxId).not (':checked').length) {
							$('#' + checkboxId).click ();	// Also triggers event
						}
					});
				}
			});
		},
		
		
		// Create a sublayer dropdown
		sublayerDropdown: function (selectNameId, fields)
		{
			// Generate the HTML
			var html = '<div class="filters">';
			html += '<p>';
			html += 'Show map styles for: ';
			html += '<select name="' + selectNameId + '" id="' + selectNameId + '">';
			$.each (fields, function (index, field) {
				if (field.hasOwnProperty ('selectable') && !field.selectable) {return; /* i.e. continue */}	// If marked as not selectable, skip
				html += '<option value="' + field.col_name + '">' + sdca.htmlspecialchars (field.name) + '</option>';
			});
			html += '</select>';
			html += '</p>';
			html += '</div>';
			
			// Return the HTML
			return html;
		},
		
		
		// Generate data layer accordion header HTML
		generateLayerAccordionHeaderHtml: function (layer)
		{
			var layerMoniker = sdca.convertLabelToMoniker (layer._category);
			return (`
				<div class="govuk-accordion__section" id="data-layer-${layerMoniker}">
					<div class="govuk-accordion__section-header">
					<h2 class="govuk-accordion__section-heading">
						<span class="govuk-accordion__section-button" id="data-layers-accordion-heading-${layerMoniker}">
						${layer._category}
						</span>
					</h2>
					</div>
					<div id="data-layers-accordion-content-${layerMoniker}" class="govuk-accordion__section-content"
					aria-labelledby="data-layers-accordion-content-${layerMoniker}">
					<div class="govuk-checkboxes govuk-checkboxes--small" data-module="govuk-checkboxes">
						${sdca.generateLayerAccordionRowHtml(layer)}
					</div>
					</div>
				</div>
				`);
		},


		// Generate intervention row HTML
		generateLayerAccordionRowHtml: function (layer)
		{
			var uniqueDescription = layer.title !== layer.description;
			return (
				`
					<div class="govuk-checkboxes__item">
						<input class="govuk-checkboxes__input" id="show_${layer.id}" name="show[]" type="checkbox"
								value="${layer.id}">
						<label class="govuk-label govuk-checkboxes__label" for="show_${layer.id}">
							${layer.title}
						</label>
						${uniqueDescription ?
							`<div class="govuk-hint govuk-checkboxes__hint">
										${layer.description}
									</div>`
							:
							''
						}
					</div>
			`);
		},


		// Handler for drawn line
		handleDrawing: function ()
		{
			// At startup, get and store the drawing status proxy 
			_drawingHappening = layerviewer.getDrawingStatusObject();
			
			// Listener for LayerViewer _drawingHappening
			// Drawing panel UI controller based on drawing state in LayerViewer
			_drawingHappening.registerListener(function (drawingHappening) {
				if (drawingHappening) {
					// Update the UI
					$('.draw').hide();
					$('.edit-clear').show();
					$('.stop-drawing').show();
					$('.drawing-complete').hide();
				} else {
					$('.draw').show().text('Redo drawing').addClass('govuk-button--secondary');
					$('.stop-drawing').hide();
				}
			});

			// Only show the submit button once a geometry is present
			$('#geometry').on('change', function (e) {
				if ($('#geometry').val()) {
					$('.edit-clear').hide();
					$('.drawing-complete').show();
				} else {
					$('.edit-clear').hide();
					$('.drawing-complete').hide();
				}

				// Update the length
				if (_interventions[_currentInterventionType.index].geometry === 'line') {
					var geojson = JSON.parse($('#geometry').val());
					var line = turf.lineString(geojson);
					var length = turf.length(line, { units: 'kilometers' }).toFixed(2);
					$('.distance').text(length + ' km');
				}

				// Add a marker if we added a point
				if (_interventions[_currentInterventionType.index].geometry === 'point') {
					_markers.push (new mapboxgl.Marker()
					.setLngLat(JSON.parse($('#geometry').val()))
					.addTo(_map));
				}
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

					// Reenable calculate button (it was disabled to prevent multiple clicks)
					$('button#calculate').removeAttr('disabled');

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
				layerviewer.eraseDirectGeojson('resultWarnings');
			});
		},


		// Function to initalise the drawing layer
		drawingLayerInit: function ()
		{
			// When ready
			_map.on ('load', function () {
				
				// Get the interventions JSON file
				$.getJSON ('/lexicon/styles/modes.json', function (drawingStyles) {
					
					// Ensure integer strings are proper ints
					// #!# This is required because csvToJson's conversion from CSV to JSON ends up quoting
					drawingStyles = sdca.fixIntStrings (drawingStyles);
					
					// Create the source
					_map.addSource ('sdca', {
						'type': 'geojson',
						'data': {type: 'FeatureCollection', features: []}	// Initally empty GeoJSON
					});
					
					// Create the layer renderers
					_map.addLayer ({
						'id': 'sdca-lines',
						'type': 'line',
						'source': 'sdca',
						'layout': {
							'line-join': 'round',
							'line-cap': 'round'
						},
						'paint': {
							'line-color': sdca.buildMatchExpression(drawingStyles, 'mode', 'line-color', 'black'),
							'line-width': sdca.buildMatchExpression(drawingStyles, 'mode', 'line-width', 5)
						},
						'filter': ['==', '$type', 'LineString']
					});
					_map.addLayer({
						'id': 'sdca-points',
						'type': 'circle',
						'source': 'sdca',
						'paint': {
							'circle-radius': 10,
							'circle-color': '#f499be'
						},
						'filter': ['==', '$type', 'Point']
					});
					
					// Enable popups
					var layerVariants = ['sdca-lines', 'sdca-points'];			// #!# Soon can replace this with https://github.com/mapbox/mapbox-gl-js/pull/11114
					$.each (layerVariants, function (index, layerId) {
						_map.on ('click', layerId, function (e) {
							new mapboxgl.Popup ()
								.setLngLat (e.lngLat)
								.setHTML (sdca.interventionPopupHtml (e.features[0]))
								.addTo (_map);
						});
					});
					
					// Change the cursor to a pointer when the mouse is over a feature, and change back when leaving
					$.each (layerVariants, function (index, layerId) {
						_map.on ('mouseenter', layerId, function () {
							_map.getCanvas().style.cursor = 'pointer';
						});
						_map.on ('mouseleave', layerId, function () {
							_map.getCanvas().style.cursor = '';
						});
					});
				});
			});
		},
		
		
		// Helper function to build a Mapbox GL match expression; see last example at: https://www.lostcreekdesigns.co/writing/how-to-style-map-layers-in-mapbox-gl-js/
		buildMatchExpression: function (styles, datasourceField, styleField, fallbackValue)
		{
				// Build the line colour expression, specifying a match against a particular datasource field
				var expression = [];
				expression.push ('match');
				expression.push (['get', datasourceField]);
				
				// Add each pair
				$.each (styles, function (index, style) {
					expression.push (style.mode);
					expression.push (style[styleField]);
				});
				
				// Add the fallback value
				expression.push (fallbackValue);
				
				// Return the expression
				return expression;
		},
		
		
		// Intervention popup HTML
		interventionPopupHtml: function (feature)
		{
			// Create the HTML
			var html = `
				<dl class="govuk-summary-list">
					<div class="govuk-summary-list__row">
					<dt class="govuk-summary-list__key">
						Mode
					</dt>
					<dd class="govuk-summary-list__value">
						${feature.properties.mode}
					</dd>
					</div>
					<div class="govuk-summary-list__row">
					<dt class="govuk-summary-list__key">
						Intervention
					</dt>
					<dd class="govuk-summary-list__value intervention-name">
						${feature.properties.intervention_name}
					</dd>
					</div>
					<div class="govuk-summary-list__row">
					<dt class="govuk-summary-list__key">
						Total distance
					</dt>
					<dd class="govuk-summary-list__value distance">
						${sdca.calculateInterventionLength (feature)}
					</dd>
					</div>
				</dl>
				<!--
				<button class="govuk-button edit-intervention" data-sdca-target-panel="draw-intervention" data-module="govuk-button" data-sdca-registry-index="{feature.id}">
					Edit this intervention
				</button>
				-->
			`;
			
			// Return the HTML
			return html;
		},
		
		
		// Helper function to fix int strings to proper ints in a two-dimensional array
		fixIntStrings: function (dataset)
		{
			// Loop through each row
			$.each (dataset, function (index, row) {
				$.each (row, function (field, value) {
					if (value.match (/^\d+$/)) {
						dataset[index][field] = parseInt (value);
					}
				});
			});
			
			// Return the modified result
			return dataset;
		},
		
		
		// Clear all drawings and drawing-associated layers
		clearDrawings: function ()
		{
			// Clear all drawings
			if (_draw) {
				_draw.deleteAll();
			}
		},


		// Function to draw features on the map
		addFeaturesToMap: function (featureCollection)
		{
			if (!_map) { return;}

			// If the feature collection is empty, clear any embryonic drawings, and return
			if (!featureCollection) {
				sdca.clearDrawings();
				return;
			}

			// Update the source
			if (_map.getSource('sdca')) {
				_map.getSource('sdca').setData (featureCollection);
			}
		},
		
		
		// Export or share the data returned from the API
		exportData: function ()
		{
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

				let dataStr = JSON.stringify(dataExports[dataToExport], null, '\t');
				let exportFileDefaultName = 'carbon-calculator-scheme-results' + sdca.timestampSuffix () + '.json';

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
				var url = window.location.protocol + '//' + window.location.hostname + '/';
				var href = "mailto:?subject=Shared Digital Carbon Architecture " + url;
				
				// Create downloadable element and click it
				var element = document.createElement('a');
				element.setAttribute('href', href);
				element.style.display = 'none';
				document.body.appendChild(element);
				element.click();
				document.body.removeChild(element);
			});
		},


		// Function to load the BS EN 17472 labels
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
		// #!# Labels in this section should come from new data_dictionary tables instead of being hard-coded here
		showResults: function (data)
		{
			// Create the PAS2080 table
			var pas2080Labels = {
				pas2080_code: 'Code',
				emissions: 'Emissions (tonnes CO₂e)',
				emissions_high: 'High (tonnes CO₂e)',
				emissions_low: 'Low (tonnes CO₂e)',
				confidence: 'Confidence',
				notes: 'Notes'
			};
			var pas2080 = sdca.htmlTable (data.pas2080, pas2080Labels);
			
			// Create the time series table
			var timeseriesLabels = {
				year: 'Year',
				emissions: 'Emissions',
				emissions_low: 'Emissions (worst case)',
				emissions_high: 'Emissions (best case)',
				emissions_cumulative: 'Cumulative emissions',
				emissions_cumulative_low: 'Cumulative emissions (worst case)',
				emissions_cumulative_high: 'Cumulative emissions (best case)'
			};
			var timeseries = sdca.htmlTable (data.timeseries, timeseriesLabels);
			
			// Create the demand change table
			var demandChangeLabels = {
				mode: 'Mode',
				before: 'Before (daily trips)',
				after_average: 'After - average (daily trips)',
				after_high: 'After - high (daily trips)',
				after_low: 'After - low (daily trips)',
				change: 'Change',
				changekm: 'Change in km',
				changeemissions_low: 'Change in emissions - low (tonnes CO₂e per year)',
				changeemissions_high: 'Change in emissions - high (tonnes CO₂e per year)',
				changeemissions_average: 'Change in emissions - average (tonnes CO₂e per year)',
				itemised_emissions: 'Itemised emissions (kg CO₂e)'
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
			if (data.netzero_compatible[0] == 'yes') {
				$('.govuk-panel--confirmation').removeClass ('failure');
//				$('.netzero_compatible').text ('Net zero compatible');
			} else {
				$('.govuk-panel--confirmation').addClass ('failure');
//				$('.netzero_compatible').text ('Not net zero compatible');
			}
			
			// Check if API returned string 'Never' or number
			if (isNaN (data.payback_time[0])) {
				$('.payback_time').text (layerviewer.number_format (data.payback_time[0]));
			} else {
				$('.payback_time').text (layerviewer.number_format (data.payback_time[0]) + ' ' + (data.payback_time[0] == 1  ? 'year' : 'years'));
			}
			$('.emissions_whole_life').html (layerviewer.number_format (data.emissions_whole_life[0]) + ' tonnes CO<sub>2</sub>e');
			$('.upfront_carbon').html (layerviewer.number_format(data.emissions_upfront[0]) + ' tonnes CO<sub>2</sub>e');
			$('.emissions_whole_life_benefits').html (layerviewer.number_format(data.emissions_whole_life_benefits[0]) + ' tonnes CO<sub>2</sub>e');
			$('.comments').text (data.comments[0]);
			$('.pas2080').html (pas2080);
			$('.timeseries').html (timeseries);
			$('.demand_change').html (demand_change);
			$('.itemised_emissions').html (itemised_emissions);
			
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
			var featureCollection = JSON.parse(data.geometry);
			layerviewer.addDirectGeojson(featureCollection, 'resultWarnings', layerConfig);

			// Generate charts
			// Destroy any existing chart objects (i.e. if we are re-running an API call)
			$.each(_charts, function (indexInArray, chart) {
				chart.chart.destroy();
			});
			sdca.generateEmissionsByYearChart(data.timeseries);
			sdca.generateEmissionsByTypeChart(data.pas2080);
		},


		// Generate time series chart (y/y emissions)
		generateEmissionsByYearChart: function (data)
		{
			const ctx = document.getElementById('emissions-by-year-chart').getContext('2d');

			var labels = data.map((row) => row.year);

			var chartObject = {
				name: 'emissions-by-year',
				chart:
					new Chart (ctx, {
						type: 'line',
						data: {
							labels: labels,
							datasets: [
								{
									label: 'Cumulative emissions',
									data: data.map((row) => row.emissions_cumulative),
									borderColor: '#1d70b8',
									tension: 0.1
								},
								{
									label: 'Cumulative emissions (worst case)',
									data: data.map((row) => row.emissions_cumulative_low),
									borderColor: '#f47738',
									tension: 0.1
								},
								{
									label: 'Cumulative emissions (best case)',
									data: data.map((row) => row.emissions_cumulative_high),
									borderColor: '#00703c',
									tension: 0.1
								}
							]
						},
						options: {
							plugins: {
								tooltip: {
									callbacks: {
										label: function (item) {
											return item.label + ' tonnes CO₂e';
										}
									}
								}
							},
							scales: {
								y: {
									title: {
										display: true,
										text: 'tonnes CO₂e'
									}
								}
							}
						}
					})
			};
			_charts.push(chartObject);
		},


		// Handle the radio to show the right chart
		handleChartRadios: function ()
		{
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
			var chartObject;
			charts.forEach (function (chart) {
				chartObject = {
					name: chart.type,
					chart: new Chart(chart.element, {
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
										'#d4351c', // red 
										'#85994b', // light-green
										'#b58840', // brown
										'#ffdd00', // yellow
										'#f47738', // orange
										'#0b0c0c', // black
										'#f499be', // light-pink
										'#d53880', // pink
										'#b1b4b6', // mid-grey
										'#912b88', // bright-purple
										'#6f72af', // light-purple
										'#5694ca', // light-blue
										'#00703c', // green
										'#f3f2f1', // light grey
										'#ffffff'  // white
									],
									tension: 0.1
								}
							]
						},
						options: {
							aspectRatio: 2,
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
								},
								tooltip: {
									callbacks: {
										label: function (item) {
											return item.label + ': ' + item.parsed + ' tonnes CO₂e';
										}
									}
								}
							}
						}
					})
				};
				_charts.push(chartObject);
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

