<?php

# API transport class, which returns data from the model
class api
{
	# Class properties
	private $databaseConnection;
	
	# Supported formats
	private $formats = array ('json', 'geojson', 'csv');
	
	
	# Defaults
	private function defaults ()
	{
		return array (
			'hostname' => 'localhost',
			'username' => 'sdca',
			'password' => trim (file_get_contents ('/home/sdca/mysqlpassword')),
			'database' => 'sdca',
		);
	}
	
	
	# Constructor
	public function __construct ()
	{
		# Load settings
		$this->settings = $this->defaults ();
		
		# Load subclass
		require_once ('./sdcaModel.php');
		
		# Documentation page
		if (isSet ($_GET['action']) && $_GET['action'] == 'documentation') {
			return $this->documentation ();
		}
		
		# Connect to the database
		try {
			$this->databaseConnection = new PDO ("mysql:host={$this->settings['hostname']};dbname={$this->settings['database']}", $this->settings['username'], $this->settings['password']);
			$this->databaseConnection->setAttribute (PDO::ATTR_ERRMODE, PDO::ERRMODE_EXCEPTION);
			$this->databaseConnection->setAttribute (PDO::ATTR_DEFAULT_FETCH_MODE, PDO::FETCH_ASSOC);
		} catch (PDOException $e) {
			// var_dump ($e->getMessage (), $query);
			return $this->error ('Unable to connect to the database.');
		}
		
		# Ensure a valid format has been supplied
		$format = $this->getFormat ($error);
		if ($error) {
			return $this->error ($error);
		}
		
		# Obtain the BBOX and pass to the model
		$bbox = ($this->getBbox ($error));
		if ($error) {
			return $this->error ($error);
		}
		
		# Get the zoom
		$zoom = ($this->getZoom ($error));
		if ($error) {
			return $this->error ($error);
		}
		
		# Load the model, passing in API parameters
		$this->sdcaModel = new sdcaModel ($bbox, $zoom, $_GET);
		
		# Ensure a valid action has been supplied
		$method = $this->getMethod ($error);
		if ($error) {
			return $this->error ($error);
		}
		
		# Set beta if required
		if (isSet ($_GET['beta']) && $_GET['beta'] == '1') {
			$this->sdcaModel->enableBetaMode ();
		}
		
		# Get the model
		$model = $this->sdcaModel->{$method} ($error);		// e.g. $this->sdcaModel->example ($error)
		if ($error) {
			return $this->error ($error);
		}
		// var_dump ($model);
		
		# Get the data
		if (isSet ($model['query'])) {
			$data = $this->getData ($model['query']);
		} else {
			$data = $this->select ($model['table'], $model['fields'], $model['constraints'], $model['limit'], $model['parameters'], $error);
		}
		if ($error) {
			return $this->error ($error);
		}
		
		# Determine if a singular result should be returned; currently only supported for getData()
		$singular = (isSet ($model['singular']) && $model['singular']);
		if ($singular) {
			$data = $data[0];
		}
		
		# Post-process the data if required
		$postProcessingMethod = $method . 'Processing';
		if (method_exists ($this->sdcaModel, $postProcessingMethod)) {
			$data = $this->sdcaModel->{$postProcessingMethod} ($data);
		}
		
		# If the model specifies an output format, use that
		if (isSet ($model['format'])) {
			$format = $model['format'];
		}
		
		# Output the data
		switch ($format) {
			
			# GeoJSON (API)
			case 'json':
				$geojson = $this->asGeojson ($data);
				return $this->responseJson ($geojson);
				break;
				
			# GeoJSON (export)
			case 'geojson':
				$geojson = $this->asGeojson ($data);
				return $this->responseJson ($geojson, $_GET['action'] . '.geojson');	// NB $_GET['action'] is validated by this point
				break;
				
			# Flat JSON
			case 'flatjson':
				return $this->responseJson ($data);
				
			# CSV
			case 'csv':
				$csv = $this->asCsv ($data);
				return $this->responseCsv ($csv, $_GET['action']);
				break;
		}
	}
	
	
	# Documentation page
	public function documentation ()
	{
		# Start the HTML
		$html = "\n
			<style type=\"text/css\">
				body {max-width: 1000px; margin: 0 auto; font-family: arial;}
				div.apicall {border-top: 1px solid gray; padding: 20px 0; margin-bottom: 20px;}
				h1 {margin: 1.5em 0 1em;}
				h2 a {font-size: 0.6em; color: #ccc; text-decoration: none; font-weight: normal;}
				dl dt {margin-top: 1.2em; margin-bottom: 0.5em;}
				dl dt tt {margin-left: 0.5em; font-style: italic;}
				.example {padding: 10px 10px 10px 15px; background-color: #eee;}
				.example p:first-child {text-transform: uppercase; float: right; padding: 0; margin: 0; color: #999; font-size: 0.74em;}
			</style>
		";
		
		$html .= "\n<h1>SDCA API documentation</h1>";
		$html .= "\n<p>Welcome to the API for the SDCA project.</p>";
		$html .= "\n<p>Please note that this API is subject to change without notice.</p>";
		$html .= "\n<p>Use <tt>.json</tt> to return GeoJSON, or <tt>.csv</tt> (or <tt>.json</tt> with <tt>&amp;format=csv</tt>) to return CSV. The examples below use the GeoJSON output format.</p>";
		
		# Load the class
		$sdcaModel = new sdcaModel (NULL, NULL, $_GET);
		
		# Determine the documentation methods in the class
		$apiCalls = array ();
		$methods = get_class_methods ($sdcaModel);
		foreach ($methods as $method) {
			if (preg_match ('/^([a-z]+)Documentation$/', $method, $matches)) {
				$apiCall = $matches[1];
				$apiCalls[$apiCall] = $method;
			}
		}
		
		# Load the specifications
		$specifications = array ();
		foreach ($apiCalls as $apiCall => $method) {
			$specifications[$apiCall] = $sdcaModel->{$method} ();
		}
		
		# Define standard fields
		$standardFields = array (
			'bbox' => array (
				'type' => 'string',
				'values' => 'w,s,e,n',
				'description' => 'Bounding box of the map canvas.',
			),
			'zoom' => array (
				'type' => 'int',
				'description' => 'Zoom level of the map.',
			),
		);
		
		# Substitute standard field specification details
		foreach ($specifications as $apiCall => $method) {
			foreach ($method['fields'] as $field => $attributes) {
				if (isSet ($standardFields[$field])) {
					$specifications[$apiCall]['fields'][$field] = $standardFields[$field];
				}
			}
		}
		
		# Add jump list
		$html .= "\n<p>Jump to:</p>";
		$html .= "\n<ul>";
		foreach ($specifications as $apiCall => $method) {
			$html .= "\n\t<li><a href=\"#{$apiCall}\">" . htmlspecialchars ($method['name']) . '</a></li>';
		}
		$html .= "\n</ul>";
		
		# Add each documentation block
		foreach ($specifications as $apiCall => $method) {
			$html .= "
				<div class=\"apicall\">
					<h2 id=\"{$apiCall}\"><a href=\"#{$apiCall}\">#</a> " . htmlspecialchars ($method['name']) . "</h2>
					<p><pre>/v1/{$apiCall}.json</pre></p>
					<div class=\"example\">
						<p>Example</p>
						<p><a href=\"" . htmlspecialchars ($method['example']) . '">' . htmlspecialchars ($method['example']) . "</a></p>
					</div>
					<h3>Required fields</h3>
			";
			if ($method['fields']) {
				$html .= "\n<dl>";
				foreach ($method['fields'] as $field => $attributes) {
					$html .= "
						<dt>{$field} <tt>" . htmlspecialchars ($attributes['type']) . (isSet ($attributes['values']) ? ', ' . htmlspecialchars ($attributes['values']) : '') . "</tt></dt>
							<dd>" . htmlspecialchars ($attributes['description']) . "</dd>
					";
				}
				$html .= "\n</dl>";
			} else {
				$html .= "\n<p>None.</p>";
			}
			$html .= "\n</div>";
		}
		
		# Show the HTML
		echo $html;
	}
	
	
	# Function to validate the API call
	private function getMethod (&$error = false)
	{
		# Ensure an action is specified
		if (!isSet ($_GET['action']) || !strlen ($_GET['action'])) {
			$error = 'No API call was specified.';
			return false;
		}
		
		# Ensure the API call is a supported model
		$function = $_GET['action'] . 'Model';
		if (!method_exists ($this->sdcaModel, $function)) {
			$error = 'An invalid API call was specified.';
			return false;
		}
		
		# Return the validated class method
		return $function;
	}
	
	
	# Function to validate the API request format
	private function getFormat (&$error = false)
	{
		# Ensure an action is specified
		if (!isSet ($_GET['format']) || !strlen ($_GET['format'])) {
			$error = 'No API format was specified.';
			return false;
		}
		$format = $_GET['format'];
		
		# Ensure the API call is a supported model
		if (!in_array ($format, $this->formats)) {
			$error = 'An invalid API format was specified.';
			return false;
		}
		
		# Return the validated format
		return $format;
	}
	
	
	# Helper function to get the BBOX
	private function getBbox (&$error = false)
	{
		# Get the data from the query string
		$bboxString = (isSet ($_GET['bbox']) ? $_GET['bbox'] : NULL);
		
		# Check BBOX is Provided
		if (!$bboxString) {
			$error = 'No bbox was supplied.';
			return false;
		}
		
		# Ensure four values
		if (substr_count ($bboxString, ',') != 3) {
			$error = 'An invalid bbox was supplied.';
			return false;
		}
		
		# Assemble the parameters
		$bbox = array ();
		list ($bbox['w'], $bbox['s'], $bbox['e'], $bbox['n']) = explode (',', $bboxString);
		
		# Ensure valid values
		foreach ($bbox as $key => $value) {
			if (!is_numeric ($value)) {
				$error = 'An invalid bbox was supplied.';
				return false;
			}
		}
		
		# Return the collection
		return $bbox;
	}
	
	
	# Helper function to get the zoom
	private function getZoom (&$error = false)
	{
		# Check zoom is Provided
		$zoom = (isSet ($_GET['zoom']) ? $_GET['zoom'] : '');
		if (!$zoom) {
			$error = 'No zoom was supplied.';
			return false;
		}
		
		# Check zoom is valid
		if (!is_numeric ($zoom)){
			$error = 'An invalid zoom was supplied.';
			return false;
		}
		
		# Return the zoom
		return $zoom;
	}
	
	
	# Database select wrapper
	private function select ($table, $fields, $where, $limit, $parameters, &$error = false)
	{
		# Assemble the query
		$query = '
			SELECT ' . implode (', ', $fields) . '
			FROM ' . $table . '
			' . ($where ? 'WHERE ' . implode (' AND ', $where) : '') . '
			' . ($limit ? "LIMIT {$limit}" : '') . '
		;';
		
		# Get the data
		$data = $this->getData ($query, $parameters, $error);
		if ($error) {
			// $error will now be set
			return false;
		}
		
		# Return the data
		return $data;
	}
	
	
	# Database function to get data
	private function getData ($query, $parameters = array (), &$error = false)
	{
		# Prepare the statement and bind parameters
		try {
			$preparedStatement = $this->databaseConnection->prepare ($query);
			$preparedStatement->execute ($parameters);
			
			# Get the data
			$data = array ();
			if ($preparedStatement->execute ()) {
				$data = $preparedStatement->fetchAll ();
			}
			
		} catch (PDOException $e) {
			// var_dump ($e->getMessage (), $query, $parameters);
			$error = 'An invalid query was sent to the database.';
			return false;
		}
		
		# Return the data
		return $data;
	}
	
	
	# Function to convert to GeoJSON
	private function asGeojson ($data)
	{
		# Format the output as GeoJSON
		$geojson = array ();
		$geojson['type'] = 'FeatureCollection';
		$geojson['features'] = array ();
		foreach ($data as $row) {
			$properties = $row;
			unset ($properties['geometry']);
			$geojson['features'][] = array (
				'type' => 'Feature',
				'geometry' => json_decode ($row['geometry'], true),
				'properties' => $properties,
			);
		}
		
		# Return the GeoJSON array structure
		return $geojson;
	}
	
	
	# Error response
	private function error ($string)
	{
		# Assemble and return the error
		$data = array ('error' => $string);
		return $this->responseJson ($data);
	}
	
	
	# Function to transmit data as JSON
	private function responseJson ($jsonArray, $downloadFile = false /* or filename */)
	{
		# Allow any client to connect, and permit on localhost
		header ('Access-Control-Allow-Origin: *');
		
		# If forcing as a download, send the header
		if ($downloadFile) {
			header ('Content-disposition: attachment; filename=' . $downloadFile);
		}
		
		# Send the response, encoded as JSON
		header ('Content-Type: application/json');
		echo json_encode ($jsonArray, JSON_UNESCAPED_UNICODE|JSON_UNESCAPED_SLASHES);
	}
	
	
	# Function to convert a multi-dimensional keyed array to a CSV
	public static function asCsv ($data)
	{
		# Create the headers
		$headers = array ();
		foreach ($data as $line => $values) {
			foreach ($values as $key => $value) {
				$headers[] = $key;
			}
			$headersLine = implode (',', $headers);
			break;	// First row of data is enough
		}
		
		# Start the CSV with the headers
		$csv = array ();
		$csv[] = $headersLine;
		
		# Convert the array into an array of data strings, one array item per row
		foreach ($data as $line => $values) {
			$csvLine = array ();
			foreach ($values as $key => $value) {
				if (substr_count ($value, '"')) {
					$value = '"' . str_replace ('"', '""', $value) . '"';
				}
				$csvLine[] = $value;
			}
			$csv[] = implode (',', $csvLine);
		}
		
		# Compile the CSV lines (each of which will end with a newline already)
		$csvString = implode ("\n", $csv);
		
		# Return the CSV data
		return $csvString;
	}
	
	
	# Function to transmit data as CSV
	private function responseCsv ($csvString, $filenameBase)
	{
		# Construct the filename
		$filenameBase .= '_savedAt' . date ('Ymd-His');
		$filename = $filenameBase . '.csv';
		
		# Publish, by sending a header and then echoing the data
		header ('Content-type: application/octet-stream');
		header ('Content-Disposition: attachment; filename="' . $filename . '"');
		
		# Send the response
		echo $csvString;
	}
}

?>
