// SDCA implementation code

/*jslint browser: true, white: true, single: true, for: true, unordered: true, long: true */
/*global $, alert, console, window, osm2geo, layerviewer, jQuery */

var sdcaui = (function ($) {

	'use strict';
	
	// Panel state control; this has a main panel state (design-scheme/view-results), but the data-layers screen can temporarily displace the main state
	var _panels = ['data-layers', 'design-scheme', 'view-results'];
	var _actualCurrentPanel = 'design-scheme';		// The panel actually in place
	var _currentMainPanel = 'design-scheme';	// The main panel currently, even if temporarily overriden
	var _previousMainPanel = false;				// The main panel previously
	
	
	return {

		// Public functions

		// Main function
		initialise: function ()
		{
			// Manage panels
			sdcaui.managePanels ();
		},
		
		
		// Panel management
		managePanels: function ()
		{
			// Data layers toggle
			$('button#explore-data-layers').click (function () {
				if (_actualCurrentPanel == 'data-layers') {	// I.e. clicked again as implied toggle-off
					sdcaui.switchPanel (_currentMainPanel, true);
				} else {
					sdcaui.switchPanel ('data-layers', true);
				}
			});
			
			// Data layers back button
			$('#data-layers .govuk-back-link').click (function () {
				sdcaui.switchPanel (_currentMainPanel, true);
			});
			
			// Calculate button
			$('button#calculate').click (function () {
				sdcaui.switchPanel ('view-results');
			});
			
			// Back to the design button
			$('#view-results .govuk-back-link').click (function () {
				sdcaui.switchPanel ('design-scheme');
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
		}
	};

}(jQuery));
