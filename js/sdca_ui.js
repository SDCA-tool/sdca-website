// SDCA implementation code

/*jslint browser: true, white: true, single: true, for: true, unordered: true, long: true */
/*global $, alert, console, window, osm2geo, layerviewer, jQuery */

var sdcaui = (function ($) {

	'use strict';

	var _sdcaPanelContainerId = 'sdca-panel-container'; // where the SDCA panels will be shown
	var _sdcaPanelContainer = false; // Store the jQuery object of the container 
	var _previousSdcaPanelHtml = ''; // Store the previous panel HTML (used for back)
	var _defaultSdcaPanelId = '#design-scheme'; // Default panel to show at launch

	return {

		// Public functions

		// Main function
		initialise: function () {
			sdcaui.panels();
			sdcaui.dataLayerPanel();
			sdcaui.buttons();
		},

		// Enable panels
		panels: function () {
			// Locate and save the target div we will be populating with panels
			_sdcaPanelContainer = $('#' + _sdcaPanelContainerId);
			if (!_sdcaPanelContainerId) {
				console.log('Could not find a container');
			}

			// Hide all panels except the first one
			$('.sdca-panel').hide();

			// Populate the default panel
			$(_sdcaPanelContainer).html(
				$(_defaultSdcaPanelId).html()
			);
		},
		
		
		// Clicking a button or a with data-sdca-target-panel switches to that panel
		buttons: function () {
			$('body').on('click', 'button, a', function (event) {

				event.preventDefault();

				// If we are saving the previous HTML in memory, do it
				if ($(this).data('save-html') == true) {
					_previousSdcaPanelHtml = $(_sdcaPanelContainer).html();
				}

				// If there's a target panel, load that
				if ($(this).data('sdca-target-panel')) {
					var targetPanelId = $(this).data('sdca-target-panel');
					var targetPanelHtml = $(targetPanelId).html();
					$(_sdcaPanelContainer).html(targetPanelHtml);
				}

				// If we should load saved html, do that
				if ($(this).data('load-saved-html') == true) {
					$(_sdcaPanelContainer).html(_previousSdcaPanelHtml);
				}
			});
		},
		
		
		dataLayerPanel: function () {
			// At launch, hide data layers panel
			$('#data-layers-panel').hide();
		}
	};

}(jQuery));

