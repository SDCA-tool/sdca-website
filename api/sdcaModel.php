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
		
		# Determine buffer distance for each feature
		$bufferDistances = $this->bufferDistances ($geojson['features']);
		
		# Set error handler to catch desire_lines retrieval that is over-memory; see: https://stackoverflow.com/a/8440791
		register_shutdown_function (function () {
			$error = error_get_last ();
			if ($error !== NULL) {
				$response = array ('error' => 'The proposed intervention is too large for us to calculate at present during the development phase of this system. Is it possible for you try a smaller intervention?');
				
				# Send the error; this broadly matches error in the main class, but the stack trace is lost by this point
				http_response_code (408);
				header ('Access-Control-Allow-Origin: *');
				header ('Content-Type: application/json');
				echo json_encode ($response, JSON_PRETTY_PRINT|JSON_UNESCAPED_UNICODE|JSON_UNESCAPED_SLASHES);
				exit;
			}
		});
		
		# Values for desire_lines
		#!# The UNION here could be replaced by using ST_COLLECT and/or ST_Union as used elsewhere in this file and as per https://gis.stackexchange.com/a/114203/58752
		$queryParts = array ();
		$preparedStatementValues = array ();
		foreach ($geojson['features'] as $index => $feature) {
			$queryParts[] = "
				SELECT
					ST_AsGeoJSON(geometry) AS geometry,
					\"from\", \"to\", cycle, drive, passenger, walk, rail, bus, lgv, hgv
				FROM desire_lines
				WHERE ST_Intersects( geometry, ST_Buffer( ST_GeomFromGeoJSON(:geometry{$index}), {$bufferDistances[$index]}) )
			";
			$preparedStatementValues["geometry{$index}"] = json_encode ($feature['geometry']);
		}
		$query = implode (' UNION ', $queryParts) . ';';
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
		#!# JSON_NUMERIC_CHECK is used as a workaround because PostgreSQL is returning strings for floats; see: https://stackoverflow.com/questions/71198679/
		$json['desire_lines'] = array (json_encode ($desire_lines, JSON_UNESCAPED_SLASHES | JSON_UNESCAPED_UNICODE | JSON_NUMERIC_CHECK));
		
		# Values for raster files
		$json['path_dem'] = '/var/www/sdca/data/dem/UKdem.tif';
		$json['path_landcover'] = '/var/www/sdca/data/landcover/landcover.tif';
		$json['path_bedrock'] = '/var/www/sdca/data/bedrock_raster/bedrock.tif';
		$json['path_superficial'] = '/var/www/sdca/data/superficial_raster/superficial.tif';
		
		# Values for material_sites
		# "The logic is st_centroid(user_input) then find the nearest location for each material_sites. Material_Types (there are 11 types of site). Then measure the straight line distance between the centroid and the 11 sites in km."
		#!# Needs tests - has been checked manually for now
		#!# Would ideally retrieve the site to help testing, but this has the groupwise problem which is hard to solve on a derived distance value
		# Firstly, determine the centroid
		#!# Disaggregation of features done at: https://gis.stackexchange.com/a/114203/58752
		$centroidQuery = "
			WITH
				source AS ( SELECT :geometry::json AS json ),
				geom AS ( SELECT ST_GeomFromGeoJSON((json_array_elements(json->'features')->'geometry')::text) AS g FROM source )
			SELECT ST_AsGeoJSON(ST_Centroid(ST_Union(g)))::json AS centroid
			FROM geom
		;";
		$preparedStatementValues = array ('geometry' => json_encode ($geojson));
		$centroidJsonString = $this->databaseConnection->getOneField ($centroidQuery, 'centroid', $preparedStatementValues);
		
		# Get the distance; see: https://www.alibabacloud.com/blog/597328
		$query = '
			SELECT "Material_Types", MIN(distance_km) AS distance_km
			FROM (
				SELECT
					id,
					site,
					material_types AS "Material_Types",
					(ST_DistanceSpheroid (ST_GeomFromGeoJSON (:centroid), geometry, \'SPHEROID["WGS84",6378137,298.257223563]\') / 1000) AS distance_km		-- See: https://www.alibabacloud.com/blog/597328
				FROM materialsites
				ORDER BY Material_Types, distance_km
			) AS distances
			GROUP BY "Material_Types"
			ORDER BY "Material_Types"
		;';
		$preparedStatementValues = array ('centroid' => $centroidJsonString);
		$json['material_sites'] = $this->databaseConnection->getData ($query, false, true, $preparedStatementValues);
		
		# Construct as string
		#!# JSON_NUMERIC_CHECK is used as a workaround because PostgreSQL is returning strings for floats; see: https://stackoverflow.com/questions/71198679/
		$stdin = json_encode ($json, JSON_PRETTY_PRINT | JSON_UNESCAPED_SLASHES | JSON_UNESCAPED_UNICODE | JSON_NUMERIC_CHECK);
		
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
	
	
	# Function to determine the buffer distance for each feature
	private function bufferDistances ($features)
	{
			# Get length of each feature
			$lengthsKm = array ();
			foreach ($features as $index => $feature) {
				$query = "SELECT ST_LengthSpheroid(geom, 'SPHEROID[\"WGS 84\",6378137,298.257223563]') / 1000 AS length FROM ST_GeomFromGeoJSON(:geometry) AS geom;";	// See: https://gis.stackexchange.com/a/170828/58752
				$preparedStatementValues = array ('geometry' => json_encode ($feature['geometry']));
				$lengthsKm[$index] = $this->databaseConnection->getOneField ($query, 'length', $preparedStatementValues);
			}
			
			# Determine buffer distance for each feature
			$bufferLengthFraction = 5;		// Buffer size fraction, i.e. 1/n, of the line length
			$bufferLengthMinimumKm = 3;		// Buffer size minimum
			define ('KM_TO_DEGREES', 0.02);		// UK-specific estimate
			$bufferDistances = array ();
			foreach ($lengthsKm as $featureIndex => $lengthKm) {
				
				# The buffer distance should be the stated fraction of the length of the infrastructure (subject to the minimum), then convert from kilometres to degrees
				$bufferDistances[$featureIndex] = max ( ($lengthKm / $bufferLengthFraction), $bufferLengthMinimumKm) * KM_TO_DEGREES;
			}
			
			# Return the buffer distances
			return $bufferDistances;
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
