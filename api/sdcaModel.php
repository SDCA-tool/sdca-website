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
			'table' => $this->tablePrefix . 'carbon_full',
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
		
		# Provide base data to calculation script
		$command = '/var/www/sdca/sdca-package/test.R' . ' ' . $parameter;
		$result = exec ($command);
		$result = (int) $result;
		
		# Return the result
		return array ('result' => $result);
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
