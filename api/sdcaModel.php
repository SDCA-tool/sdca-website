<?php

# SDCA model
class sdcaModel
{
	# Class properties
	private $tablePrefix = false;


	# Constructor
	public function __construct ($bbox, $zoom, $get)
	{
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
	#!# Currently just an example
	public function locationsModelProcessing ($data)
	{
		# Example - Get each LSOA
		$lsoas = array ();
		foreach ($data as $row) {
			$lsoas[] = $row['lsoa11'];
		}
		$parameter = implode (',', $lsoas);
		
		#!# For now, mock with the sample data, pending implementation of the lookups
		$parameter = file_get_contents ($_SERVER['DOCUMENT_ROOT'] . '/lexicon/example_r_input.json');
		$parameter = str_replace ('D:/GitHub/SDCA-tool/sdca-data-prep/data/UKdem.tif', '/var/www/sdca/data/dem/UKdem.tif', $parameter);
		$parameter = str_replace ('D:/GitHub/SDCA-tool/sdca-data-prep/data/landcover.tif', '/var/www/sdca/data/landcover/landcover.tif', $parameter);
		$mockDataJson = json_decode ($parameter, true);
		
		# Construct the JSON to be sent to the API
		$json = array ();
		
		# Values for user_input
		$json['user_input'] = $mockDataJson['user_input'];
		
		# Values for intervention_assets
		$json['intervention_assets'] = $mockDataJson['intervention_assets'];
		
		# Values for intervention_assets_parameters
		$json['intervention_assets_parameters'] = $mockDataJson['intervention_assets_parameters'];
		
		# Values for asset_components
		$json['asset_components'] = $mockDataJson['asset_components'];
		
		# Values for carbon_factors
		$json['carbon_factors'] = $mockDataJson['carbon_factors'];
		
		# Values for desire_lines
		$json['desire_lines'] = $mockDataJson['desire_lines'];
		
		# Value for path_dem file
		$json['path_dem'] = $mockDataJson['path_dem'];
		
		# Value for path_landcover file
		$json['path_landcover'] = $mockDataJson['path_landcover'];
		
		# Values for material_sites
		$json['material_sites'] = $mockDataJson['material_sites'];
		
		# Construct as string
		$stdin = json_encode ($json);
		
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
