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


	# Data for locations test
	public function locationsModel (&$error = false)
	{
		# Get the line
		if (!isSet ($_GET['line']) || !strlen ($_GET['line'])) {
			$error = 'No line supplied';
			return false;
		}
		
		# Base values
		$fields = array (
			'lsoa11',
			//'ST_AsGeoJSON(geometry, 5) AS geometry',
		);
		$constraints = array (
			'ST_Intersects(ST_GeomFromGeoJSON(:line), geometry)'
		);
		$parameters = array (
			'line' => '{"type": "LineString", "coordinates": ' . $_GET['line'] . '}',
		);
		$limit = false;
		
		# Return the model
		return array (
			'table' => $this->tablePrefix . 'carbon',
			'fields' => $fields,
			'constraints' => $constraints,
			'parameters' => $parameters,
			'limit' => $limit,
			'format' => 'flatjson',
		);
	}
	
	
	# Processing function for locations model
	public function locationsModelProcessing ($data)
	{
		# Mock the user input, which is a feature collection
		$input = array (
			'type' => 'FeatureCollection',
			'features' => array (
				array (
					'type' => 'Feature',
					'properties' => array (
						'infrastructure_type' => 'transport',
						'mode_class' => 'Rail',
						'mode' => 'High speed rail',
						'intervention_class' => 'New construction',
						'intervention' => 'Viaduct',
					),
					'geometry' => json_decode ('{"type": "LineString", "coordinates": ' . $_GET['line'] . '}'),
				),
/*
				array (
					'type' => 'Feature',
					'properties' => array (
						'infrastructure_type' => 'transport',
						'mode_class' => 'Rail',
						'mode' => 'High speed rail',
						'intervention_class' => 'New construction',
						'intervention' => 'Viaduct',
					),
					'geometry' => json_decode ('{"type": "LineString", "coordinates": [[-2.621440887451172,51.443950667096615],[-2.6061630249023438,51.43367817535588]]}', true),
				),
				array (
					'type' => 'Feature',
					'properties' => array (
						'infrastructure_type' => 'transport',
						'mode_class' => 'Rail',
						'mode' => 'High speed rail',
						'intervention_class' => 'New construction',
						'intervention' => 'Viaduct',
					),
					'geometry' => json_decode ('{"type": "LineString", "coordinates": [[-2.6071929931640625, 51.43453430457666],[-2.5865936279296875,51.443094714358566]]}', true),
				),
*/
			),
		);
		
		# Construct the JSON to be sent to the API; see example_r_input.json
		$json = array ();
		
		# Value for user_input
		$json['user_input'] = array (json_encode ($input));
		
		# Values for intervention_assets
		$interventions = array ();
		foreach ($input['features'] as $intervention) {
			$interventions[] = $intervention['properties']['intervention'];
		}
		$intervention_assets = $this->databaseConnection->select ($this->settings['database'], 'intervention_assets', array ('intervention' => $interventions));
		$json['intervention_assets'] = $intervention_assets;
		
		# Values for intervention_assets_parameters
		$assets = array ();
		foreach ($intervention_assets as $intervention_asset) {
			$assets[] = $intervention_asset['asset'];
		}
		$assets = array_unique ($assets);
		$intervention_assets_parameters = $this->databaseConnection->select ($this->settings['database'], 'intervention_assets_parameters', array ('asset' => $assets), array (), true, 'asset,parameter');
		$intervention_assets_parameters = array_unique ($intervention_assets_parameters, SORT_REGULAR);		// #!# Pending data cleanup to remove duplicate rows in intervention_assets_parameters
		$json['intervention_assets_parameters'] = $intervention_assets_parameters;
		
		# Values for asset_components
		$asset_components = $this->databaseConnection->select ($this->settings['database'], 'asset_components', array ('intervention_asset' => $assets));
		$json['asset_components'] = $asset_components;
		
		# Values for carbon_factors
		$cf_names = array ();
		foreach ($asset_components as $asset_component) {
			$cf_names[] = $asset_component['cf_name'];
		}
		$cf_names = array_unique ($cf_names);
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
			WHERE ST_Within( geometrySrid0, ST_Buffer( ST_GeomFromGeoJSON(:geometry, 1, 0), 0.02) );
		;";
		$preparedStatementValues = array ('geometry' => json_encode ($input));
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
		
		# Value for path_dem file
		$json['path_dem'] = '/var/www/sdca/data/dem/UKdem.tif';
		
		# Value for path_landcover file
		$json['path_landcover'] = '/var/www/sdca/data/landcover/landcover.tif';
		
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
		$preparedStatementValues = array ('geometry' => json_encode ($input));
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
