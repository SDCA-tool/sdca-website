<?php

# SDCA model
class sdcaModel
{
	# Class properties
	private $tablePrefix = false;


	# Constructor
	public function __construct ($databaseConnection, $settings, $bbox, $zoom, $get)
	{
		# Property handles
		$this->databaseConnection = $databaseConnection;
		$this->settings = $settings;
		
		# Set values provided by the API
		$this->bbox = $bbox;	// Validated
		$this->zoom = $zoom;	// Validated
		$this->get = $get;		// Unvalidated contents of $_GET, i.e. query string values

	}


	# Beta mode
	public function enableBetaMode ()
	{
		$this->tablePrefix = 'alt_';
	}


	/*
	# Example model
	public function exampleModel (&$error = false)
	{
		// Logic assembles the values returned below
		// ...

		# Return the model
		return array (
			'table' => 'table',
			'fields' => $fields,			// Fields to retrieve
			'constraints' => $constraints,	// Database constraints
			'parameters' => $parameters,	// Parameters, e.g. :w for bbox west
			'limit' => $limit,				// Limit of data returned
		);
	}
	*/


	# Processing function for locations model
	public function locationsModel (&$error = false)
	{
		#!# Switch to POST
		
		# Ensure data supplied
		if (!isSet ($_GET['geojson']) || !strlen ($_GET['geojson'])) {
			return array ('error' => 'No scheme data supplied.');
		}
		
		# Obtain the user input
		if (!($geojson = json_decode ($_GET['geojson'], true)) || !$this->validGeojson ($geojson)) {
			return array ('error' => 'Invalid geographical data supplied.');
		}
		
		# Construct the JSON to be sent to the API; see example_r_input.json
		$json = array ();
		
		# Value for user_input
		$json['user_input'] = json_encode ($geojson);
		
		# Values for assets
		$interventions = array ();
		foreach ($geojson['features'] as $intervention) {
			$interventions[] = $intervention['properties']['intervention'];
		}
		$interventions = array_unique ($interventions);
		$assets = $this->databaseConnection->select ($this->settings['database'], 'assets', array ('intervention' => $interventions));
		$json['assets'] = $assets;
		
		# Extract the asset IDs ('asset' key) in the assets data to a simple list
		$assetIds = array ();
		foreach ($assets as $asset) {
			$assetIds[] = $asset['asset'];
		}
		$assetIds = array_unique ($assetIds);
		
		# Values for assets_parameters
		$assets_parameters = $this->databaseConnection->select ($this->settings['database'], 'assets_parameters', array ('asset' => $assetIds), array (), true, 'asset,parameter');
		$json['assets_parameters'] = $assets_parameters;
		
		# Values for components
		$components = $this->databaseConnection->select ($this->settings['database'], 'components', array ('asset' => $assetIds));
		$json['components'] = $components;
		
		# Extract the cf_names in the components data to a simple list
		$cf_names = array ();
		foreach ($components as $component) {
			$cf_names[] = $component['cf_name'];
		}
		$cf_names = array_unique ($cf_names);
		
		# Values for carbon_factors
		$carbon_factors = $this->databaseConnection->select ($this->settings['database'], 'carbon_factors', array ('cf_name' => $cf_names));
		$json['carbon_factors'] = $carbon_factors;
		
		# Values for desire_lines
		#!# MySQL 8.0 does not yet have geometry support in ST_Buffer ("#3618 - st_buffer(LINESTRING) has not been implemented for geographic spatial reference systems."), so both the data and the supplied geography have been converted to SRID = 0 as initial prototype
		#!# Buffer size of 0.02 degrees has been used as an approximation to 2000m, but this needs to be implemented properly
		$query = "
			SELECT
				ST_AsGeoJSON(geometrySrid0) AS geometry,
				`from`, `to`, cycle, drive, passenger, walk, rail, bus, lgv, hgv
			FROM desire_lines
			WHERE ST_Intersects( geometrySrid0, ST_Buffer( ST_GeomFromGeoJSON(:geometry, 1, 0), 0.02) );
		;";
		$preparedStatementValues = array ('geometry' => json_encode ($geojson));
		$desire_linesRaw = $this->databaseConnection->getData ($query, false, true, $preparedStatementValues);
		$desire_lines = array ('type' => 'FeatureCollection', 'features' => array ());
		foreach ($desire_linesRaw as $row) {
			$geometry = $row['geometry'];
			unset ($row['geometry']);
			$desire_lines['features'][] = array (
					'type' => 'Feature',
					'properties' => $row,
					'geometry' => json_decode ($geometry),
			);
		}
		$json['desire_lines'] = array (json_encode ($desire_lines));
		
		# Values for raster files
		$json['path_dem'] = '/var/www/sdca/data/dem/UKdem.tif';
		$json['path_landcover'] = '/var/www/sdca/data/landcover/landcover.tif';
		$json['path_bedrock'] = '/var/www/sdca/data/bedrock_raster/bedrock.tif';
		$json['path_superficial'] = '/var/www/sdca/data/superficial_raster/superficial.tif';
		
		# Values for material_sites
		# "The logic is st_centroid(user_input) then find the nearest location for each material_sites. Material_Types (there are 11 types of site). Then measure the straight line distance between the centroid and the 11 sites in km."
		#!# Needs tests - has been checked manually for now
		#!# Would ideally retrieve the site to help testing, but this has the groupwise problem which is hard to solve on a derived distance value
		#!# MySQL 8.0 does not yet have geometry support in ST_Centroid, however the casting from 0 to 4326 should be a reasonable approximation - centroid here is "ST_GeomFromGeoJSON(ST_AsGeoJSON( ST_Centroid(ST_GeomFromGeoJSON(:geometry, 1, 0)) ), 1, 4326)"
		$query = "
			SELECT Material_Types, MIN(distance_km) AS distance_km
			FROM (
				SELECT
					id,
					site,
					material_types AS Material_Types,
					(ST_Distance( ST_GeomFromGeoJSON(ST_AsGeoJSON( ST_Centroid(ST_GeomFromGeoJSON(:geometry, 1, 0)) ), 1, 4326), geometry) / 1000) AS distance_km
				FROM materialsites
				ORDER BY material_types,distance_km
			) AS distances
			GROUP BY material_types
			ORDER BY material_types
		;";
		$preparedStatementValues = array ('geometry' => json_encode ($geojson));
		$json['material_sites'] = $this->databaseConnection->getData ($query, false, true, $preparedStatementValues);
		
		# Construct as string
		$stdin = json_encode ($json, JSON_PRETTY_PRINT | JSON_UNESCAPED_SLASHES | JSON_UNESCAPED_UNICODE);
		
		# Show input to the package if required
		#!# Temporary option - to be removed after debugging
		if (isSet ($_GET['showinput']) && $_GET['showinput'] == 'true') {echo $stdin; die;}
		
		# Provide base data to calculation script
		$command = $_SERVER['DOCUMENT_ROOT'] . '/api/sdca.R';
		$result = $this->createProcess ($command, $stdin);
		$result = json_decode ($result, true);
		
		# Return the result
		return $result;
	}
	
	
	# Function to check GeoJSON validity
	private function validGeojson ($geojson)
	{
		# Perform basic checks on GeoJSON structure
		if (
			   !isSet ($geojson['type'])
			|| !isSet ($geojson['features'])
			|| !is_array ($geojson['features'])
		) {
			return false;
		}
		
		# Perform basic checks on features
		foreach ($geojson['features'] as $feature) {
			if (
				   !isSet ($feature['type'])
				|| !isSet ($feature['properties'])
				|| !is_array ($feature['properties'])
				|| !isSet ($feature['geometry'])
				|| !is_array ($feature['geometry'])
				|| !isSet ($feature['geometry']['type'])
				|| !isSet ($feature['geometry']['coordinates'])
				|| !is_array ($feature['geometry']['coordinates'])
			) {
				return false;
			}
		}
		
		# No problems
		return true;
	}
	
	
	# Function to handle running a command process securely without writing out any files
	public static function createProcess ($command, $string)
	{
		# Set the descriptors
		$descriptorspec = array (
			0 => array ('pipe', 'r'),  // stdin is a pipe that the child will read from
			1 => array ('pipe', 'w'),  // stdout is a pipe that the child will write to
			//2 => array ('file', '/tmp/error-output.txt', 'a'), // stderr is a file to write to - uncomment this line for debugging
		);
		
		# Assume failure unless the command works
		$returnStatus = 1;
		
		# Create the process
		$command = str_replace ("\r\n", "\n", $command);	// Standardise to Unix newlines
		$process = proc_open ($command, $descriptorspec, $pipes);
		if (is_resource ($process)) {
			fwrite ($pipes[0], $string);
			fclose ($pipes[0]);
			$output = stream_get_contents ($pipes[1]);
			fclose ($pipes[1]);
			$returnStatus = proc_close ($process);
		}
		
		# Return false as the output if the return status is a failure
		if ($returnStatus) {return false;}	// Unix return status >0 is failure
		
		# Return the output
		return $output;
	}
	
	
	# Documentation
	public static function locationsDocumentation ()
	{
		return array (
			'name' => 'Locations',
			'example' => '/api/v1/locations.json?bbox=-2.6404,51.4698,-2.5417,51.4926&zoom=15',
			'fields' => array (
				'bbox' => '%bbox',
				'zoom' => '%zoom',
			),
		);
	}
}

?>
